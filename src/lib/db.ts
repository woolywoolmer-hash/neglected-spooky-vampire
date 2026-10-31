import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getMode, getSupabaseServerClient } from './auth';
import { demoSeed } from './seed';
import type { Actor, AppData } from './types';

type Snapshot = Omit<AppData, 'actor' | 'mode'>;
const globalDb = globalThis as typeof globalThis & { fieldworkDatabase?: Promise<PGlite> };

/** Exported for isolated integration tests. A missing path means in-memory. */
export async function createDemoDatabase(
  dataDir?: string,
  includeFixtures = true
): Promise<PGlite> {
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const db = new PGlite(dataDir);
  await db.waitReady;
  const schema = await readFile(
    path.join(process.cwd(), 'supabase/migrations/001_core.sql'),
    'utf8'
  );
  // Core definitions are idempotent; schema changes can be exercised on an existing demo.
  await db.exec(schema);
  const count = await db.query<{ count: number }>(
    'select count(*)::integer as count from facilities'
  );
  if (!count.rows[0].count && includeFixtures) {
    const seed = demoSeed();
    await db.transaction(async (tx) => {
      await tx.query(
        "select set_config('app.actor_id','demo-administrator',true),set_config('app.actor_role','administrator',true),set_config('app.actor_name','Alex Morgan',true)"
      );
      for (const table of ['facilities', 'rates', 'customers', 'bookings', 'closures'] as const) {
        for (const record of seed[table]) {
          await tx.query(
            `insert into ${table}(id,data) values($1,$2::jsonb) on conflict(id) do nothing`,
            [record.id, JSON.stringify(record)]
          );
        }
      }
    });
  }
  return db;
}

export async function getLocalDatabase(): Promise<PGlite> {
  if (getMode() !== 'demo') throw new Error('Local database is unavailable in Supabase mode');
  globalDb.fieldworkDatabase ??= createDemoDatabase(
    path.resolve(/* turbopackIgnore: true */ process.env.DEMO_DATABASE_PATH ?? '.data/fieldwork')
  );
  return globalDb.fieldworkDatabase;
}

export async function getData(actor: Actor): Promise<Snapshot> {
  if (getMode() === 'supabase') {
    const client = await getSupabaseServerClient();
    const { data, error } = await client.rpc('app_read');
    if (error) throw new Error(error.message);
    return data as Snapshot;
  }
  const db = await getLocalDatabase();
  return db.transaction(async (tx) => {
    await tx.query(
      "select set_config('app.actor_id',$1,true),set_config('app.actor_role',$2,true),set_config('app.actor_name',$3,true)",
      [actor.id, actor.role, actor.name]
    );
    const result = await tx.query<{ data: Snapshot }>('select app_snapshot() as data');
    return result.rows[0].data;
  });
}

export async function mutate(operation: string, payload: unknown, actor: Actor): Promise<unknown> {
  if (getMode() === 'supabase') {
    const client = await getSupabaseServerClient();
    const { data, error } = await client.rpc('app_mutate', { operation, payload });
    if (error) throw new Error(error.message);
    return data;
  }
  const db = await getLocalDatabase();
  return db.transaction(async (tx) => {
    await tx.query(
      "select set_config('app.actor_id',$1,true),set_config('app.actor_role',$2,true),set_config('app.actor_name',$3,true)",
      [actor.id, actor.role, actor.name]
    );
    const result = await tx.query<{ data: unknown }>('select app_apply($1,$2::jsonb) as data', [
      operation,
      JSON.stringify(payload),
    ]);
    return result.rows[0].data;
  });
}
