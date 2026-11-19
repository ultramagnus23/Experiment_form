import { json } from '@/lib/http';
import { currentParticipant } from '@/lib/participant';
import { getSettings } from '@/lib/settings';
import { buildState } from '@/lib/state';

export async function GET() {
  const p = await currentParticipant();
  return json(await buildState(p, await getSettings()));
}
