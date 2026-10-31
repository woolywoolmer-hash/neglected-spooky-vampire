import type {
  Booking,
  BookingConflict,
  BookingInput,
  BookingType,
  Closure,
  Facility,
  Rate,
  Role,
} from './types';

const MINUTE = 60_000;
const DAY = 86_400_000;
const zone = 'Europe/London';
const londonFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: zone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallTime(value: string | number): WallTime {
  const parts = Object.fromEntries(
    londonFormatter
      .formatToParts(new Date(value))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)])
  );
  return parts as WallTime;
}
function wallEpoch(w: WallTime): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}
function sameWall(a: WallTime, b: WallTime): boolean {
  return wallEpoch(a) === wallEpoch(b);
}
/** Convert a London civil time to a UTC timestamp. DST gaps are errors, never silently shifted. */
function wallToIso(w: WallTime, preferredOffset?: number): string {
  const naive = wallEpoch(w);
  // London has only GMT/BST in the supported modern booking period. Test both
  // offsets so ambiguous autumn times use the original occurrence's offset.
  const candidates = [naive, naive - 60 * MINUTE].filter((t) => sameWall(wallTime(t), w));
  if (!candidates.length)
    throw new Error(
      'This local time does not exist in Europe/London because the clocks change. Choose another time.'
    );
  const selected = candidates.find((t) => naive - t === preferredOffset) ?? candidates[0];
  return new Date(selected).toISOString();
}
function localDateKey(w: WallTime): string {
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}
function shiftDays(w: WallTime, days: number): WallTime {
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
  return { ...w, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
function shiftMonths(w: WallTime, months: number): WallTime | null {
  const d = new Date(Date.UTC(w.year, w.month - 1 + months, 1));
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  // A 31st-of-month series skips months without a 31st, rather than drifting.
  if (w.day > daysInMonth) return null;
  return { ...w, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
/** Useful at the UI boundary: datetime-local is interpreted in the facility's London timezone. */
export function londonInputToIso(input: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  if (!match) throw new Error('Enter a valid date and time.');
  const [, year, month, day, hour, minute, second = '0'] = match;
  const w = {
    year: +year,
    month: +month,
    day: +day,
    hour: +hour,
    minute: +minute,
    second: +second,
  };
  const normalized = new Date(wallEpoch(w));
  if (
    normalized.getUTCFullYear() !== w.year ||
    normalized.getUTCMonth() + 1 !== w.month ||
    normalized.getUTCDate() !== w.day ||
    w.hour > 23 ||
    w.minute > 59 ||
    w.second > 59
  )
    throw new Error('Enter a valid date and time.');
  return wallToIso(w);
}
export function isoToLondonInput(input: string): string {
  const w = wallTime(input);
  return `${localDateKey(w)}T${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
}
function instant(value: string, label: string): number {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value))
    throw new Error(`${label} must include its timezone.`);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} must be a valid timestamp.`);
  // Date.parse normalizes invalid calendar dates, so validate the date portion too.
  const m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!m) throw new Error(`${label} must be an ISO timestamp.`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() + 1 !== +m[2] || d.getUTCDate() !== +m[3])
    throw new Error(`${label} must be a valid calendar date.`);
  return time;
}

export function validateBookingInput(input: BookingInput): void {
  if (!input || typeof input !== 'object') throw new Error('Booking details are required.');
  if (!input.facilityId || typeof input.facilityId !== 'string')
    throw new Error('Choose a facility.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200)
    throw new Error('Enter a booking purpose of 1–200 characters.');
  const start = instant(input.start, 'Start');
  const end = instant(input.end, 'End');
  if (end <= start) throw new Error('End time must be after start time.');
  if (start % (5 * MINUTE) || end % (5 * MINUTE))
    throw new Error('Start and end times must use five-minute increments.');
  if (
    input.attendees !== undefined &&
    (!Number.isInteger(input.attendees) || input.attendees < 0 || input.attendees > 100_000)
  )
    throw new Error('Attendees must be a whole number between 0 and 100,000.');
  if (
    input.status !== undefined &&
    ![
      'Enquiry',
      'Provisional',
      'Awaiting Approval',
      'Confirmed',
      'Cancelled',
      'Completed',
    ].includes(input.status)
  )
    throw new Error('Invalid booking status.');
  if (
    input.type !== undefined &&
    !['School', 'Sports Centre', 'External Hirer', 'Complimentary', 'Maintenance'].includes(
      input.type
    )
  )
    throw new Error('Invalid booking type.');
  if (
    input.paymentStatus !== undefined &&
    !['Unpaid', 'Part paid', 'Paid', 'Not required'].includes(input.paymentStatus)
  )
    throw new Error('Invalid payment status.');
  for (const key of ['exVat', 'vat', 'total'] as const) {
    if (input[key] !== undefined && (!Number.isSafeInteger(input[key]) || input[key]! < 0))
      throw new Error('Prices must be non-negative integer pence.');
  }
  for (const key of ['bufferBefore', 'bufferAfter', 'accessBefore', 'accessAfter'] as const) {
    if (
      input[key] !== undefined &&
      (!Number.isInteger(input[key]) || input[key]! < 0 || input[key]! > 1440)
    )
      throw new Error('Buffer and access periods must be whole minutes between 0 and 1,440.');
  }
}

export function canManage(role: Role): boolean {
  return role === 'administrator' || role === 'manager';
}
function blocks(status: string | undefined): boolean {
  return status !== 'Cancelled' && status !== 'Enquiry';
}
function linkedFacilities(a: string, b: string, facilities: Facility[]): boolean {
  if (a === b) return true;
  if (
    (a === 'astro-full' && ['astro-a', 'astro-b'].includes(b)) ||
    (b === 'astro-full' && ['astro-a', 'astro-b'].includes(a))
  )
    return true;
  const ancestor = (child: string, parent: string): boolean => {
    const seen = new Set<string>();
    let current = facilities.find((f) => f.id === child)?.parentId;
    while (current && !seen.has(current)) {
      if (current === parent) return true;
      seen.add(current);
      current = facilities.find((f) => f.id === current)?.parentId;
    }
    return false;
  };
  return ancestor(a, b) || ancestor(b, a);
}
function overlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

/** Half-open reservation ranges include facility buffers, never access-code periods. */
export function findConflicts(
  candidate: BookingInput,
  bookings: Booking[],
  closures: Closure[],
  facilities: Facility[],
  excludeId?: string
): BookingConflict[] {
  if (!blocks(candidate.status)) return [];
  const facility = facilities.find((f) => f.id === candidate.facilityId);
  const start =
    instant(candidate.start, 'Start') -
    (candidate.bufferBefore ?? facility?.bufferBefore ?? 0) * MINUTE;
  const end =
    instant(candidate.end, 'End') + (candidate.bufferAfter ?? facility?.bufferAfter ?? 0) * MINUTE;
  const result: BookingConflict[] = [];
  for (const booking of bookings) {
    if (
      booking.id === (excludeId ?? candidate.id) ||
      !blocks(booking.status) ||
      !linkedFacilities(candidate.facilityId, booking.facilityId, facilities)
    )
      continue;
    const f = facilities.find((f) => f.id === booking.facilityId);
    const bs = Date.parse(booking.start) - (booking.bufferBefore ?? f?.bufferBefore ?? 0) * MINUTE;
    const be = Date.parse(booking.end) + (booking.bufferAfter ?? f?.bufferAfter ?? 0) * MINUTE;
    if (overlap(start, end, bs, be))
      result.push({
        bookingId: booking.id,
        title: booking.title,
        start: booking.start,
        end: booking.end,
        facilityId: booking.facilityId,
        kind: 'booking',
      });
  }
  for (const closure of closures) {
    if (
      linkedFacilities(candidate.facilityId, closure.facilityId, facilities) &&
      overlap(start, end, Date.parse(closure.start), Date.parse(closure.end))
    )
      result.push({
        bookingId: closure.id,
        title: closure.reason,
        start: closure.start,
        end: closure.end,
        facilityId: closure.facilityId,
        kind: 'closure',
      });
  }
  return result;
}

/** Prices are pence. Preserve all three supplied rate components, including rounded totals. */
export function calculatePrice(
  rate: Rate | undefined,
  start: string,
  end: string,
  type: BookingType,
  discount = 0
): { exVat: number; vat: number; total: number } {
  const duration = instant(end, 'End') - instant(start, 'Start');
  if (duration <= 0) throw new Error('End time must be after start time.');
  if (!Number.isFinite(discount) || discount < 0 || discount > 100)
    throw new Error('Discount must be between 0 and 100 percent.');
  if (!rate || ['School', 'Complimentary', 'Maintenance'].includes(type))
    return { exVat: 0, vat: 0, total: 0 };
  const factor = (duration / (60 * MINUTE)) * (1 - discount / 100);
  return {
    exVat: Math.round(rate.exVat * factor),
    vat: Math.round(rate.vat * factor),
    total: Math.round(rate.total * factor),
  };
}

/** Expand finite series in London civil time. Custom recurrence means every N days. */
export function expandRecurrence(input: BookingInput): { start: string; end: string }[] {
  validateBookingInput(input);
  const r = input.recurrence;
  if (!r || r.frequency === 'none')
    return [{ start: new Date(input.start).toISOString(), end: new Date(input.end).toISOString() }];
  if (!['daily', 'weekly', 'weekdays', 'fortnightly', 'monthly', 'custom'].includes(r.frequency))
    throw new Error('Invalid recurrence frequency.');
  const interval = r.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 366)
    throw new Error('Recurrence interval must be between 1 and 366.');
  const count = r.count || 0;
  if (!Number.isInteger(count) || count < 0 || count > 366)
    throw new Error('A series can contain at most 366 occurrences.');
  if (r.until && !/^\d{4}-\d{2}-\d{2}$/.test(r.until))
    throw new Error('Recurrence end must be a date in YYYY-MM-DD format.');
  if (!count && !r.until) throw new Error('Choose an end date or occurrence count for the series.');
  const startWall = wallTime(input.start);
  const endWall = wallTime(input.end);
  const firstDate = localDateKey(startWall);
  if (r.until && r.until < firstDate)
    throw new Error('Recurrence end date cannot be before the first booking.');
  if (r.until) {
    const [year, month, day] = r.until.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    )
      throw new Error('Recurrence end date must be valid.');
  }
  const weekdays = r.weekdays ?? [];
  if (
    r.frequency === 'weekdays' &&
    (!Array.isArray(weekdays) ||
      !weekdays.length ||
      weekdays.some((n) => !Number.isInteger(n) || n < 0 || n > 6))
  )
    throw new Error('Select at least one valid weekday.');
  const startOffset = wallEpoch(startWall) - Date.parse(input.start);
  const endOffset = wallEpoch(endWall) - Date.parse(input.end);
  const originalDay = Date.UTC(startWall.year, startWall.month - 1, startWall.day);
  const endDayOffset = Math.round(
    (Date.UTC(endWall.year, endWall.month - 1, endWall.day) - originalDay) / DAY
  );
  const originalWeekday = new Date(originalDay).getUTCDay();
  const occurrences: { start: string; end: string }[] = [];
  // Guard against malformed or extreme series producing an unbounded loop.
  const iterationLimit = 366 * 366 * 7 + 366;
  for (let i = 0; i < iterationLimit; i++) {
    let next: WallTime | null;
    if (r.frequency === 'monthly') next = shiftMonths(startWall, i * interval);
    else if (r.frequency === 'weekdays') {
      next = shiftDays(startWall, i);
      const weekday = new Date(Date.UTC(next.year, next.month - 1, next.day)).getUTCDay();
      // Week zero starts on the first occurrence's Monday (ISO operational week).
      const relativeWeek = Math.floor((i + ((originalWeekday + 6) % 7)) / 7);
      if (!weekdays.includes(weekday) || relativeWeek % interval !== 0) {
        if (r.until && localDateKey(next) > r.until) break;
        continue;
      }
    } else {
      const step = r.frequency === 'weekly' ? 7 : r.frequency === 'fortnightly' ? 14 : 1;
      next = shiftDays(startWall, i * interval * step);
    }
    if (!next) continue;
    if (r.until && localDateKey(next) > r.until) break;
    if (occurrences.length === 366)
      throw new Error('A series can contain at most 366 occurrences; shorten the end date.');
    const nextEnd = {
      ...shiftDays(next, endDayOffset),
      hour: endWall.hour,
      minute: endWall.minute,
      second: endWall.second,
    };
    const occurrence = { start: wallToIso(next, startOffset), end: wallToIso(nextEnd, endOffset) };
    if (Date.parse(occurrence.end) <= Date.parse(occurrence.start))
      throw new Error(
        'A recurring end time falls before its start because the clocks change. Choose another time.'
      );
    occurrences.push(occurrence);
    if (count && occurrences.length >= count) return occurrences;
  }
  if (!occurrences.length) throw new Error('No occurrences match the selected recurrence.');
  return occurrences;
}
