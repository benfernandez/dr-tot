import { Client } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  const [, , file] = process.argv;
  if (!file) {
    console.error('usage: tsx run-migration.ts <path-to-sql-file>');
    process.exit(1);
  }
  const sql = readFileSync(resolve(file), 'utf8');
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error('Set SUPABASE_DB_URL env var to the pooler connection string');
    process.exit(1);
  }
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log(`Running ${file}…`);
  await client.query(sql);
  console.log('OK');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
