import { DateTime } from 'luxon';
import { supabase } from './supabase';
import type { FeelingTag } from './feelings';

export interface DailySummary {
  localDate: string;
  proteinGrams: number;
  weightPounds: number | null;
  feelings: FeelingTag[];
  activity: { label: string; minutes: number | null }[];
}

export interface WeeklyRecap {
  days: DailySummary[];
  weightStart: number | null;
  weightEnd: number | null;
  hasAnyData: boolean;
}

export async function getWeeklyRecap(userId: string, timezone: string): Promise<WeeklyRecap> {
  const today = DateTime.now().setZone(timezone);
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = today.minus({ days: i }).toISODate();
    if (d) dates.push(d);
  }

  const [proteinRes, weightRes, feelingsRes, activityRes] = await Promise.all([
    supabase
      .from('protein_log')
      .select('local_date, grams')
      .eq('user_id', userId)
      .in('local_date', dates),
    supabase
      .from('weight_log')
      .select('local_date, pounds, logged_at')
      .eq('user_id', userId)
      .in('local_date', dates)
      .order('logged_at', { ascending: true }),
    supabase
      .from('feeling_log')
      .select('local_date, feeling_tag')
      .eq('user_id', userId)
      .in('local_date', dates),
    supabase
      .from('activity_log')
      .select('local_date, activity_label, minutes')
      .eq('user_id', userId)
      .in('local_date', dates)
      .order('logged_at', { ascending: true }),
  ]);

  const proteinRows = (proteinRes.data ?? []) as { local_date: string; grams: number }[];
  const weightRows = (weightRes.data ?? []) as { local_date: string; pounds: number }[];
  const feelingsRows = (feelingsRes.data ?? []) as { local_date: string; feeling_tag: FeelingTag }[];
  const activityRows = (activityRes.data ?? []) as {
    local_date: string;
    activity_label: string;
    minutes: number | null;
  }[];

  const days: DailySummary[] = dates.map((date) => {
    const protein = proteinRows
      .filter((r) => r.local_date === date)
      .reduce((s, r) => s + r.grams, 0);
    const weights = weightRows.filter((r) => r.local_date === date);
    const latest = weights.length ? Number(weights[weights.length - 1].pounds) : null;
    const feelings = Array.from(
      new Set(feelingsRows.filter((r) => r.local_date === date).map((r) => r.feeling_tag)),
    );
    const activity = activityRows
      .filter((r) => r.local_date === date)
      .map((r) => ({ label: r.activity_label, minutes: r.minutes }));
    return { localDate: date, proteinGrams: protein, weightPounds: latest, feelings, activity };
  });

  const weighIns = days.filter((d) => d.weightPounds !== null);
  const weightStart = weighIns[0]?.weightPounds ?? null;
  const weightEnd = weighIns[weighIns.length - 1]?.weightPounds ?? null;

  const hasAnyData = days.some(
    (d) =>
      d.proteinGrams > 0 ||
      d.weightPounds !== null ||
      d.feelings.length > 0 ||
      d.activity.length > 0,
  );

  return { days, weightStart, weightEnd, hasAnyData };
}

export function formatWeeklyRecap(recap: WeeklyRecap): string {
  if (!recap.hasAnyData) return '';

  const lines: string[] = [
    'LAST 7 DAYS (silently extracted from chat — reference only when the user asks for a recap / progress / "how am I doing"):',
  ];

  for (const d of recap.days) {
    const parts: string[] = [];
    if (d.proteinGrams > 0) parts.push(`${d.proteinGrams}g protein`);
    if (d.weightPounds !== null) parts.push(`${d.weightPounds} lb`);
    if (d.feelings.length) parts.push(d.feelings.join(', ').replace(/_/g, ' '));
    if (d.activity.length) {
      parts.push(
        d.activity
          .map((a) => (a.minutes ? `${a.label} (${a.minutes}m)` : a.label))
          .join(', '),
      );
    }
    const day = DateTime.fromISO(d.localDate).toFormat('EEE LLL d');
    lines.push(`- ${day}: ${parts.length ? parts.join(' · ') : '(no data)'}`);
  }

  if (
    recap.weightStart !== null &&
    recap.weightEnd !== null &&
    recap.weightStart !== recap.weightEnd
  ) {
    const delta = recap.weightEnd - recap.weightStart;
    const sign = delta < 0 ? '-' : '+';
    lines.push(
      `Weight trend: ${recap.weightStart} → ${recap.weightEnd} (${sign}${Math.abs(delta).toFixed(1)} lb)`,
    );
  }

  return lines.join('\n');
}
