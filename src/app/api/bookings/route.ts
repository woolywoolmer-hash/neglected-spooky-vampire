import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getActor } from '@/lib/auth';
import { getData, mutate } from '@/lib/db';
import { apiError, sameOrigin, text, integer } from '@/lib/http';
import {
  calculatePrice,
  expandRecurrence,
  findConflicts,
  validateBookingInput,
} from '@/lib/booking-engine';
import type { Booking, BookingInput, BookingStatus, BookingType, PaymentStatus } from '@/lib/types';
export const runtime = 'nodejs';
const statuses: BookingStatus[] = [
  'Enquiry',
  'Provisional',
  'Awaiting Approval',
  'Confirmed',
  'Cancelled',
  'Completed',
];
const types: BookingType[] = [
  'School',
  'Sports Centre',
  'External Hirer',
  'Complimentary',
  'Maintenance',
];
const payments: PaymentStatus[] = ['Unpaid', 'Part paid', 'Paid', 'Not required'];
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const actor = await getActor();
    if (actor.role === 'readonly') throw new Error('Read only users cannot change bookings.');
    const body = await request.json();
    const input = body.booking as BookingInput;
    if (!input || typeof input !== 'object') throw new Error('Booking details are required.');
    validateBookingInput(input);
    const data = await getData(actor);
    const old = input.id ? data.bookings.find((b) => b.id === input.id) : undefined;
    if (input.id && !old) throw new Error('This booking no longer exists. Refresh the calendar.');
    if (old && input.modifiedAt && input.modifiedAt !== old.modifiedAt)
      throw new Error('This booking changed since you opened it. Refresh before editing.');
    const facility = data.facilities.find((f) => f.id === input.facilityId);
    if (
      !facility ||
      (!facility.active && (!old || !['Cancelled', 'Completed'].includes(input.status || '')))
    )
      throw new Error(
        'Select an active facility. Inactive facilities only allow cancellation or completion of existing bookings.'
      );
    const type = input.type || 'External Hirer';
    const status = input.status || 'Confirmed';
    const paymentStatus = input.paymentStatus || 'Unpaid';
    if (!types.includes(type) || !statuses.includes(status) || !payments.includes(paymentStatus))
      throw new Error('Invalid booking type, status, or payment status.');
    if (
      actor.role === 'staff' &&
      (type !== 'School' ||
        !['Awaiting Approval', 'Cancelled'].includes(status) ||
        (old && old.createdById !== actor.id))
    )
      throw new Error('School staff can only request or cancel their own internal bookings.');
    const priceOverride = Boolean(input.priceOverride);
    const conflictOverride = Boolean(input.conflictOverride);
    const overrideReason = text(input.overrideReason);
    if ((priceOverride || conflictOverride) && actor.role !== 'administrator')
      throw new Error('Only an administrator can override prices or conflicts.');
    if ((priceOverride || conflictOverride) && !overrideReason)
      throw new Error('Give a reason for the administrator override.');
    const cancellationReason = text(input.cancellationReason);
    if (status === 'Cancelled' && !cancellationReason)
      throw new Error('A cancellation reason is required.');
    const customer = input.customerId
      ? data.customers.find((c) => c.id === input.customerId)
      : undefined;
    const keepPrivateCustomer =
      actor.role === 'staff' &&
      old?.createdById === actor.id &&
      input.customerId === old.customerId;
    if (input.customerId && !customer && !keepPrivateCustomer)
      throw new Error('Customer was not found.');
    if (customer && !customer.active && !old) throw new Error('This customer is inactive.');
    if (old && input.recurrence && input.recurrence.frequency !== 'none')
      throw new Error('Edit a single occurrence without generating another series.');
    const occurrences = expandRecurrence(input);
    const seriesId = old?.seriesId || (occurrences.length > 1 ? randomUUID() : null);
    const now = new Date().toISOString();
    const rate = data.rates.find((r) => r.facilityId === input.facilityId);
    const prepared: Booking[] = [];
    const allConflicts = [];
    for (const occurrence of occurrences) {
      const price = calculatePrice(
        rate,
        occurrence.start,
        occurrence.end,
        type,
        customer?.discount || 0
      );
      if (!rate && !priceOverride && !['School', 'Complimentary', 'Maintenance'].includes(type))
        throw new Error(
          'This facility has no rate. An administrator must supply a price override.'
        );
      const booking: Booking = {
        id: old?.id || randomUUID(),
        facilityId: facility.id,
        customerId: customer?.id || (keepPrivateCustomer ? old!.customerId : null),
        title: text(input.title, 250),
        organisation: text(input.organisation || customer?.organisation, 250),
        contactName: text(input.contactName || customer?.contactName, 250),
        telephone: text(input.telephone || customer?.telephone, 100),
        email: text(input.email || customer?.email, 320),
        ...occurrence,
        type,
        status,
        paymentStatus,
        attendees: integer(input.attendees, 0, 100000),
        ...price,
        priceOverride,
        overrideReason,
        notes: text(input.notes),
        accessRequirements: text(input.accessRequirements),
        accessCode: text(input.accessCode, 100),
        bufferBefore: old?.facilityId === facility.id ? old.bufferBefore : facility.bufferBefore,
        bufferAfter: old?.facilityId === facility.id ? old.bufferAfter : facility.bufferAfter,
        accessBefore: old?.facilityId === facility.id ? old.accessBefore : facility.accessBefore,
        accessAfter: old?.facilityId === facility.id ? old.accessAfter : facility.accessAfter,
        seriesId,
        createdBy: old?.createdBy || actor.id,
        createdAt: old?.createdAt || now,
        modifiedBy: actor.id,
        modifiedAt: now,
        cancellationReason,
        conflictOverride,
      };
      if (priceOverride) {
        booking.exVat = integer(input.exVat, 0, 100000000);
        booking.vat = integer(input.vat, 0, 100000000);
        booking.total = integer(input.total, 0, 100000000);
      }
      allConflicts.push(
        ...findConflicts(
          booking,
          [...data.bookings, ...prepared],
          data.closures,
          data.facilities,
          old?.id
        )
      );
      prepared.push(booking);
    }
    if (allConflicts.length && !conflictOverride)
      return NextResponse.json(
        {
          error: 'This time conflicts with a booking or closure. Choose another time or facility.',
          conflicts: allConflicts,
        },
        { status: 409 }
      );
    await mutate(
      'save-bookings',
      {
        bookings: prepared,
        override: conflictOverride,
        expectedModifiedAt: old ? { [old.id]: old.modifiedAt } : {},
      },
      actor
    );
    return NextResponse.json({ bookings: prepared, count: prepared.length });
  } catch (e) {
    return apiError(e);
  }
}
