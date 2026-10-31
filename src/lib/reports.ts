import type { AppData, Booking, Facility } from './types';
import { isoToLondonInput, londonInputToIso } from './booking-engine';

export interface ReportFilter {
  from: string;
  to: string;
  facilityId: string;
}
export interface ReportGroup {
  id: string;
  name: string;
  count: number;
  hours: number;
  total: number;
}
export interface FacilityReport extends ReportGroup {
  utilisedHours: number;
  availableHours: number;
  utilisation: number;
}
const blocks = (b: Booking) => b.status !== 'Cancelled' && b.status !== 'Enquiry';
const billable = (b: Booking) => b.status === 'Confirmed' || b.status === 'Completed';
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export function validateReportFilter(filter: ReportFilter): void {
  if (!validDate(filter.from) || !validDate(filter.to) || filter.from > filter.to)
    throw new Error('Choose a valid date range with an end date on or after the start date.');
  if ((Date.parse(filter.to) - Date.parse(filter.from)) / 86400000 > 731)
    throw new Error('Choose a report period of no more than two years.');
}
function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (
    let at = Date.parse(`${from}T12:00:00Z`);
    at <= Date.parse(`${to}T12:00:00Z`);
    at += 86400000
  )
    out.push(new Date(at).toISOString().slice(0, 10));
  return out;
}
function unionHours(intervals: [number, number][]): number {
  intervals.sort((a, b) => a[0] - b[0]);
  let minutes = 0,
    end = -Infinity;
  for (const [start, finish] of intervals) {
    if (finish > Math.max(start, end)) minutes += finish - Math.max(start, end);
    end = Math.max(end, finish);
  }
  return minutes / 3600000;
}
function related(booking: Booking, facility: Facility): boolean {
  if (booking.facilityId === facility.id) return true;
  return facility.id === 'astro-full'
    ? ['astro-a', 'astro-b'].includes(booking.facilityId)
    : ['astro-a', 'astro-b'].includes(facility.id) && booking.facilityId === 'astro-full';
}
export function buildReport(
  data: Pick<AppData, 'bookings' | 'facilities' | 'customers'>,
  filter: ReportFilter
) {
  validateReportFilter(filter);
  const days = daysBetween(filter.from, filter.to);
  const periodStart = Date.parse(londonInputToIso(`${filter.from}T00:00`));
  const tomorrow = new Date(Date.parse(`${filter.to}T12:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
  const periodEnd = Date.parse(londonInputToIso(`${tomorrow}T00:00`));
  const selectedFacilities = data.facilities.filter(
    (f) => !filter.facilityId || f.id === filter.facilityId
  );
  // Financial/count reports use booking START date. Occupancy uses intervals clipped to operational hours.
  const bookings = data.bookings.filter(
    (b) =>
      (!filter.facilityId || b.facilityId === filter.facilityId) &&
      Date.parse(b.start) >= periodStart &&
      Date.parse(b.start) < periodEnd
  );
  const live = bookings.filter(blocks);
  const financial = bookings.filter(billable);
  const facilityRows: FacilityReport[] = selectedFacilities.map((f) => {
    const own = live.filter((b) => b.facilityId === f.id);
    let utilisedHours = 0;
    for (const day of days) {
      const dayStart = Date.parse(londonInputToIso(`${day}T07:00`));
      const dayEnd = Date.parse(londonInputToIso(`${day}T22:00`));
      const intervals: [number, number][] = data.bookings
        .filter((b) => blocks(b) && related(b, f))
        .map((b) => [Math.max(Date.parse(b.start), dayStart), Math.min(Date.parse(b.end), dayEnd)])
        .filter(([a, b]) => b > a) as [number, number][];
      utilisedHours += unionHours(intervals);
    }
    const availableHours = days.length * 15;
    return {
      id: f.id,
      name: f.name,
      count: own.length,
      hours: own.reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / 3600000, 0),
      total: financial.filter((b) => b.facilityId === f.id).reduce((a, b) => a + b.total, 0),
      utilisedHours,
      availableHours,
      utilisation: availableHours ? (utilisedHours / availableHours) * 100 : 0,
    };
  });
  const customerMap = new Map<string, ReportGroup>();
  for (const b of live) {
    const id = b.customerId || `organisation:${b.organisation || 'Internal school'}`;
    const row = customerMap.get(id) || {
      id,
      name:
        data.customers.find((c) => c.id === b.customerId)?.organisation ||
        b.organisation ||
        'Internal school',
      count: 0,
      hours: 0,
      total: 0,
    };
    row.count++;
    row.hours += (Date.parse(b.end) - Date.parse(b.start)) / 3600000;
    if (billable(b)) row.total += b.total;
    customerMap.set(id, row);
  }
  // Count physical areas once: Full Astro overlaps Half A/B so use the halves when aggregating.
  const physicalRows =
    !filter.facilityId &&
    data.facilities.some((f) => f.id === 'astro-a') &&
    data.facilities.some((f) => f.id === 'astro-b')
      ? facilityRows.filter((f) => f.id !== 'astro-full')
      : facilityRows;
  const hours = physicalRows.reduce((s, f) => s + f.utilisedHours, 0);
  const capacity = physicalRows.reduce((s, f) => s + f.availableHours, 0);
  return {
    bookings,
    facilityRows,
    customerRows: Array.from(customerMap.values()).sort((a, b) => b.count - a.count),
    days: days.length,
    bookingCount: live.length,
    bookedHours: live.reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / 3600000, 0),
    externalRevenue: financial
      .filter((b) => b.type === 'External Hirer')
      .reduce((a, b) => a + b.total, 0),
    exVat: financial.reduce((a, b) => a + b.exVat, 0),
    vat: financial.reduce((a, b) => a + b.vat, 0),
    total: financial.reduce((a, b) => a + b.total, 0),
    unpaid: financial.filter((b) => b.paymentStatus === 'Unpaid').reduce((a, b) => a + b.total, 0),
    partPaid: financial
      .filter((b) => b.paymentStatus === 'Part paid')
      .reduce((a, b) => a + b.total, 0),
    partPaidCount: financial.filter((b) => b.paymentStatus === 'Part paid').length,
    cancelled: bookings.filter((b) => b.status === 'Cancelled').length,
    internal: live.filter((b) => b.type === 'School').length,
    external: live.filter((b) => b.type === 'External Hirer').length,
    other: live.filter((b) => b.type !== 'School' && b.type !== 'External Hirer').length,
    utilisation: capacity ? (hours / capacity) * 100 : 0,
    utilisedHours: hours,
    capacity,
  };
}
export type Report = ReturnType<typeof buildReport>;
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function toCsv(rows: unknown[][]): string {
  return '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
export function bookingReportCsv(report: Report, facilities: Facility[]): string {
  return toCsv([
    [
      'Booking ID',
      'Facility',
      'Booking purpose',
      'Organisation',
      'Start (Europe/London)',
      'End (Europe/London)',
      'Type',
      'Status',
      'Payment status',
      'Ex VAT (GBP)',
      'VAT (GBP)',
      'Total (GBP)',
      'Cancellation reason',
    ],
    ...report.bookings.map((b) => [
      b.id,
      facilities.find((f) => f.id === b.facilityId)?.name || b.facilityId,
      b.title,
      b.organisation,
      isoToLondonInput(b.start).replace('T', ' '),
      isoToLondonInput(b.end).replace('T', ' '),
      b.type,
      b.status,
      b.paymentStatus,
      (b.exVat / 100).toFixed(2),
      (b.vat / 100).toFixed(2),
      (b.total / 100).toFixed(2),
      b.cancellationReason,
    ]),
  ]);
}
