// Fixed experimental materials. SERVER-SIDE ONLY: the client never receives text for other conditions.
// Wording is exactly as supplied in the study protocol. Do not edit without ethics approval.

export type Framing = 'positive' | 'negative';
export type AudioType = 'crowd' | 'brown';
export type ConditionId = 1 | 2 | 3 | 4;

export const CONDITIONS: Record<ConditionId, { framing: Framing; audio: AudioType }> = {
  1: { framing: 'positive', audio: 'crowd' },
  2: { framing: 'positive', audio: 'brown' },
  3: { framing: 'negative', audio: 'crowd' },
  4: { framing: 'negative', audio: 'brown' },
};

export const BASELINE_PARAGRAPHS = [
  'You are taking a difficult course graded on a strict curve, meaning your final grade depends entirely on your performance rank relative to your peers.',
  'You recently discovered an advanced study technique that guarantees a 25% increase in your exam score.',
];

export const FRAMING_SENTENCE: Record<Framing, string> = {
  positive: 'If you share this technique, your classmates will gain higher scores and improve their academic standing in class.',
  negative: 'If you do not share this technique, your classmates will miss out on higher scores and academic standing.',
};

export const DECISION_QUESTION = 'Will you share this technique?';
export const DECISION_OPTIONS = [
  { value: 'yes_share', label: 'Yes, share.' },
  { value: 'no_keep_private', label: 'No, keep private.' },
] as const;
export type Decision = (typeof DECISION_OPTIONS)[number]['value'];

export function isCondition(n: unknown): n is ConditionId {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

export interface TrialPayload {
  baseline: string[];
  framingSentence: string;
  question: string;
  options: { value: string; label: string }[];
  volume: number;
}

export function trialPayload(condition: ConditionId, volume: number): TrialPayload {
  const { framing } = CONDITIONS[condition];
  return {
    baseline: BASELINE_PARAGRAPHS,
    framingSentence: FRAMING_SENTENCE[framing],
    question: DECISION_QUESTION,
    options: DECISION_OPTIONS.map((o) => ({ ...o })),
    volume,
  };
}
