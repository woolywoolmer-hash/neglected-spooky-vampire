import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { createDemoDatabase } from '../src/lib/db';
import { demoSeed } from '../src/lib/seed';
import type { Booking, Role } from '../src/lib/types';
let db: PGlite;
before(async () => {
  db = await createDemoDatabase();
});
after(async () => {
  await db?.close();
});
async function apply(operation: string, payload: unknown, role: Role = 'administrator') {
  return db.transaction(async (tx) => {
    await tx.query(
      "select set_config('app.actor_id',$1,true),set_config('app.actor_name',$2,true),set_config('app.actor_role',$3,true)",
      ['test-' + role, 'Test ' + role, role]
    );
    return tx.query('select app_apply($1,$2::jsonb)', [operation, JSON.stringify(payload)]);
  });
}
function booking(
  id: string,
  facilityId = 'jowett',
  start = '2035-01-02T09:00:00Z',
  end = '2035-01-02T10:00:00Z'
): Booking {
  const b = demoSeed().bookings[0];
  return {
    ...b,
    id,
    facilityId,
    start,
    end,
    customerId: null,
    organisation: 'Test organisation',
    type: 'External Hirer',
    status: 'Confirmed',
    exVat: 3670,
    vat: 734,
    total: 4400,
    paymentStatus: 'Unpaid',
    priceOverride: false,
    conflictOverride: false,
  };
}
test('database rejects overlapping bookings, accepts adjacency, and audits changes', async () => {
  await apply('save-bookings', { bookings: [booking('db-overlap-a')] });
  await assert.rejects(
    apply('save-bookings', {
      bookings: [booking('db-overlap-b', 'jowett', '2035-01-02T09:30:00Z', '2035-01-02T10:30:00Z')],
    }),
    /already reserved/
  );
  await apply('save-bookings', {
    bookings: [booking('db-adjacent', 'jowett', '2035-01-02T10:00:00Z', '2035-01-02T11:00:00Z')],
  });
  const r = await db.query<{ data: { actor: string; oldValue: unknown; newValue: Booking } }>(
    "select data from audit where data->>'entityId'='db-overlap-a'"
  );
  assert.equal(r.rows[0].data.actor, 'Test administrator');
  assert.equal(r.rows[0].data.oldValue, null);
  assert.equal(r.rows[0].data.newValue.id, 'db-overlap-a');
});
test('database reserves Astro halves independently and excludes full pitch', async () => {
  await apply('save-bookings', {
    bookings: [booking('db-half-a', 'astro-a'), booking('db-half-b', 'astro-b')],
  });
  await assert.rejects(
    apply('save-bookings', { bookings: [booking('db-full', 'astro-full')] }),
    /already reserved/
  );
  await apply('save-bookings', {
    bookings: [
      booking('db-full-later', 'astro-full', '2035-01-03T09:00:00Z', '2035-01-03T10:00:00Z'),
    ],
  });
  await assert.rejects(
    apply('save-bookings', {
      bookings: [
        booking('db-half-later', 'astro-b', '2035-01-03T09:30:00Z', '2035-01-03T10:30:00Z'),
      ],
    }),
    /already reserved/
  );
});
test('database rolls back an entire recurring batch on one conflict', async () => {
  await assert.rejects(
    apply('save-bookings', {
      bookings: [
        booking('db-series-clear', 'jowett', '2035-02-02T09:00:00Z', '2035-02-02T10:00:00Z'),
        booking('db-series-conflict'),
      ],
    }),
    /already reserved/
  );
  const result = await db.query<{ count: number }>(
    "select count(*)::integer as count from bookings where id='db-series-clear'"
  );
  assert.equal(result.rows[0].count, 0);
});
test('database enforces closures bidirectionally and only administrators may override with reason', async () => {
  await apply('save-closure', {
    id: 'db-closure',
    facilityId: 'squash-1',
    start: '2035-03-01T09:00:00Z',
    end: '2035-03-01T11:00:00Z',
    reason: 'Exams',
    notes: '',
    createdBy: '',
  });
  await assert.rejects(
    apply('save-bookings', {
      bookings: [booking('db-closed', 'squash-1', '2035-03-01T10:00:00Z', '2035-03-01T11:00:00Z')],
    }),
    /closed/
  );
  const override = {
    ...booking('db-admin-override', 'squash-1', '2035-03-01T10:00:00Z', '2035-03-01T11:00:00Z'),
    conflictOverride: true,
    overrideReason: 'Authorised temporary shared use',
  };
  await assert.rejects(
    apply('save-bookings', { bookings: [override] }, 'manager'),
    /administrator/
  );
  await apply('save-bookings', { bookings: [override] });
  await assert.rejects(
    apply('save-closure', {
      id: 'db-impossible-closure',
      facilityId: 'jowett',
      start: '2035-01-02T09:00:00Z',
      end: '2035-01-02T10:00:00Z',
      reason: 'Maintenance',
    }),
    /existing bookings/
  );
});
test('database computes authoritative prices and keeps access periods separate from buffers', async () => {
  const input = booking('db-price', 'jowett', '2035-04-02T09:00:00Z', '2035-04-02T10:30:00Z');
  await apply('save-bookings', {
    bookings: [{ ...input, total: 1, exVat: 1, vat: 1, bufferBefore: 99, accessBefore: 0 }],
  });
  const r = await db.query<{ data: Booking }>("select data from bookings where id='db-price'");
  assert.equal(r.rows[0].data.total, 6600);
  assert.equal(r.rows[0].data.exVat, 5505);
  assert.equal(r.rows[0].data.vat, 1101);
  assert.equal(r.rows[0].data.bufferBefore, 0);
  assert.equal(r.rows[0].data.accessBefore, 10);
});
test('database buffers block adjacent reservations but never increase the charge', async () => {
  const f = demoSeed().facilities.find((f) => f.id === 'squash-2')!;
  await apply('save-facility', { ...f, bufferBefore: 5, bufferAfter: 5, accessBefore: 15 });
  await apply('save-bookings', {
    bookings: [booking('db-buffer', 'squash-2', '2035-05-02T09:00:00Z', '2035-05-02T10:00:00Z')],
  });
  await assert.rejects(
    apply('save-bookings', {
      bookings: [
        booking('db-buffer-adjacent', 'squash-2', '2035-05-02T10:00:00Z', '2035-05-02T11:00:00Z'),
      ],
    }),
    /already reserved/
  );
  const r = await db.query<{ data: Booking }>("select data from bookings where id='db-buffer'");
  assert.equal(r.rows[0].data.total, 1260);
  assert.equal(r.rows[0].data.bufferBefore, 5);
});
test('database enforces readonly, staff and administrative boundaries', async () => {
  await assert.rejects(
    apply('save-bookings', { bookings: [booking('db-readonly')] }, 'readonly'),
    /permission/
  );
  await assert.rejects(
    apply('save-bookings', { bookings: [booking('db-staff-external')] }, 'staff'),
    /internal/
  );
  const internal = {
    ...booking('db-staff-request', 'westfield', '2035-06-02T09:00:00Z', '2035-06-02T10:00:00Z'),
    type: 'School',
    status: 'Awaiting Approval',
  };
  await apply('save-bookings', { bookings: [internal] }, 'staff');
  await assert.rejects(apply('save-rate', demoSeed().rates[0], 'manager'), /Administrator/);
  const r = await db.query<{ data: Booking }>(
    "select data from bookings where id='db-staff-request'"
  );
  assert.equal(r.rows[0].data.total, 0);
});
test('cancelled bookings release reservation; cancellation reason is mandatory', async () => {
  const b = booking('db-cancel', 'squash-1', '2035-07-02T09:00:00Z', '2035-07-02T10:00:00Z');
  await apply('save-bookings', { bookings: [b] });
  await assert.rejects(
    apply('save-bookings', { bookings: [{ ...b, status: 'Cancelled' }] }),
    /cancellation reason/
  );
  await apply('save-bookings', {
    bookings: [{ ...b, status: 'Cancelled', cancellationReason: 'Customer cancelled' }],
  });
  await apply('save-bookings', { bookings: [{ ...b, id: 'db-replacement' }] });
});
test('database rejects unknown-price hires, duplicate tariffs and hierarchy cycles', async () => {
  await assert.rejects(
    apply('save-bookings', {
      bookings: [
        booking('db-no-rate', 'westfield', '2035-08-02T09:00:00Z', '2035-08-02T10:00:00Z'),
      ],
    }),
    /No tariff/
  );
  await assert.rejects(
    apply('save-rate', { ...demoSeed().rates[0], id: 'duplicate-jowett' }),
    /already exists/
  );
  const parent = demoSeed().facilities.find((f) => f.id === 'westfield')!;
  const child = {
    ...parent,
    id: 'westfield-pitch-1',
    name: 'Westfield Pitch 1',
    parentId: 'westfield',
  };
  await apply('save-facility', child);
  await assert.rejects(apply('save-facility', { ...parent, parentId: child.id }), /cycle/);
  const internal = {
    ...booking('db-parent', 'westfield', '2035-08-03T09:00:00Z', '2035-08-03T10:00:00Z'),
    type: 'School',
  };
  await apply('save-bookings', { bookings: [internal] });
  await assert.rejects(
    apply('save-bookings', { bookings: [{ ...internal, id: 'db-child', facilityId: child.id }] }),
    /already reserved/
  );
});
test('optimistic timestamp checks reject a stale edit atomically', async () => {
  const b = booking('db-optimistic', 'jowett', '2035-09-02T09:00:00Z', '2035-09-02T10:00:00Z');
  await apply('save-bookings', { bookings: [b] });
  const r = await db.query<{ data: Booking }>("select data from bookings where id='db-optimistic'");
  await assert.rejects(
    apply('save-bookings', {
      bookings: [{ ...r.rows[0].data, title: 'Stale title' }],
      expectedModifiedAt: { 'db-optimistic': '2000-01-01T00:00:00Z' },
    }),
    /modified by someone else/
  );
  await apply('save-bookings', {
    bookings: [{ ...r.rows[0].data, title: 'Valid title' }],
    expectedModifiedAt: { 'db-optimistic': r.rows[0].data.modifiedAt },
  });
});
test('Supabase migration denies raw access and privilege escalation; RPC authenticates identity', async () => {
  const { readFile } = await import('node:fs/promises');
  await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(await readFile('supabase/migrations/002_supabase_auth.sql', 'utf8'));
  const userId = '00000000-0000-4000-8000-000000000001';
  await db.query(
    'insert into auth.users(id,email,raw_user_meta_data) values($1,\'demo@example.com\',\'{"name":"Auth Demo","role":"administrator"}\')',
    [userId]
  );
  const profile = await db.query<{ role: string }>('select role from profiles where id=$1', [
    userId,
  ]);
  assert.equal(profile.rows[0].role, 'readonly', 'auth metadata cannot grant administrator');
  const asAuthenticated = async (sql: string, params: unknown[] = []) =>
    db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
      await tx.exec('set local role authenticated');
      return tx.query<{ data: unknown }>(sql, params);
    });
  await assert.rejects(asAuthenticated('select data from bookings'), /permission denied/);
  await assert.rejects(
    asAuthenticated("update profiles set role='administrator' where id=$1", [userId]),
    /permission denied/
  );
  await assert.rejects(
    asAuthenticated("select app_apply('save-bookings',$1::jsonb)", [
      JSON.stringify({ bookings: [booking('db-forged')] }),
    ]),
    /permission denied/
  );
  const snapshot = await asAuthenticated('select app_read() as data');
  const data = snapshot.rows[0].data as {
    bookings: Booking[];
    customers: unknown[];
    audit: unknown[];
  };
  assert.equal(data.customers.length, 0);
  assert.equal(data.audit.length, 0);
  assert.equal(data.bookings[0].email, '');
  await assert.rejects(
    asAuthenticated("select app_mutate('save-bookings',$1::jsonb)", [
      JSON.stringify({ bookings: [booking('db-forged')] }),
    ]),
    /permission/
  );
  await db.query("update profiles set role='staff' where id=$1", [userId]);
  await asAuthenticated("select app_mutate('save-bookings',$1::jsonb)", [
    JSON.stringify({
      bookings: [
        {
          ...booking('db-authed-staff', 'jowett', '2035-10-02T09:00:00Z', '2035-10-02T10:00:00Z'),
          status: 'Awaiting Approval',
          type: 'School',
          createdBy: 'Fake administrator',
        },
      ],
    }),
  ]);
  const saved = await db.query<{ data: Booking }>(
    "select data from bookings where id='db-authed-staff'"
  );
  assert.equal(saved.rows[0].data.createdBy, 'Auth Demo');
  assert.equal(saved.rows[0].data.createdById, userId);
  const ownSnapshot = await asAuthenticated('select app_read() as data');
  const ownData = ownSnapshot.rows[0].data as { bookings: Booking[] };
  assert.equal(ownData.bookings.find((b) => b.id === 'db-authed-staff')!.email, booking('x').email);
  assert.equal(ownData.bookings.find((b) => b.id === 'db-overlap-a')!.email, '');
});
test('null or missing classifications and a missing bookings array cannot bypass scheduling', async () => {
  await assert.rejects(apply('save-bookings', {}), /Bookings array/);
  for (const key of ['status', 'type', 'paymentStatus']) {
    const input = {
      ...booking('db-null-' + key, 'jowett', '2035-11-01T09:00:00Z', '2035-11-01T10:00:00Z'),
      [key]: null,
    };
    await assert.rejects(apply('save-bookings', { bookings: [input] }), /classification/);
  }
  await assert.rejects(
    apply(
      'save-bookings',
      {
        bookings: [
          {
            ...booking('db-staff-null', 'jowett', '2035-11-01T09:00:00Z', '2035-11-01T10:00:00Z'),
            type: null,
            status: null,
          },
        ],
      },
      'staff'
    ),
    /internal/
  );
});
test('Astro full/half invariant survives editable hierarchy changes', async () => {
  const half = { ...demoSeed().facilities.find((f) => f.id === 'astro-a')!, parentId: null };
  await assert.rejects(apply('save-facility', half), /upcoming bookings/);
  await db.query(
    "delete from bookings where data->>'facilityId' in ('astro-a','astro-b','astro-full')"
  );
  await apply('save-facility', half);
  await apply('save-bookings', {
    bookings: [
      booking('db-always-half', 'astro-a', '2035-11-02T09:00:00Z', '2035-11-02T10:00:00Z'),
    ],
  });
  await assert.rejects(
    apply('save-bookings', {
      bookings: [
        booking('db-always-full', 'astro-full', '2035-11-02T09:30:00Z', '2035-11-02T10:30:00Z'),
      ],
    }),
    /already reserved/
  );
});
