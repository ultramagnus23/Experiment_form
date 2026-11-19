import { ParticipantRow, Stage, stageOf } from './participant';
import { Settings } from './settings';
import { acceptingParticipants } from './availability';
import { TrialPayload, trialPayload } from './experiment';

export interface ClientState {
  stage: Stage;
  studyLocation?: string;
  trial?: TrialPayload & { resumed: boolean };
  closedReason?: string;
}

/** What the participant's browser is allowed to know. Never includes condition, framing label or audio type. */
export async function buildState(p: ParticipantRow | null, s: Settings): Promise<ClientState> {
  if (!p) {
    const a = await acceptingParticipants(s);
    return a.open ? { stage: 'consent', studyLocation: s.study_location } : { stage: 'closed', closedReason: a.reason };
  }
  const stage = stageOf(p.status);
  if (stage === 'consent') return { stage, studyLocation: s.study_location };
  if (stage === 'trial' && p.condition) {
    const vol = p.playback_volume !== null ? Number(p.playback_volume) : 0;
    return { stage, trial: { ...trialPayload(p.condition, vol), resumed: p.trial_started_at !== null } };
  }
  return { stage };
}
