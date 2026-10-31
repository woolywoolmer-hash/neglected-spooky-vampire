import type { Booking, Customer, Facility, Rate, Closure } from './types';

export const initialFacilities: Facility[] = [
  {
    id: 'jowett',
    name: 'Jowett Sports Hall',
    group: 'Indoor',
    parentId: null,
    color: '#8270c4',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 10,
    accessAfter: 10,
    active: true,
  },
  {
    id: 'astro-a',
    name: 'Astro Half A',
    group: 'Astro',
    parentId: 'astro-full',
    color: '#3a9a83',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 10,
    accessAfter: 10,
    active: true,
  },
  {
    id: 'astro-b',
    name: 'Astro Half B',
    group: 'Astro',
    parentId: 'astro-full',
    color: '#4a9d8d',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 10,
    accessAfter: 10,
    active: true,
  },
  {
    id: 'astro-full',
    name: 'Astro Full Pitch',
    group: 'Astro',
    parentId: null,
    color: '#237f6b',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 10,
    accessAfter: 10,
    active: true,
  },
  {
    id: 'squash-1',
    name: 'Squash Court 1',
    group: 'Indoor',
    parentId: null,
    color: '#d88d49',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 0,
    accessAfter: 0,
    active: true,
  },
  {
    id: 'squash-2',
    name: 'Squash Court 2',
    group: 'Indoor',
    parentId: null,
    color: '#c7805a',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 0,
    accessAfter: 0,
    active: true,
  },
  {
    id: 'westfield',
    name: 'Westfield Playing Fields',
    group: 'Outdoor',
    parentId: null,
    color: '#6f9252',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 0,
    accessAfter: 0,
    active: true,
  },
];
export const initialRates: Rate[] = [
  {
    id: 'rate-jowett',
    name: 'Jowett Sports Hall',
    facilityId: 'jowett',
    exVat: 3670,
    vat: 734,
    total: 4400,
  },
  {
    id: 'rate-astro-a',
    name: 'Astro Half A',
    facilityId: 'astro-a',
    exVat: 4720,
    vat: 944,
    total: 5660,
  },
  {
    id: 'rate-astro-b',
    name: 'Astro Half B',
    facilityId: 'astro-b',
    exVat: 4720,
    vat: 944,
    total: 5660,
  },
  {
    id: 'rate-astro-full',
    name: 'Astro Full Pitch',
    facilityId: 'astro-full',
    exVat: 8400,
    vat: 1680,
    total: 10080,
  },
  {
    id: 'rate-squash-1',
    name: 'Squash Court 1',
    facilityId: 'squash-1',
    exVat: 1050,
    vat: 210,
    total: 1260,
  },
  {
    id: 'rate-squash-2',
    name: 'Squash Court 2',
    facilityId: 'squash-2',
    exVat: 1050,
    vat: 210,
    total: 1260,
  },
  {
    id: 'rate-cricket',
    name: '1:1 Cricket Coaching',
    facilityId: null,
    exVat: 880,
    vat: 176,
    total: 1050,
  },
  {
    id: 'rate-netball',
    name: 'Outside Netball Court',
    facilityId: null,
    exVat: 2620,
    vat: 524,
    total: 3140,
  },
  {
    id: 'rate-tennis',
    name: 'Outside Tennis Court',
    facilityId: null,
    exVat: 1570,
    vat: 314,
    total: 1880,
  },
];
export const initialCustomers: Customer[] = [
  {
    id: 'customer-falcons',
    organisation: 'Westbridge Falcons FC',
    contactName: 'Morgan Reed',
    address: '12 Example Lane, Westbridge',
    telephone: '07700 900101',
    email: 'morgan@example.com',
    billingInfo: 'Monthly invoice · NET 30',
    discount: 0,
    notes: 'Demo organisation. Tuesday training group.',
    active: true,
  },
  {
    id: 'customer-school',
    organisation: 'Westbridge School',
    contactName: 'Taylor Brooks',
    address: '1 Sample Road, Westbridge',
    telephone: '07700 900102',
    email: 'sport@example.com',
    billingInfo: 'Internal cost centre: Sport',
    discount: 100,
    notes: 'Synthetic school account; no pupil information.',
    active: true,
  },
  {
    id: 'customer-netball',
    organisation: 'Riverside Netball Club',
    contactName: 'Casey Lane',
    address: '8 Fictional Street, Westbridge',
    telephone: '07700 900103',
    email: 'casey@example.com',
    billingInfo: 'Invoice after each booking',
    discount: 0,
    notes: 'Demo club.',
    active: true,
  },
  {
    id: 'customer-squash',
    organisation: 'Community Squash Club',
    contactName: 'Jamie Quinn',
    address: '4 Example Gardens, Westbridge',
    telephone: '07700 900104',
    email: 'jamie@example.com',
    billingInfo: 'Pay on arrival',
    discount: 0,
    notes: 'Demo club.',
    active: true,
  },
];
function localStamp(day: Date, hour: number, minute = 0) {
  // Fixtures use local UK wall-clock hours; Intl determines GMT/BST without host TZ.
  const d = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute)
  );
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const londonHour = Number(parts.find((p) => p.type === 'hour')!.value);
  return new Date(d.getTime() - ((londonHour - hour + 24) % 24) * 3600000).toISOString();
}
export function demoSeed(now = new Date()): {
  facilities: Facility[];
  rates: Rate[];
  customers: Customer[];
  bookings: Booking[];
  closures: Closure[];
} {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const day = (offset: number) => new Date(monday.getTime() + offset * 86400000);
  const bookings: Booking[] = [];
  const specs: [
    number,
    string,
    number,
    number,
    number,
    string,
    number,
    Booking['status'],
    Booking['type'],
  ][] = [
    [0, 'jowett', 9, 0, 60, 'Year 8 PE · indoor games', 1, 'Confirmed', 'School'],
    [0, 'astro-a', 17, 15, 90, 'Falcons training', 0, 'Confirmed', 'External Hirer'],
    [1, 'jowett', 10, 30, 60, 'School badminton', 1, 'Confirmed', 'School'],
    [1, 'jowett', 18, 0, 90, 'Netball club practice', 2, 'Confirmed', 'External Hirer'],
    [1, 'astro-a', 18, 0, 60, 'Junior football training', 0, 'Confirmed', 'External Hirer'],
    [1, 'astro-b', 18, 0, 60, 'Community football', 0, 'Provisional', 'External Hirer'],
    [2, 'squash-1', 12, 0, 60, 'Lunchtime squash', 3, 'Confirmed', 'Sports Centre'],
    [2, 'jowett', 15, 30, 60, 'Staff wellbeing session', 1, 'Awaiting Approval', 'School'],
    [3, 'astro-full', 17, 15, 90, 'Full-pitch match practice', 0, 'Confirmed', 'External Hirer'],
    [3, 'jowett', 18, 30, 90, 'Netball club practice', 2, 'Provisional', 'External Hirer'],
    [4, 'jowett', 9, 0, 60, 'Year 9 PE · basketball', 1, 'Confirmed', 'School'],
    [4, 'squash-2', 17, 0, 60, 'Friday social squash', 3, 'Confirmed', 'Sports Centre'],
    [5, 'astro-a', 9, 30, 90, 'Falcons weekend academy', 0, 'Confirmed', 'External Hirer'],
    [5, 'astro-b', 10, 0, 60, 'Community kickabout', 0, 'Confirmed', 'External Hirer'],
    [5, 'jowett', 11, 0, 90, 'Weekend netball', 2, 'Confirmed', 'External Hirer'],
    [5, 'squash-1', 14, 0, 60, 'Club ladder matches', 3, 'Provisional', 'Sports Centre'],
    [6, 'astro-full', 10, 0, 120, 'Sunday league fixture', 0, 'Confirmed', 'External Hirer'],
    [6, 'jowett', 14, 0, 60, 'Community open session', 2, 'Awaiting Approval', 'External Hirer'],
    [7, 'jowett', 17, 0, 90, 'Next week netball', 2, 'Provisional', 'External Hirer'],
    [8, 'astro-a', 18, 0, 60, 'Falcons training', 0, 'Confirmed', 'External Hirer'],
  ];
  specs.forEach(
    ([offset, facilityId, hour, minute, duration, title, customerIndex, status, type], i) => {
      const f = initialFacilities.find((f) => f.id === facilityId)!;
      const c = initialCustomers[customerIndex];
      const rate = initialRates.find((r) => r.facilityId === facilityId);
      const start = localStamp(day(offset), hour, minute);
      const end = new Date(Date.parse(start) + duration * 60000).toISOString();
      const factor = type === 'School' ? 0 : duration / 60;
      bookings.push({
        id: `demo-booking-${i + 1}`,
        facilityId,
        customerId: c.id,
        title,
        organisation: c.organisation,
        contactName: c.contactName,
        telephone: c.telephone,
        email: c.email,
        start,
        end,
        type,
        status,
        paymentStatus: type === 'School' ? 'Not required' : i % 3 === 0 ? 'Paid' : 'Unpaid',
        attendees: facilityId.startsWith('squash') ? 2 : 18,
        exVat: Math.round((rate?.exVat ?? 0) * factor),
        vat: Math.round((rate?.vat ?? 0) * factor),
        total: Math.round((rate?.total ?? 0) * factor),
        priceOverride: false,
        overrideReason: '',
        notes: 'Synthetic demonstration booking.',
        accessRequirements: 'Reception check-in',
        accessCode: '',
        bufferBefore: f.bufferBefore,
        bufferAfter: f.bufferAfter,
        accessBefore: f.accessBefore,
        accessAfter: f.accessAfter,
        seriesId: null,
        createdBy: 'Alex Morgan',
        createdAt: now.toISOString(),
        modifiedBy: 'Alex Morgan',
        modifiedAt: now.toISOString(),
        cancellationReason: '',
        conflictOverride: false,
      });
    }
  );
  const closures: Closure[] = [
    {
      id: 'demo-closure-1',
      facilityId: 'westfield',
      start: localStamp(day(5), 8),
      end: localStamp(day(5), 18),
      reason: 'Unplayable pitch',
      notes: 'Demo closure · pitch inspection following rain',
      createdBy: 'Alex Morgan',
    },
    {
      id: 'demo-closure-2',
      facilityId: 'squash-2',
      start: localStamp(day(2), 8),
      end: localStamp(day(2), 12),
      reason: 'Maintenance',
      notes: 'Demo closure · floor inspection',
      createdBy: 'Alex Morgan',
    },
  ];
  return {
    facilities: initialFacilities,
    rates: initialRates,
    customers: initialCustomers,
    bookings,
    closures,
  };
}
