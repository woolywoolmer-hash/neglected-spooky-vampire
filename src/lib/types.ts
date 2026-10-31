export type Role = 'administrator' | 'manager' | 'staff' | 'readonly';
export type BookingStatus =
  'Enquiry' | 'Provisional' | 'Awaiting Approval' | 'Confirmed' | 'Cancelled' | 'Completed';
export type BookingType =
  'School' | 'Sports Centre' | 'External Hirer' | 'Complimentary' | 'Maintenance';
export type PaymentStatus = 'Unpaid' | 'Part paid' | 'Paid' | 'Not required';
export interface Facility {
  id: string;
  name: string;
  group: string;
  parentId: string | null;
  color: string;
  bufferBefore: number;
  bufferAfter: number;
  accessBefore: number;
  accessAfter: number;
  active: boolean;
}
export interface Rate {
  id: string;
  name: string;
  facilityId: string | null;
  exVat: number;
  vat: number;
  total: number;
}
export interface Customer {
  id: string;
  organisation: string;
  contactName: string;
  address: string;
  telephone: string;
  email: string;
  billingInfo: string;
  discount: number;
  notes: string;
  active: boolean;
}
export interface Booking {
  id: string;
  facilityId: string;
  customerId: string | null;
  title: string;
  organisation: string;
  contactName: string;
  telephone: string;
  email: string;
  start: string;
  end: string;
  type: BookingType;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  attendees: number;
  exVat: number;
  vat: number;
  total: number;
  priceOverride: boolean;
  overrideReason: string;
  notes: string;
  accessRequirements: string;
  accessCode: string;
  bufferBefore: number;
  bufferAfter: number;
  accessBefore: number;
  accessAfter: number;
  seriesId: string | null;
  createdBy: string;
  createdById?: string;
  createdAt: string;
  modifiedBy: string;
  modifiedAt: string;
  cancellationReason: string;
  conflictOverride: boolean;
}
export interface Closure {
  id: string;
  facilityId: string;
  start: string;
  end: string;
  reason: string;
  notes: string;
  createdBy: string;
}
export interface Audit {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  actor: string;
  at: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
}
export interface Recurrence {
  frequency: 'none' | 'daily' | 'weekly' | 'weekdays' | 'fortnightly' | 'monthly' | 'custom';
  interval: number;
  weekdays: number[];
  until: string;
  count: number;
}
export interface BookingInput extends Partial<Booking> {
  facilityId: string;
  start: string;
  end: string;
  title: string;
  recurrence?: Recurrence;
}
export interface Actor {
  id: string;
  name: string;
  role: Role;
}
export interface AppData {
  facilities: Facility[];
  rates: Rate[];
  customers: Customer[];
  bookings: Booking[];
  closures: Closure[];
  audit: Audit[];
  actor: Actor;
  mode: 'demo' | 'supabase';
}
export interface BookingConflict {
  bookingId: string;
  title: string;
  start: string;
  end: string;
  facilityId: string;
  kind: 'booking' | 'closure';
}
