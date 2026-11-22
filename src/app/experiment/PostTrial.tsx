'use client';
import { useState } from 'react';
import { ATTENTION_QUESTION, DEBRIEF_TEXT, LIKERT_LABELS, MANIPULATION_QUESTIONS } from '@/lib/manipulation';
import { Actions, Banner, Question, Radio, Shell, TitleCard } from './ui';

export function ManipulationPage({ busy, flash, onNext }: { busy: boolean; flash: string | null; onNext: (answers: Record<string, unknown>) => void }) {
  const [answers, setAnswers] = useState<Record<string, number | undefined>>({});
  const [attention, setAttention] = useState<string>('');
  const [tried, setTried] = useState(false);

  const missing = MANIPULATION_QUESTIONS.some((q) => answers[q.key] === undefined) || !attention;

  return (
    <Shell>
      <TitleCard title="A few questions">Please answer the following questions about the experience you just completed.</TitleCard>

      {MANIPULATION_QUESTIONS.map((q) => (
        <Question key={q.key} label={q.label} error={tried && answers[q.key] === undefined ? 'This is a required question' : null}>
          <div role="radiogroup" aria-label={q.label}>
            {LIKERT_LABELS.map((label, i) => (
              <Radio key={i} name={q.key} value={String(i + 1)} checked={answers[q.key] === i + 1} onChange={() => setAnswers((a) => ({ ...a, [q.key]: i + 1 }))}>
                {label}
              </Radio>
            ))}
          </div>
        </Question>
      ))}

      <Question label={ATTENTION_QUESTION.label} error={tried && !attention ? 'This is a required question' : null}>
        <div role="radiogroup" aria-label={ATTENTION_QUESTION.label}>
          {ATTENTION_QUESTION.options.map((o) => (
            <Radio key={o.value} name="attention" value={o.value} checked={attention === o.value} onChange={setAttention}>
              {o.label}
            </Radio>
          ))}
        </div>
      </Question>

      {flash ? <Banner>{flash}</Banner> : null}
      <Actions>
        <button
          className="gf-btn"
          disabled={busy}
          onClick={() => {
            setTried(true);
            if (missing) return;
            onNext({
              manip_distraction: answers.manip_distraction,
              manip_talking: answers.manip_talking,
              manip_positive: answers.manip_positive,
              attention,
            });
          }}
        >
          Next
        </button>
      </Actions>
    </Shell>
  );
}

export function DebriefPage({ busy, flash, onNext }: { busy: boolean; flash: string | null; onNext: () => void }) {
  const [title, ...paragraphs] = DEBRIEF_TEXT;
  return (
    <Shell>
      <TitleCard title="Debrief">
        <p className="mb-3 font-medium">{title}</p>
        {paragraphs.map((p, i) => (
          <p key={i} className="mb-3">
            {p}
          </p>
        ))}
      </TitleCard>
      {flash ? <Banner>{flash}</Banner> : null}
      <Actions>
        <button className="gf-btn" disabled={busy} onClick={onNext}>
          Finish
        </button>
      </Actions>
    </Shell>
  );
}
