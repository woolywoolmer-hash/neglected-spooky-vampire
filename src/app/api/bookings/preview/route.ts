import { NextRequest, NextResponse } from 'next/server';
import { getActor } from '@/lib/auth';
import { getData } from '@/lib/db';
import { apiError, sameOrigin } from '@/lib/http';
import { previewBookingSeries } from '@/lib/booking-preview';
import { validateBookingInput } from '@/lib/booking-engine';
import type { BookingInput } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const actor = await getActor();
    if (actor.role === 'readonly')
      throw new Error('Read only users cannot create booking previews.');

    const body = await request.json();
    const input = body.booking as BookingInput;
    validateBookingInput(input);

    const data = await getData(actor);
    const old = input.id ? data.bookings.find((booking) => booking.id === input.id) : undefined;
    const facility = data.facilities.find((item) => item.id === input.facilityId);
    if (!facility) throw new Error('Choose a valid facility.');

    const booking = {
      ...input,
      bufferBefore: input.bufferBefore ?? facility.bufferBefore,
      bufferAfter: input.bufferAfter ?? facility.bufferAfter,
      accessBefore: input.accessBefore ?? facility.accessBefore,
      accessAfter: input.accessAfter ?? facility.accessAfter,
    };

    const occurrences = previewBookingSeries(
      booking,
      data.bookings,
      data.closures,
      data.facilities,
      old?.id
    );

    const conflictDates = occurrences.filter((item) => item.conflicts.length);
    const schoolBreakDates = occurrences.filter((item) => item.schoolBreak);
    const uncoveredDates = occurrences.filter((item) => item.schoolCalendarCoverageWarning);

    return NextResponse.json({
      occurrences,
      summary: {
        total: occurrences.length,
        clear: occurrences.length - conflictDates.length,
        conflicts: conflictDates.length,
        schoolBreakDates: schoolBreakDates.length,
        outsidePublishedSchoolCalendar: uncoveredDates.length,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
