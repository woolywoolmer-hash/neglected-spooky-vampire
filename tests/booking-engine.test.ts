import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePrice,
  canManage,
  expandRecurrence,
  findConflicts,
  isoToLondonInput,
  londonInputToIso,
  validateBookingInput,
} from '../src/lib/booking-engine';
import type { Booking, BookingInput, Closure, Facility, Recurrence } from '../src/lib/types';

const facilities: Facility[] = [
  {
    id: 'jowett',
    name: 'Jowett Sports Hall',
    group: 'Indoor',
    parentId: null,
    color: 'blue',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 10,
    accessAfter: 10,
    active: true,
  },
  ...['astro-full', 'astro-a', 'astro-b'].map((id) => ({
    id,
    name: id,
    group: 'Astro',
    parentId: null,
    color: 'green',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 0,
    accessAfter: 0,
    active: true,
  })),
  {
    id: 'westfield',
    name: 'Westfield',
    group: 'Fields',
    parentId: null,
    color: 'green',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 0,
    accessAfter: 0,
    active: true,
  },
  {
    id: 'westfield-1',
    name: 'Westfield Pitch 1',
    group: 'Fields',
    parentId: 'westfield',
    color: 'green',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 0,
    accessAfter: 0,
    active: true,
  },
];
const candidate = (overrides: Partial<BookingInput> = {}): BookingInput => ({
  facilityId: 'jowett',
  start: '2026-11-02T18:00:00Z',
  end: '2026-11-02T19:00:00Z',
  title: 'Badminton',
  status: 'Confirmed',
  ...overrides,
});
const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'existing',
  facilityId: 'jowett',
  customerId: null,
  title: 'Existing booking',
  organisation: 'Test Organisation',
  contactName: 'Dummy Person',
  telephone: '',
  email: 'test@example.com',
  start: '2026-11-02T18:00:00Z',
  end: '2026-11-02T19:00:00Z',
  type: 'External Hirer',
  status: 'Confirmed',
  paymentStatus: 'Unpaid',
  attendees: 10,
  exVat: 3670,
  vat: 734,
  total: 4400,
  priceOverride: false,
  overrideReason: '',
  notes: '',
  accessRequirements: '',
  accessCode: '',
  bufferBefore: 0,
  bufferAfter: 0,
  accessBefore: 10,
  accessAfter: 10,
  seriesId: null,
  createdBy: 'Test Administrator',
  createdAt: '2026-11-01T12:00:00Z',
  modifiedBy: 'Test Administrator',
  modifiedAt: '2026-11-01T12:00:00Z',
  cancellationReason: '',
  conflictOverride: false,
  ...overrides,
});
const recurrence = (overrides: Partial<Recurrence> = {}): Recurrence => ({
  frequency: 'weekly',
  interval: 1,
  weekdays: [],
  until: '',
  count: 3,
  ...overrides,
});
const closure: Closure = {
  id: 'closure',
  facilityId: 'jowett',
  start: '2026-11-02T17:00:00Z',
  end: '2026-11-02T20:00:00Z',
  reason: 'Exams',
  notes: '',
  createdBy: 'Test Administrator',
};

