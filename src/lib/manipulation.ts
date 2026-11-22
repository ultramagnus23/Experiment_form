// Post-trial manipulation checks and attention check. Shown after the decision, before the debrief.
// 1 = lowest, 4 = highest. The attention check has no correct answer: the chosen option is recorded as-is.

export const LIKERT_LABELS = ['Not at all', 'Slightly', 'Moderately', 'Very much'] as const;

export const MANIPULATION_QUESTIONS = [
  { key: 'manip_distraction', label: 'How distracting was the background sound?' },
  { key: 'manip_talking', label: 'How much of the sound consisted of people talking?' },
  { key: 'manip_positive', label: 'How positively was the scenario worded?' },
] as const;

export const ATTENTION_QUESTION = {
  label: 'What did the technique guarantee?',
  options: [
    { value: 'a', label: 'a. 25% increase in your exam score' },
    { value: 'b', label: 'b. A free textbook' },
    { value: 'c', label: 'c. A place on the dean’s list' },
    { value: 'd', label: 'd. A grade of A' },
  ],
} as const;

export const DEBRIEF_TEXT = [
  'Thank you for your participation!',
  'This study is designed to understand the influence of noise conditions, and framing effect on the time it takes to make decisions. The main aim is to complement the current literature and attempt to analyze the phenomenon of distraction and sentence construction interfering with decision-making.',
  'We predict that decisions made under crowd noise which is more fluctuating and dynamic than brown noise, will take more time. We also predict that decisions made when the dilemma was presented as a negatively framed sentence will take more time. Ultimately, the aim of this research is to aid the understanding between auditory stimulation and framing of the dilemma on time taken to make decisions.',
  'We are truly grateful for your participation. Your contribution to our study will help us in understanding the complexities of external stimuli and language on decision-making.',
  'Please contact Akshita Sinha (akshita.sinha_ug2025@ashoka.edu.in), Gunn Malhotra (gunn.malhotra_ug2024@ashoka.edu.in), Ishani Dhingra (ishani.dhingra_ug2025@ashoka.edu.in), Meenal Goel (meenal.goel_ug2024@ashoka.edu.in), Zitien Tickoo (zitien.tickoo_ug2025@ashoka.edu.in) with any questions or concerns you may have about this research.',
] as const;
