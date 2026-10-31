/** Integration ports only. Core mutations do not depend on an external provider. */
import type { Booking, Customer } from './types';
export type IntegrationKind =
  | 'isams'
  | 'socs'
  | 'door-access'
  | 'stripe'
  | 'email'
  | 'outlook'
  | 'google-calendar'
  | 'accounting';
export interface BookingEvent {
  id: string;
  type: 'booking.created' | 'booking.updated' | 'booking.cancelled';
  booking: Booking;
  occurredAt: string;
}
export interface IntegrationAdapter {
  kind: IntegrationKind;
  handle(event: BookingEvent): Promise<void>;
}
export interface CustomerSource {
  getCustomers(): Promise<Customer[]>;
}
export interface AccessProvider {
  grant(input: {
    bookingId: string;
    facilityId: string;
    validFrom: string;
    validUntil: string;
  }): Promise<{ reference: string }>;
  revoke(reference: string): Promise<void>;
}
// Register adapters in a future integration worker. No external systems are connected in V1.
export const integrationAdapters: ReadonlyArray<IntegrationAdapter> = [];
