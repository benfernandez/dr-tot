import { createClient } from '@supabase/supabase-js';

/**
 * Triage helper for the error_log table. Designed to run under `railway run`
 * so Railway injects production env vars (SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY) without us committing any Supabase credentials
 * to git — those get auto-revoked by GitHub secret scanning.
 *
 * Usage (via npm, so npx tsx path resolution is automatic):
 *
 *   railway run npm run errors                       summary of last 24h
 *   railway run npm run errors -- 1h                 summary of last hour
 *   railway run npm run errors -- details            detailed rows (last 50)
 *   railway run npm run errors -- details 6h         detailed rows within window
 *   railway run npm run errors -- code vision_failed detailed rows filtered to code
 *
 * Locally (from your laptop, reads .env):
 *
 *   npx tsx src/scripts/tail-errors.ts               same args as above
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Run under `railway run` to inject prod env, or source .env first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ErrorRow {
  id: string;
  code: string;
  message: string | null;
  stack: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

function parseWindow(s: string): number | null {
  const m = s.match(/^(\d+)([smhd])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2] as 's' | 'm' | 'h' | 'd';
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return n * mult;
}

async function runSummary(windowStr: string): Promise<void> {
  const ms = parseWindow(windowStr);
  if (ms === null) {
    console.error(`Unknown window '${windowStr}'. Use 10m, 1h, 6h, 1d, etc.`);
    process.exit(1);
  }
  const since = new Date(Date.now() - ms).toISOString();

  const { data, error } = await supabase
    .from('error_log')
    .select('code, created_at')
    .gte('created_at', since);
  if (error) throw error;

  const rows = (data ?? []) as Pick<ErrorRow, 'code' | 'created_at'>[];

  if (rows.length === 0) {
    console.log(`No errors in last ${windowStr}. 🎉`);
    return;
  }

  const grouped = new Map<string, { count: number; latest: string }>();
  for (const r of rows) {
    const g = grouped.get(r.code) ?? { count: 0, latest: r.created_at };
    g.count += 1;
    if (r.created_at > g.latest) g.latest = r.created_at;
    grouped.set(r.code, g);
  }

  console.log(`${rows.length} errors in last ${windowStr}:`);
  console.log();
  const sorted = [...grouped.entries()].sort((a, b) => b[1].latest.localeCompare(a[1].latest));
  for (const [code, g] of sorted) {
    console.log(`  ${String(g.count).padStart(4)}  ${code.padEnd(36)}  last: ${g.latest}`);
  }
}

async function runDetails(windowStr: string, codeFilter: string | null): Promise<void> {
  const ms = parseWindow(windowStr);
  if (ms === null) {
    console.error(`Unknown window '${windowStr}'.`);
    process.exit(1);
  }
  const since = new Date(Date.now() - ms).toISOString();

  let query = supabase
    .from('error_log')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);
  if (codeFilter) query = query.eq('code', codeFilter);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ErrorRow[];
  if (rows.length === 0) {
    console.log(`No matching errors in last ${windowStr}.`);
    return;
  }

  for (const r of rows) {
    console.log(`[${r.created_at}] ${r.code}${r.message ? ': ' + r.message : ''}`);
    if (r.context) console.log(`  context: ${JSON.stringify(r.context)}`);
    if (r.stack) {
      const firstLines = r.stack.split('\n').slice(0, 3).join('\n    ');
      console.log(`    ${firstLines}`);
    }
    console.log();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const first = args[0];

  if (!first) {
    await runSummary('24h');
    return;
  }
  if (first === 'details') {
    await runDetails(args[1] ?? '24h', null);
    return;
  }
  if (first === 'code') {
    const codeFilter = args[1];
    if (!codeFilter) {
      console.error('Usage: errors code <code_name> [window]');
      process.exit(1);
    }
    await runDetails(args[2] ?? '24h', codeFilter);
    return;
  }
  // Bare arg = window shorthand for summary
  await runSummary(first);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
