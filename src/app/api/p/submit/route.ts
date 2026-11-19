import { z } from 'zod';
import { fail, json, readJson } from '@/lib/http';
import { tx } from '@/lib/db';
import { requireParticipant, wrongStage } from '@/lib/p-helpers';

const Body = z.object({
  decision: z.enum(['yes_share', 'no_keep_private']),
  latencyMs: z.number().finite().int().min(1).max(2 * 60 * 60 * 1000),
  audioInterrupted: z.boolean().optional(),
  audioStatus: z.enum(['started', 'started_after_tap']).optional(),
});

// Serverless cold starts / Neon wake-ups can delay either request by a couple of seconds; the browser timer is the measurement.
const MISMATCH_TOLERANCE_MS = 4000;

export async function POST(req: Request) {
  const p = await requireParticipant();
  if (p instanceof Response) return p;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'Please select an option before submitting');
  const b = parsed.data;

  const result = await tx(async (c) => {
    // Row lock + status guard makes duplicate/concurrent submissions impossible.
    const { rows } = await c.query(
      `SELECT status, decision, trial_resumed, trial_started_at,
              CASE WHEN trial_started_at IS NULL THEN NULL
                   ELSE (extract(epoch FROM (clock_timestamp() - trial_started_at)) * 1000)::int END AS server_elapsed
         FROM participants WHERE id=$1 FOR UPDATE`,
      [p.id],
    );
    const r = rows[0];
    if (!r || r.status !== 'assigned' || r.decision !== null) return 'conflict' as const;

    const flags: string[] = [];
    let latency = b.latencyMs;
    let source: 'client_monotonic' | 'server_resumed' = 'client_monotonic';
    const serverElapsed: number | null = r.server_elapsed;

    if (r.trial_resumed && serverElapsed !== null) {
      // Page was reloaded mid-trial: the browser timer from the first display is gone, so use the server's
      // measurement from first display. Flagged so researchers can exclude resumed trials.
      latency = Math.max(1, serverElapsed);
      source = 'server_resumed';
      flags.push('resumed_trial');
    } else if (serverElapsed === null) {
      flags.push('trial_start_unacknowledged');
    } else if (Math.abs(serverElapsed - b.latencyMs) > MISMATCH_TOLERANCE_MS) {
      flags.push('timing_mismatch');
    }
    if (b.audioInterrupted) flags.push('audio_interrupted');

    await c.query(
      `UPDATE participants SET
          decision=$2, latency_ms=$3, latency_seconds=$4, latency_source=$5, server_elapsed_ms=$6,
          audio_interrupted=$7, audio_status=COALESCE(audio_status, $8), flags=$9,
          submitted_at=now(), status='completed'
        WHERE id=$1`,
      [p.id, b.decision, latency, (latency / 1000).toFixed(3), source, serverElapsed, !!b.audioInterrupted, b.audioStatus ?? null, flags],
    );
    return 'ok' as const;
  });

  if (result === 'conflict') return wrongStage(p);
  return json({ ok: true });
}
