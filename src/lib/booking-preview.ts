import { expandRecurrence, findConflicts } from './booking-engine';
import { outsidePublishedSchoolCalendar, schoolBreakForDate } from './school-calendar';
import type { Booking, BookingConflict, BookingInput, Closure, Facility } from './types';

const londonDate = (value: string) =>
  new Date(value).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

export interface BookingOccurrencePreview {
  start: string;
  end: string;
  date: string;
  conflicts: BookingConflict[];
  schoolBreak: ReturnType<typeof schoolBreakForDate> | null;
  schoolCalendarCoverageWarning: boolean;
}

export function previewBookingSeries(
  input: BookingInput,
  bookings: Booking[],
  closures: Closure[],
  facilities: Facility[],
  excludeId?: string
): BookingOccurrencePreview[] {
  const occurrences = expandRecurrence(input);
  const prepared: Booking[] = [];
  return occurrences.map((occurrence, index) => {
    const candidate: BookingInput = { ...input, ...occurrence };
    const conflicts = findConflicts(
      candidate,
      [...bookings, ...prepared],
      closures,
      facilities,
      excludeId
    );
    const date = londonDate(occurrence.start);
    prepared.push({
      id: `preview-${index}`,
      facilityId: input.facilityId,
      customerId: input.customerId ?? null,
      title: input.title,
      organisation: input.organisation ?? '',
      contactName: input.contactName ?? '',
      telephone: input.telephone ?? '',
      email: input.email ?? '',
      start: occurrence.start,
      end: occurrence.end,
      type: input.type ?? 'External Hirer',
      status: input.status ?? 'Confirmed',
      paymentStatus: input.paymentStatus ?? 'Unpaid',
      attendees: input.attendees ?? 0,
      exVat: input.exVat ?? 0,
      vat: input.vat ?? 0,
      total: input.total ?? 0,
      priceOverride: Boolean(input.priceOverride),
      overrideReason: input.overrideReason ?? '',
      notes: input.notes ?? '',
      accessRequirements: input.accessRequirements ?? '',
      accessCode: input.accessCode ?? '',
      bufferBefore: input.bufferBefore ?? 0,
      bufferAfter: input.bufferAfter ?? 0,
      accessBefore: input.accessBefore ?? 0,
      accessAfter: input.accessAfter ?? 0,
      seriesId: 'preview',
      createdBy: 'preview',
      createdAt: occurrence.start,
      modifiedBy: 'preview',
      modifiedAt: occurrence.start,
      cancellationReason: input.cancellationReason ?? '',
      conflictOverride: false,
    });
    return {
      ...occurrence,
      date,
      conflicts,
      schoolBreak: schoolBreakForDate(date) ?? null,
      schoolCalendarCoverageWarning: outsidePublishedSchoolCalendar(date),
    };
  });
}
