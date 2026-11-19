import { admin } from '@/lib/admin-auth';
import { fail } from '@/lib/http';
import { query } from '@/lib/db';
import { toCsv } from '@/lib/csv';
import { audit } from '@/lib/audit';
import { summarize } from '@/lib/stats';
import { CONDITIONS, ConditionId } from '@/lib/experiment';

const KINDS = ['complete', 'conditions', 'decision_times', 'demographics'] as const;

function csvResponse(name: string, body: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}_${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = admin(async (_req, { email, params }) => {
  const kind = String(params.kind) as (typeof KINDS)[number];
  if (!KINDS.includes(kind)) return fail(404, 'Unknown export');

  let out: Response;
  let rowCount = 0;

  if (kind === 'complete') {
    const { rows } = await query(`
      SELECT p.id AS participant_id, p.status, p.created_at, p.consent, p.consented_at, p.eligible, p.eligibility_at,
             p.age, p.gender, p.major, p.demographics_at,
             p.condition, p.framing, p.audio_type, p.assigned_at, p.allocation_seq, p.allocation_method,
             p.audio_version_id, v.sha256 AS audio_sha256, p.playback_volume, p.audio_status, p.audio_interrupted,
             (SELECT count(*)::int FROM audio_events e WHERE e.participant_id = p.id) AS audio_event_count,
             p.trial_started_at, p.trial_resumed, p.decision, p.latency_ms, p.latency_seconds, p.latency_source,
             p.server_elapsed_ms, p.submitted_at, p.flags, p.excluded
        FROM participants p LEFT JOIN audio_versions v ON v.id = p.audio_version_id
       ORDER BY p.created_at`);
    rowCount = rows.length;
    const cols = rows.length ? Object.keys(rows[0]) : ['participant_id'];
    out = csvResponse('experiment_complete', toCsv(cols, rows));
  } else if (kind === 'conditions') {
    const { rows } = await query(`SELECT condition, framing, audio_type, decision, latency_ms FROM participants WHERE status='completed' AND NOT excluded`);
    const table = ([1, 2, 3, 4] as ConditionId[]).map((c) => {
      const s = summarize(rows.filter((r) => r.condition === c));
      return {
        condition: c,
        framing: CONDITIONS[c].framing,
        audio_type: CONDITIONS[c].audio,
        n: s.n,
        yes_share: s.yes,
        no_keep_private: s.no,
        yes_percent: s.yesPct?.toFixed(2) ?? '',
        no_percent: s.noPct?.toFixed(2) ?? '',
        mean_latency_ms: s.meanMs?.toFixed(2) ?? '',
        median_latency_ms: s.medianMs?.toFixed(2) ?? '',
        sd_latency_ms: s.sdMs?.toFixed(2) ?? '',
      };
    });
    rowCount = table.length;
    out = csvResponse('experiment_conditions', toCsv(Object.keys(table[0]), table));
  } else if (kind === 'decision_times') {
    const { rows } = await query(`
      SELECT id AS participant_id, condition, framing, audio_type, decision, latency_ms, latency_seconds, latency_source,
             server_elapsed_ms, submitted_at, flags, excluded
        FROM participants WHERE status='completed' ORDER BY submitted_at`);
    rowCount = rows.length;
    const cols = ['participant_id', 'condition', 'framing', 'audio_type', 'decision', 'latency_ms', 'latency_seconds', 'latency_source', 'server_elapsed_ms', 'submitted_at', 'flags', 'excluded'];
    out = csvResponse('experiment_decision_times', toCsv(cols, rows));
  } else {
    const { rows } = await query(`
      SELECT id AS participant_id, age, gender, major, condition, framing, audio_type, status, excluded
        FROM participants WHERE demographics_at IS NOT NULL ORDER BY created_at`);
    rowCount = rows.length;
    const cols = ['participant_id', 'age', 'gender', 'major', 'condition', 'framing', 'audio_type', 'status', 'excluded'];
    out = csvResponse('experiment_demographics', toCsv(cols, rows));
  }

  await audit(email, 'export', { kind, rows: rowCount });
  return out;
});
