import { PoolClient } from 'pg';
import { ConditionId } from './experiment';
import { newPermutedBlock, simpleDraw } from './random';

const ALLOC_LOCK = 727002;
export const BLOCK_SIZE = 4;

/**
 * Allocate a participant to exactly one condition. Must run inside a transaction.
 * - Idempotent: a participant who already has a condition keeps it.
 * - Serialised with an advisory lock so concurrent participants cannot corrupt a block.
 * - 'permuted_blocks': each block of 4 contains every condition once, order randomised by a CSPRNG.
 * - 'simple': unrestricted CSPRNG draw.
 * Allocation depends on nothing but allocation order: never on demographics or answers.
 */
export async function allocate(
  c: PoolClient,
  participantId: string,
  method: 'permuted_blocks' | 'simple',
): Promise<{ condition: ConditionId; seq: number; fresh: boolean }> {
  const p = await c.query('SELECT condition, allocation_seq FROM participants WHERE id=$1 FOR UPDATE', [participantId]);
  if (!p.rows.length) throw new Error('participant not found');
  if (p.rows[0].condition) {
    return { condition: p.rows[0].condition as ConditionId, seq: p.rows[0].allocation_seq, fresh: false };
  }

  await c.query('SELECT pg_advisory_xact_lock($1)', [ALLOC_LOCK]);
  const next = await c.query('SELECT COALESCE(MAX(seq) + 1, 0)::int AS next FROM allocations');
  const seq: number = next.rows[0].next;

  let condition: ConditionId;
  let blockIndex: number | null = null;
  if (method === 'permuted_blocks') {
    blockIndex = Math.floor(seq / BLOCK_SIZE);
    const pos = seq % BLOCK_SIZE;
    const b = await c.query('SELECT sequence FROM allocation_blocks WHERE block_index=$1', [blockIndex]);
    if (b.rows.length) {
      condition = b.rows[0].sequence[pos] as ConditionId;
    } else {
      const block = newPermutedBlock();
      await c.query('INSERT INTO allocation_blocks(block_index, sequence) VALUES ($1,$2)', [blockIndex, block]);
      condition = block[pos];
    }
  } else {
    condition = simpleDraw();
  }

  await c.query('INSERT INTO allocations(seq, participant_id, condition, block_index, method) VALUES ($1,$2,$3,$4,$5)', [
    seq,
    participantId,
    condition,
    blockIndex,
    method,
  ]);
  return { condition, seq, fresh: true };
}
