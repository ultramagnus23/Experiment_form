import { z } from 'zod';
import { fail, json, readJson } from '@/lib/http';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { buildState } from '@/lib/state';
import { participantById, requireParticipant, wrongStage } from '@/lib/p-helpers';

// Strip control characters and collapse whitespace.
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

const Body = z.object({
  age: z.number({ invalid_type_error: 'Age must be a number' }).int('Age must be a whole number').min(18, 'Age must be between 18 and 22').max(22, 'Age must be between 18 and 22'),
  genderChoice: z.enum(['woman', 'man', 'non_binary', 'self_describe', 'prefer_not_to_say']),
  genderOther: z.string().max(60).optional(),
  major: z.string().transform(clean).pipe(z.string().min(1, 'Please enter your major').max(100)),
});

const GENDER_LABEL = { woman: 'Woman', man: 'Man', non_binary: 'Non-binary', prefer_not_to_say: 'Prefer not to say' } as const;

export async function POST(req: Request) {
  const p = await requireParticipant();
  if (p instanceof Response) return p;
  if (p.status !== 'eligible') return wrongStage(p);

  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid input', { field: parsed.error.issues[0]?.path[0] });
  const b = parsed.data;

  let gender: string;
  if (b.genderChoice === 'self_describe') {
    gender = clean(b.genderOther ?? '');
    if (!gender) return fail(400, 'Please describe your gender or choose another option', { field: 'gender' });
  } else {
    gender = GENDER_LABEL[b.genderChoice];
  }

  const r = await query(
    `UPDATE participants SET age=$2, gender=$3, major=$4, demographics_at=now(), status='demographics_done'
      WHERE id=$1 AND status='eligible' RETURNING id`,
    [p.id, b.age, gender, b.major],
  );
  if (!r.rowCount) return wrongStage(await participantById(p.id));
  return json(await buildState(await participantById(p.id), await getSettings()));
}
