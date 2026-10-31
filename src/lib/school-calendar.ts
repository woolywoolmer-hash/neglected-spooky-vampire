export type SchoolBreakKind = 'Holiday' | 'Half term' | 'Exeat';

export interface SchoolBreak {
  id: string;
  name: string;
  kind: SchoolBreakKind;
  start: string; // inclusive YYYY-MM-DD
  end: string; // inclusive YYYY-MM-DD
}

/**
 * Port Regis published term dates for the 2026–27 academic year.
 * These are date-level warnings for block-booking clarity, not facility closures:
 * external hire may still be permitted when the school is out.
 *
 * The school publishes exact departure/return times for exeats and holidays. V1
 * deliberately highlights the whole boundary date so a facilities manager cannot
 * miss a booking that falls partly across a school break.
 */
export const portRegisSchoolBreaks: SchoolBreak[] = [
  { id: 'autumn-exeat-1-2026', name: 'Quarter exeat', kind: 'Exeat', start: '2026-09-25', end: '2026-09-27' },
  { id: 'autumn-half-2026', name: 'Autumn half term', kind: 'Half term', start: '2026-10-16', end: '2026-11-01' },
  { id: 'autumn-exeat-2-2026', name: 'Three-quarter exeat', kind: 'Exeat', start: '2026-11-20', end: '2026-11-22' },
  { id: 'christmas-2026', name: 'Christmas holiday', kind: 'Holiday', start: '2026-12-11', end: '2027-01-06' },
  { id: 'spring-exeat-1-2027', name: 'Quarter exeat', kind: 'Exeat', start: '2027-01-22', end: '2027-01-24' },
  { id: 'spring-half-2027', name: 'Spring half term', kind: 'Half term', start: '2027-02-12', end: '2027-02-21' },
  { id: 'spring-exeat-2-2027', name: 'Three-quarter exeat', kind: 'Exeat', start: '2027-03-05', end: '2027-03-07' },
  { id: 'easter-2027', name: 'Easter holiday', kind: 'Holiday', start: '2027-03-25', end: '2027-04-15' },
  { id: 'summer-exeat-1-2027', name: 'Quarter exeat', kind: 'Exeat', start: '2027-04-30', end: '2027-05-03' },
  { id: 'summer-half-2027', name: 'Summer half term', kind: 'Half term', start: '2027-05-28', end: '2027-06-06' },
  { id: 'summer-exeat-2-2027', name: 'Three-quarter exeat', kind: 'Exeat', start: '2027-06-18', end: '2027-06-20' },
  { id: 'summer-holiday-2027', name: 'Summer holiday', kind: 'Holiday', start: '2027-07-01', end: '2027-08-31' },
];

export const portRegisCalendarCoverage = {
  start: '2026-09-07',
  end: '2027-08-31',
  label: 'Port Regis published 2026–27 term dates',
};

export function schoolBreakForDate(date: string): SchoolBreak | undefined {
  return portRegisSchoolBreaks.find((period) => date >= period.start && date <= period.end);
}

export function schoolBreaksForDates(dates: string[]) {
  return dates.flatMap((date) => {
    const period = schoolBreakForDate(date);
    return period ? [{ date, period }] : [];
  });
}

export function outsidePublishedSchoolCalendar(date: string) {
  return date < portRegisCalendarCoverage.start || date > portRegisCalendarCoverage.end;
}