test('overlapping actual timestamps conflict, including quarter-hour starts', () => {
  const conflicts = findConflicts(
    candidate({ start: '2026-11-02T18:15:00Z', end: '2026-11-02T19:15:00Z' }),
    [booking()],
    [],
    facilities
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].bookingId, 'existing');
});
test('overlap also detects an interval entirely containing another interval', () => {
  assert.equal(
    findConflicts(
      candidate({ start: '2026-11-02T17:00:00Z', end: '2026-11-02T20:00:00Z' }),
      [booking()],
      [],
      facilities
    ).length,
    1
  );
});
test('adjacent bookings are allowed when no facility buffers apply', () => {
  assert.deepEqual(
    findConflicts(
      candidate({ start: '2026-11-02T19:00:00Z', end: '2026-11-02T20:00:00Z' }),
      [booking()],
      [],
      facilities
    ),
    []
  );
  assert.deepEqual(
    findConflicts(
      candidate({ start: '2026-11-02T17:00:00Z', end: '2026-11-02T18:00:00Z' }),
      [booking()],
      [],
      facilities
    ),
    []
  );
});
test('Astro Half A and Half B can be reserved simultaneously', () => {
  assert.deepEqual(
    findConflicts(
      candidate({ facilityId: 'astro-a' }),
      [booking({ facilityId: 'astro-b' })],
      [],
      facilities
    ),
    []
  );
});
test('Astro Full conflicts with either half in both directions', () => {
  for (const half of ['astro-a', 'astro-b']) {
    assert.equal(
      findConflicts(
        candidate({ facilityId: 'astro-full' }),
        [booking({ facilityId: half })],
        [],
        facilities
      ).length,
      1
    );
    assert.equal(
      findConflicts(
        candidate({ facilityId: half }),
        [booking({ facilityId: 'astro-full' })],
        [],
        facilities
      ).length,
      1
    );
  }
});
test('cancelled bookings and enquiries do not reserve the facility', () => {
  for (const status of ['Cancelled', 'Enquiry'] as const) {
    assert.deepEqual(findConflicts(candidate(), [booking({ status })], [], facilities), []);
    assert.deepEqual(findConflicts(candidate({ status }), [booking()], [closure], facilities), []);
  }
});
test('provisional, awaiting approval and completed bookings reserve their time', () => {
  for (const status of ['Provisional', 'Awaiting Approval', 'Completed'] as const)
    assert.equal(findConflicts(candidate(), [booking({ status })], [], facilities).length, 1);
});
test('editing a booking excludes itself but detects other bookings', () => {
  assert.deepEqual(findConflicts(candidate(), [booking()], [], facilities, 'existing'), []);
  assert.equal(
    findConflicts(
      candidate({ id: 'existing' }),
      [booking(), booking({ id: 'other' })],
      [],
      facilities
    ).length,
    1
  );
});
test('facility closures prevent normal bookings', () => {
  const found = findConflicts(candidate(), [], [closure], facilities);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'closure');
});
test('Astro Full closure blocks each half and a half closure blocks Full', () => {
  assert.equal(
    findConflicts(
      candidate({ facilityId: 'astro-a' }),
      [],
      [{ ...closure, facilityId: 'astro-full' }],
      facilities
    ).length,
    1
  );
  assert.equal(
    findConflicts(
      candidate({ facilityId: 'astro-full' }),
      [],
      [{ ...closure, facilityId: 'astro-b' }],
      facilities
    ).length,
    1
  );
});
test('parent facility closure blocks future child pitches without blocking unrelated facilities', () => {
  assert.equal(
    findConflicts(
      candidate({ facilityId: 'westfield-1' }),
      [],
      [{ ...closure, facilityId: 'westfield' }],
      facilities
    ).length,
    1
  );
  assert.equal(
    findConflicts(
      candidate({ facilityId: 'astro-a' }),
      [],
      [{ ...closure, facilityId: 'westfield' }],
      facilities
    ).length,
    0
  );
});
test('candidate facility buffer before booking conflicts with previous booking', () => {
  assert.equal(
    findConflicts(
      candidate({ start: '2026-11-02T19:00:00Z', end: '2026-11-02T20:00:00Z', bufferBefore: 5 }),
      [booking()],
      [],
      facilities
    ).length,
    1
  );
});
test('existing facility buffer after booking conflicts with following booking', () => {
  assert.equal(
    findConflicts(
      candidate({ start: '2026-11-02T19:00:00Z', end: '2026-11-02T20:00:00Z' }),
      [booking({ bufferAfter: 5 })],
      [],
      facilities
    ).length,
    1
  );
});
test('both booking buffers are included; touching reserved intervals remains valid', () => {
  const existing = booking({ bufferAfter: 5 });
  assert.equal(
    findConflicts(
      candidate({ start: '2026-11-02T19:05:00Z', end: '2026-11-02T20:05:00Z', bufferBefore: 5 }),
      [existing],
      [],
      facilities
    ).length,
    1
  );
  assert.equal(
    findConflicts(
      candidate({ start: '2026-11-02T19:10:00Z', end: '2026-11-02T20:10:00Z', bufferBefore: 5 }),
      [existing],
      [],
      facilities
    ).length,
    0
  );
});
test('access-code validity does not reserve time or change price', () => {
  assert.deepEqual(
    findConflicts(
      candidate({ start: '2026-11-02T19:00:00Z', end: '2026-11-02T20:00:00Z', accessBefore: 10 }),
      [booking({ accessAfter: 10 })],
      [],
      facilities
    ),
    []
  );
});
test('buffer can conflict with a closure even when customer time does not', () => {
  assert.equal(
    findConflicts(
      candidate({ start: '2026-11-02T20:00:00Z', end: '2026-11-02T21:00:00Z', bufferBefore: 5 }),
      [],
      [closure],
      facilities
    ).length,
    1
  );
});
test('prices are prorated from pence for 60, 90 and 120 minutes', () => {
  const rate = {
    id: 'rate',
    name: 'Jowett',
    facilityId: 'jowett',
    exVat: 3670,
    vat: 734,
    total: 4400,
  };
  for (const [end, total] of [
    ['19:00', 4400],
    ['19:30', 6600],
    ['20:00', 8800],
  ] as const) {
    assert.equal(
      calculatePrice(rate, '2026-11-02T18:00:00Z', `2026-11-02T${end}:00Z`, 'External Hirer').total,
      total
    );
  }
  assert.deepEqual(
    calculatePrice(rate, '2026-11-02T18:00:00Z', '2026-11-02T19:30:00Z', 'External Hirer'),
    { exVat: 5505, vat: 1101, total: 6600 }
  );
});
test('School, Complimentary and Maintenance have zero calculated charge', () => {
  for (const type of ['School', 'Complimentary', 'Maintenance'] as const)
    assert.equal(
      calculatePrice(
        { id: 'rate', name: '', facilityId: 'jowett', exVat: 3670, vat: 734, total: 4400 },
        candidate().start,
        candidate().end,
        type
      ).total,
      0
    );
});
test('customer percentage discount applies proportionally and validates range', () => {
  const rate = { id: 'rate', name: '', facilityId: 'jowett', exVat: 3670, vat: 734, total: 4400 };
  assert.equal(
    calculatePrice(rate, candidate().start, candidate().end, 'External Hirer', 10).total,
    3960
  );
  assert.throws(
    () => calculatePrice(rate, candidate().start, candidate().end, 'External Hirer', 101),
    /Discount/
  );
});
test('missing Westfield rate calculates zero without inventing a tariff', () => {
  assert.deepEqual(
    calculatePrice(undefined, candidate().start, candidate().end, 'External Hirer'),
    { exVat: 0, vat: 0, total: 0 }
  );
});
test('validation accepts off-hour times in five-minute increments', () => {
  assert.doesNotThrow(() =>
    validateBookingInput(candidate({ start: '2026-11-02T18:10:00Z', end: '2026-11-02T19:40:00Z' }))
  );
});
test('validation rejects negative duration, invalid dates, non-increment times and timezone-free input', () => {
  assert.throws(() => validateBookingInput(candidate({ end: candidate().start })), /after/);
  assert.throws(
    () => validateBookingInput(candidate({ start: '2026-02-30T18:00:00Z' })),
    /calendar date/
  );
  assert.throws(
    () => validateBookingInput(candidate({ start: '2026-11-02T18:01:00Z' })),
    /five-minute/
  );
  assert.throws(
    () => validateBookingInput(candidate({ start: '2026-11-02T18:00:00' })),
    /timezone/
  );
  assert.throws(() => validateBookingInput(candidate({ attendees: -1 })), /Attendees/);
});
test('non-recurring input yields one canonical UTC occurrence', () => {
  assert.deepEqual(expandRecurrence(candidate()), [
    {
      start: candidate().start.replace('00Z', '00.000Z'),
      end: candidate().end.replace('00Z', '00.000Z'),
    },
  ]);
});
test('daily, weekly, fortnightly and custom every-N-day recurrence', () => {
  for (const [frequency, interval, expected] of [
    ['daily', 1, '2026-11-03'],
    ['weekly', 1, '2026-11-09'],
    ['fortnightly', 1, '2026-11-16'],
    ['custom', 3, '2026-11-05'],
  ] as const) {
    const series = expandRecurrence(candidate({ recurrence: recurrence({ frequency, interval }) }));
    assert.equal(series.length, 3);
    assert.equal(series[1].start.slice(0, 10), expected);
  }
});
test('selected weekdays recurrence includes only selected days', () => {
  const series = expandRecurrence(
    candidate({ recurrence: recurrence({ frequency: 'weekdays', weekdays: [1, 3], count: 4 }) })
  );
  assert.deepEqual(
    series.map((b) => b.start.slice(0, 10)),
    ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11']
  );
});
test('selected weekdays supports every second operational week', () => {
  const series = expandRecurrence(
    candidate({
      recurrence: recurrence({ frequency: 'weekdays', weekdays: [1, 3], interval: 2, count: 4 }),
    })
  );
  assert.deepEqual(
    series.map((b) => b.start.slice(0, 10)),
    ['2026-11-02', '2026-11-04', '2026-11-16', '2026-11-18']
  );
});
test('monthly recurrence skips absent month days without drifting', () => {
  const series = expandRecurrence(
    candidate({
      start: '2026-01-31T18:00:00Z',
      end: '2026-01-31T19:00:00Z',
      recurrence: recurrence({ frequency: 'monthly' }),
    })
  );
  assert.deepEqual(
    series.map((b) => isoToLondonInput(b.start).slice(0, 10)),
    ['2026-01-31', '2026-03-31', '2026-05-31']
  );
});
test('until is inclusive in London and count also caps the series', () => {
  const series = expandRecurrence(
    candidate({ recurrence: recurrence({ frequency: 'daily', until: '2026-11-04', count: 0 }) })
  );
  assert.equal(series.length, 3);
  assert.equal(
    expandRecurrence(
      candidate({ recurrence: recurrence({ frequency: 'daily', until: '2026-11-04', count: 2 }) })
    ).length,
    2
  );
});
test('recurring booking preserves London wall times over spring DST change', () => {
  const series = expandRecurrence(
    candidate({
      start: '2026-03-22T18:00:00Z',
      end: '2026-03-22T19:00:00Z',
      recurrence: recurrence(),
    })
  );
  assert.equal(series[1].start, '2026-03-29T17:00:00.000Z');
  assert.equal(series[1].end, '2026-03-29T18:00:00.000Z');
  assert.equal(isoToLondonInput(series[1].start), '2026-03-29T18:00');
});
test('recurring booking preserves London wall times over autumn DST change', () => {
  const series = expandRecurrence(
    candidate({
      start: '2026-10-18T17:00:00Z',
      end: '2026-10-18T18:00:00Z',
      recurrence: recurrence(),
    })
  );
  assert.equal(series[1].start, '2026-10-25T18:00:00.000Z');
});
test('nonexistent spring local times reject instead of silently moving', () => {
  assert.throws(() => londonInputToIso('2026-03-29T01:30'), /does not exist/);
  assert.throws(
    () =>
      expandRecurrence(
        candidate({
          start: '2026-03-22T01:30:00Z',
          end: '2026-03-22T02:30:00Z',
          recurrence: recurrence(),
        })
      ),
    /does not exist/
  );
});
test('multi-day recurrence preserves the local end date offset', () => {
  const series = expandRecurrence(
    candidate({
      start: '2026-11-02T23:00:00Z',
      end: '2026-11-03T01:00:00Z',
      recurrence: recurrence({ frequency: 'daily', count: 2 }),
    })
  );
  assert.equal(series[1].end, '2026-11-04T01:00:00.000Z');
});
test('London UI conversion uses BST in summer and GMT in winter', () => {
  assert.equal(londonInputToIso('2026-07-01T18:10'), '2026-07-01T17:10:00.000Z');
  assert.equal(londonInputToIso('2026-11-01T18:10'), '2026-11-01T18:10:00.000Z');
  assert.throws(() => londonInputToIso('2026-02-30T18:00'), /valid/);
});
test('recurrence rejects unlimited, too-large, invalid weekday and backwards series', () => {
  assert.throws(
    () => expandRecurrence(candidate({ recurrence: recurrence({ count: 0 }) })),
    /end date or occurrence count/
  );
  assert.throws(
    () => expandRecurrence(candidate({ recurrence: recurrence({ count: 367 }) })),
    /366/
  );
  assert.throws(
    () =>
      expandRecurrence(
        candidate({ recurrence: recurrence({ frequency: 'weekdays', weekdays: [] }) })
      ),
    /weekday/
  );
  assert.throws(
    () => expandRecurrence(candidate({ recurrence: recurrence({ until: '2026-11-01' }) })),
    /before/
  );
  assert.throws(
    () => expandRecurrence(candidate({ recurrence: recurrence({ until: '2026-11-31' }) })),
    /valid/
  );
  assert.throws(
    () => expandRecurrence(candidate({ recurrence: recurrence({ interval: 0 }) })),
    /interval/
  );
});
test('whole recurring series can be checked against closures before commit', () => {
  const series = expandRecurrence(candidate({ recurrence: recurrence() }));
  const weekTwoClosure = { ...closure, start: '2026-11-09T17:00:00Z', end: '2026-11-09T20:00:00Z' };
  assert.equal(
    series.flatMap((s) => findConflicts({ ...candidate(), ...s }, [], [weekTwoClosure], facilities))
      .length,
    1
  );
});
test('only administrator and manager can manage all bookings', () => {
  assert.equal(canManage('administrator'), true);
  assert.equal(canManage('manager'), true);
  assert.equal(canManage('staff'), false);
  assert.equal(canManage('readonly'), false);
});
