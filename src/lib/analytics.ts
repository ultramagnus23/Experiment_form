import { query } from './db';
import { CONDITIONS, ConditionId } from './experiment';
import { GroupSummary, summarize } from './stats';

export interface CompletedRow {
  id: string;
  condition: ConditionId;
  framing: 'positive' | 'negative';
  audio_type: 'crowd' | 'brown';
  decision: 'yes_share' | 'no_keep_private';
  latency_ms: number;
  flags: string[];
  age: number;
  gender: string;
  major: string;
}

export async function completedRows(excludeFlagged: boolean): Promise<CompletedRow[]> {
  const { rows } = await query<CompletedRow>(
    `SELECT id, condition, framing, audio_type, decision, latency_ms, flags, age, gender, major
       FROM participants
      WHERE status='completed' AND NOT excluded ${excludeFlagged ? 'AND cardinality(flags) = 0' : ''}
      ORDER BY submitted_at`,
  );
  return rows;
}

function countBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, count]) => ({ label, count }));
}

export async function computeStats(excludeFlagged: boolean) {
  const o = (
    await query(`
    SELECT count(*)::int AS opened,
           count(*) FILTER (WHERE consent)::int AS consented,
           count(*) FILTER (WHERE consent = false)::int AS declined,
           count(*) FILTER (WHERE eligible)::int AS eligible,
           count(*) FILTER (WHERE eligible = false)::int AS ineligible,
           count(*) FILTER (WHERE status='completed')::int AS completed,
           count(*) FILTER (WHERE status NOT IN ('completed','declined','ineligible'))::int AS incomplete,
           count(*) FILTER (WHERE condition IS NOT NULL)::int AS assigned,
           count(*) FILTER (WHERE excluded)::int AS excluded,
           count(*) FILTER (WHERE status='completed' AND cardinality(flags) > 0)::int AS flagged
      FROM participants`)
  ).rows[0];

  const assignedBy = (await query('SELECT condition, count(*)::int AS n FROM participants WHERE condition IS NOT NULL GROUP BY condition')).rows;
  const assignedMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of assignedBy) assignedMap[r.condition] = r.n;

  const rows = await completedRows(excludeFlagged);

  const conditions = ([1, 2, 3, 4] as ConditionId[]).map((c) => {
    const sub = rows.filter((r) => r.condition === c);
    return {
      condition: c,
      framing: CONDITIONS[c].framing,
      audio: CONDITIONS[c].audio,
      assigned: assignedMap[c],
      ...summarize(sub),
    };
  });

  const group = (pred: (r: CompletedRow) => boolean): GroupSummary => summarize(rows.filter(pred));
  const framing = { positive: group((r) => r.framing === 'positive'), negative: group((r) => r.framing === 'negative') };
  const noise = { crowd: group((r) => r.audio_type === 'crowd'), brown: group((r) => r.audio_type === 'brown') };

  const points = rows.map((r) => ({ id: r.id, condition: r.condition, latency_ms: r.latency_ms, decision: r.decision, flagged: r.flags.length > 0 }));

  const ages = countBy(rows, (r) => String(r.age)).sort((a, b) => Number(a.label) - Number(b.label));
  const genders = countBy(rows, (r) => r.gender).sort((a, b) => b.count - a.count);
  const majorsMap = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const key = r.major.trim().toLowerCase();
    const e = majorsMap.get(key);
    if (e) e.count++;
    else majorsMap.set(key, { label: r.major.trim(), count: 1 });
  }
  const majors = [...majorsMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { overview: o, conditions, framing, noise, points, demographics: { ages, genders, majors }, analysed: rows.length, excludeFlagged };
}
