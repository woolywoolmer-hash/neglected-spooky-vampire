import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, csvCell, toCsv } from '../src/lib/reports';
import type { Booking, Facility } from '../src/lib/types';
const facility = (id: string): Facility => ({
  id,
  name: id,
  group: 'Sport',
  parentId: null,
  color: '#000',
  bufferBefore: 0,
  bufferAfter: 0,
  accessBefore: 0,
  accessAfter: 0,
  active: true,
});
const booking = (changes: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  facilityId: 'hall',
  customerId: null,
  title: 'Training',
  organisation: 'Club',
  contactName: '',
  telephone: '',
  email: '',
  start: '2026-07-01T08:00:00Z',
  end: '2026-07-01T09:00:00Z',
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
  accessBefore: 0,
  accessAfter: 0,
  seriesId: null,
  createdBy: 'test',
  createdAt: '',
  modifiedBy: 'test',
  modifiedAt: '',
  cancellationReason: '',
  conflictOverride: false,
  ...changes,
});
const filter = { from: '2026-07-01', to: '2026-07-01', facilityId: '' };
test('money is summed in pence; cancelled/enquiry and provisional financial values excluded', () => {
  const report = buildReport(
    {
      facilities: [facility('hall')],
      customers: [],
      bookings: [
        booking(),
        booking({ id: 'b2', status: 'Cancelled' }),
        booking({ id: 'b3', status: 'Enquiry' }),
        booking({ id: 'b4', status: 'Provisional' }),
      ],
    },
    filter
  );
  assert.equal(report.externalRevenue, 4400);
  assert.equal(report.vat, 734);
  assert.equal(report.bookingCount, 2);
  assert.equal(report.cancelled, 1);
  assert.equal(report.unpaid, 4400);
});
test('start-date financial filtering follows Europe London across midnight', () => {
  const report = buildReport(
    {
      facilities: [facility('hall')],
      customers: [],
      bookings: [
        booking({ start: '2026-06-30T23:30:00Z', end: '2026-07-01T00:30:00Z' }),
        booking({ id: 'late', start: '2026-07-01T23:00:00Z', end: '2026-07-02T00:00:00Z' }),
      ],
    },
    filter
  );
  assert.equal(report.bookingCount, 1);
  assert.equal(report.bookings[0].id, 'b1');
});
test('occupancy clips to 07–22 and unions overrides instead of double counting', () => {
  const report = buildReport(
    {
      facilities: [facility('hall')],
      customers: [],
      bookings: [
        booking({ start: '2026-07-01T05:00:00Z', end: '2026-07-01T08:00:00Z' }),
        booking({ id: 'override', start: '2026-07-01T07:00:00Z', end: '2026-07-01T09:00:00Z' }),
      ],
    },
    filter
  );
  assert.equal(report.facilityRows[0].utilisedHours, 3);
  assert.equal(report.capacity, 15);
  assert.equal(report.utilisation, 20);
});
test('a full Astro booking reserves both halves but aggregate avoids counting the full resource again', () => {
  const report = buildReport(
    {
      facilities: ['astro-full', 'astro-a', 'astro-b'].map(facility),
      customers: [],
      bookings: [booking({ facilityId: 'astro-full' })],
    },
    filter
  );
  assert.equal(report.utilisedHours, 2);
  assert.equal(report.capacity, 30);
  assert.equal(report.facilityRows[0].utilisedHours, 1);
  assert.equal(report.facilityRows[1].utilisedHours, 1);
});
test('part paid booking gross is separated from unpaid balances', () => {
  const report = buildReport(
    {
      facilities: [facility('hall')],
      customers: [],
      bookings: [booking({ paymentStatus: 'Part paid' })],
    },
    filter
  );
  assert.equal(report.unpaid, 0);
  assert.equal(report.partPaid, 4400);
  assert.equal(report.partPaidCount, 1);
});
test('CSV quotes commas and embedded quotes and neutralises spreadsheet formulas', () => {
  assert.equal(csvCell('A "club", ltd'), '"A ""club"", ltd"');
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvCell('   @import'), '"\'   @import"');
  assert.equal(csvCell('\tcmd'), '"\'\tcmd"');
  assert.ok(toCsv([['£44', 1]]).startsWith('\ufeff'));
});
test('invalid date ranges fail clearly', () => {
  const data = { facilities: [], customers: [], bookings: [] };
  assert.throws(() => buildReport(data, { ...filter, to: '2026-06-30' }));
  assert.throws(() => buildReport(data, { ...filter, from: '2026-02-31' }));
  assert.throws(() => buildReport(data, { ...filter, to: '2030-01-01' }));
});
