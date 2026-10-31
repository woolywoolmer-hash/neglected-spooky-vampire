import { writeFile } from 'node:fs/promises';
import { demoSeed } from '../src/lib/seed';

async function main() {
  if (process.argv.includes('--write-sql')) {
    const data = demoSeed();
    const rows = [
      '-- Apply after both migrations. Initial facilities and exact supplied rates in pence.',
      '-- Synthetic customer accounts only. No scheduled sample bookings in hosted environments.',
      'begin;',
      "select set_config('app.actor_id','seed',true),set_config('app.actor_name','Setup seed',true),set_config('app.actor_role','administrator',true);",
    ];
    for (const table of ['facilities', 'rates', 'customers'] as const)
      for (const record of data[table])
        rows.push(
          `insert into public.${table}(id,data) values('${record.id.replaceAll("'", "''")}','${JSON.stringify(record).replaceAll("'", "''")}'::jsonb) on conflict(id) do nothing;`
        );
    rows.push('commit;');
    await writeFile('supabase/seed.sql', rows.join('\n') + '\n');
    console.log('Generated supabase/seed.sql');
  } else {
    const { getLocalDatabase } = await import('../src/lib/db');
    const db = await getLocalDatabase();
    const result = await db.query(
      'select (select count(*) from facilities) as facilities,(select count(*) from rates) as rates,(select count(*) from bookings) as bookings'
    );
    console.log('Local embedded PostgreSQL initialized; existing data preserved.', result.rows[0]);
    await db.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
