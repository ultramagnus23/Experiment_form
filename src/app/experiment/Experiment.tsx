'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExperimentAudio } from '@/lib/client-audio';
import ConsentText from './ConsentText';
import TrialPage, { TrialData } from './TrialPage';
import { Actions, Banner, Card, Question, Radio, Shell, TitleCard } from './ui';
import { DebriefPage, ManipulationPage } from './PostTrial';

type Stage = 'closed' | 'consent' | 'declined' | 'eligibility' | 'ineligible' | 'demographics' | 'instructions' | 'trial' | 'manipulation' | 'debrief' | 'complete';
interface ClientState {
  stage: Stage;
  studyLocation?: string;
  trial?: TrialData & { resumed: boolean };
}

// Module-level memo: React StrictMode (dev) runs effects twice; this guarantees ONE participant is created.
let startPromise: Promise<ClientState> | null = null;
function startSession(force = false): Promise<ClientState> {
  if (!startPromise || force) {
    startPromise = fetch('/api/p/start', { method: 'POST', credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error('start failed');
      return r.json();
    });
    startPromise.catch(() => (startPromise = null));
  }
  return startPromise;
}

async function post(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await r.json();
  } catch {}
  return { ok: r.ok, status: r.status, data };
}

export default function Experiment() {
  const [state, setState] = useState<ClientState | null>(null);
  const [fatal, setFatal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const audioRef = useRef<ExperimentAudio | null>(null);

  useEffect(() => {
    startSession()
      .then(setState)
      .catch(() => setFatal(true));
  }, []);

  // Participants cannot navigate backwards: the browser Back button is neutralised and the server is authoritative.
  useEffect(() => {
    history.pushState(null, '', location.href);
    const onPop = () => history.pushState(null, '', location.href);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const resync = useCallback(async () => {
    const r = await fetch('/api/p/state', { credentials: 'same-origin' });
    if (r.ok) setState(await r.json());
  }, []);

  /** POST a transition and apply the server's resulting state. Handles lost sessions and stale stages. */
  const advance = useCallback(
    async (path: string, body?: unknown): Promise<{ ok: boolean; data: any }> => {
      setBusy(true);
      setFlash(null);
      try {
        const r = await post(path, body);
        if (r.status === 401) {
          setState(await startSession(true));
          return { ok: false, data: r.data };
        }
        if (r.ok) {
          setState(r.data);
          return { ok: true, data: r.data };
        }
        if (r.status === 503 && r.data?.stage === 'closed') {
          setState({ stage: 'closed' });
          return { ok: false, data: r.data };
        }
        if (r.status === 409) {
          await resync();
          return { ok: false, data: r.data };
        }
        setFlash(r.data?.error ?? 'Something went wrong. Please try again.');
        return { ok: false, data: r.data };
      } catch {
        setFlash('Connection problem. Please try again.');
        return { ok: false, data: null };
      } finally {
        setBusy(false);
      }
    },
    [resync],
  );

  if (fatal) {
    return (
      <Shell>
        <Banner>This page could not be loaded. Please refresh, or tell the experimenter.</Banner>
      </Shell>
    );
  }
  if (!state) return <Shell />;

  switch (state.stage) {
    case 'closed':
      return (
        <Shell>
          <TitleCard title="Decision-Making Study">This study is not currently accepting responses. Please speak to the experimenter.</TitleCard>
        </Shell>
      );
    case 'consent':
      return <ConsentPage studyLocation={state.studyLocation} busy={busy} flash={flash} onNext={(agree) => advance('/api/p/consent', { agree })} />;
    case 'declined':
      return (
        <Shell>
          <TitleCard title="Participation ended">
            Thank you for your time. You have chosen not to take part in this study. No further information has been collected.
          </TitleCard>
        </Shell>
      );
    case 'eligibility':
      return <EligibilityPage busy={busy} flash={flash} onNext={(meets) => advance('/api/p/eligibility', { meets })} />;
    case 'ineligible':
      return (
        <Shell>
          <TitleCard title="Thank you for your interest">
            Based on your response, you are not eligible to take part in this study. No further information has been collected.
          </TitleCard>
        </Shell>
      );
    case 'demographics':
      return <DemographicsPage busy={busy} flash={flash} onNext={(b) => advance('/api/p/demographics', b)} />;
    case 'instructions':
      return (
        <InstructionsPage
          busy={busy}
          flash={flash}
          onNext={async () => {
            // The audio context MUST be created inside this click handler (user gesture), before any await.
            audioRef.current = ExperimentAudio.createInGesture();
            const r = await advance('/api/p/begin');
            if (!r.ok) {
              audioRef.current?.stop();
              audioRef.current = null;
            }
          }}
        />
      );
    case 'trial':
      if (!state.trial) return <Shell />;
      return (
        <TrialPage
          trial={state.trial}
          preAudio={state.trial.resumed ? null : audioRef.current}
          post={post}
          onDone={() => setState({ stage: 'manipulation' })}
        />
      );
    case 'manipulation':
      return (
        <ManipulationPage busy={busy} flash={flash} onNext={(answers) => advance('/api/p/manipulation', answers)} />
      );
    case 'debrief':
      return <DebriefPage busy={busy} flash={flash} onNext={() => advance('/api/p/debrief')} />;
    case 'complete':
      return (
        <Shell>
          <TitleCard title="Decision-Making Study">Your response has been recorded. Thank you for participating in this study.</TitleCard>
        </Shell>
      );
  }
}

/* ------------------------------ Pages ------------------------------ */

function ConsentPage({ studyLocation, busy, flash, onNext }: { studyLocation?: string; busy: boolean; flash: string | null; onNext: (agree: boolean) => void }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState(false);
  return (
    <Shell step={1}>
      <TitleCard title="Decision-Making Study">
        <p>Please read the information below carefully before deciding whether to take part.</p>
      </TitleCard>
      <Card>
        <ConsentText studyLocation={studyLocation} />
      </Card>
      <Question
        label="I have read and understood the information above. I voluntarily agree to participate in this research study."
        error={err && !v ? 'This is a required question' : null}
      >
        <div role="radiogroup">
          <Radio name="consent" value="yes" checked={v === 'yes'} onChange={setV}>
            Yes, I agree to participate.
          </Radio>
          <Radio name="consent" value="no" checked={v === 'no'} onChange={setV}>
            No, I do not agree to participate.
          </Radio>
        </div>
      </Question>
      {flash ? <Banner>{flash}</Banner> : null}
      <Actions>
        <button
          className="gf-btn"
          disabled={busy}
          onClick={() => {
            if (!v) return setErr(true);
            onNext(v === 'yes');
          }}
        >
          Next
        </button>
      </Actions>
    </Shell>
  );
}

function EligibilityPage({ busy, flash, onNext }: { busy: boolean; flash: string | null; onNext: (meets: boolean) => void }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState(false);
  return (
    <Shell step={2}>
      <TitleCard title="Eligibility" />
      <Question
        label={
          <div>
            <ol className="mb-3 list-decimal pl-6 text-[14px] leading-6">
              <li>You are an undergraduate student at Ashoka University between the ages of 18–22.</li>
              <li>You have normal or corrected-to-normal vision and hearing.</li>
              <li>You are fluent in English.</li>
            </ol>
            <p className="text-[14px]">If you meet all three criteria, please click Yes; otherwise, please click No.</p>
          </div>
        }
        error={err && !v ? 'This is a required question' : null}
      >
        <div role="radiogroup">
          <Radio name="elig" value="yes" checked={v === 'yes'} onChange={setV}>
            Yes, I meet all three criteria.
          </Radio>
          <Radio name="elig" value="no" checked={v === 'no'} onChange={setV}>
            No, I do not meet all three criteria.
          </Radio>
        </div>
      </Question>
      {flash ? <Banner>{flash}</Banner> : null}
      <Actions>
        <button
          className="gf-btn"
          disabled={busy}
          onClick={() => {
            if (!v) return setErr(true);
            onNext(v === 'yes');
          }}
        >
          Next
        </button>
      </Actions>
    </Shell>
  );
}

function DemographicsPage({ busy, flash, onNext }: { busy: boolean; flash: string | null; onNext: (b: any) => void }) {
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [genderOther, setGenderOther] = useState('');
  const [major, setMajor] = useState('');
  const [tried, setTried] = useState(false);

  const ageNum = age.trim() === '' ? NaN : Number(age);
  const ageErr = !age.trim() ? 'This is a required question' : !Number.isInteger(ageNum) || ageNum < 18 || ageNum > 22 ? 'Age must be a whole number between 18 and 22' : null;
  const genderErr = !gender ? 'This is a required question' : gender === 'self_describe' && !genderOther.trim() ? 'Please describe your gender' : null;
  const majorErr = !major.trim() ? 'This is a required question' : null;

  return (
    <Shell step={3}>
      <TitleCard title="Demographic Details">Please fill in the following details according to yourself.</TitleCard>

      <Question label="Age" error={tried ? ageErr : null}>
        <input className="gf-input max-w-[200px]" type="number" inputMode="numeric" min={18} max={22} step={1} value={age} onChange={(e) => setAge(e.target.value)} placeholder="Your answer" aria-label="Age" />
      </Question>

      <Question label="Gender" error={tried ? genderErr : null}>
        <div role="radiogroup">
          {[
            ['woman', 'Woman'],
            ['man', 'Man'],
            ['non_binary', 'Non-binary'],
          ].map(([v, l]) => (
            <Radio key={v} name="gender" value={v} checked={gender === v} onChange={setGender}>
              {l}
            </Radio>
          ))}
          <div className="flex items-center gap-3 py-2">
            <input type="radio" name="gender" className="h-5 w-5 shrink-0" checked={gender === 'self_describe'} onChange={() => setGender('self_describe')} aria-label="Prefer to self-describe" />
            <input
              className="gf-input"
              placeholder="Prefer to self-describe"
              maxLength={60}
              value={genderOther}
              onFocus={() => setGender('self_describe')}
              onChange={(e) => {
                setGender('self_describe');
                setGenderOther(e.target.value);
              }}
              aria-label="Self-described gender"
            />
          </div>
          <Radio name="gender" value="prefer_not_to_say" checked={gender === 'prefer_not_to_say'} onChange={setGender}>
            Prefer not to say
          </Radio>
        </div>
      </Question>

      <Question label="Major" error={tried ? majorErr : null}>
        <input className="gf-input" type="text" maxLength={100} value={major} onChange={(e) => setMajor(e.target.value)} placeholder="Your answer" aria-label="Major" />
      </Question>

      {flash ? <Banner>{flash}</Banner> : null}
      <Actions>
        <button
          className="gf-btn"
          disabled={busy}
          onClick={() => {
            setTried(true);
            if (ageErr || genderErr || majorErr) return;
            onNext({ age: ageNum, genderChoice: gender, genderOther: gender === 'self_describe' ? genderOther : undefined, major });
          }}
        >
          Next
        </button>
      </Actions>
    </Shell>
  );
}

function InstructionsPage({ busy, flash, onNext }: { busy: boolean; flash: string | null; onNext: () => void }) {
  return (
    <Shell step={4}>
      <TitleCard title="Instructions">
        <p className="mb-3">
          On the next screen you will read a short scenario and answer one question. Please read it carefully and respond as you naturally would. There are no right or wrong answers. Once you submit, you cannot go back.
        </p>
        <p>Please wait for the Experimenter to give you headphones as you will be hearing an audio once you click Next.</p>
      </TitleCard>
      {flash ? <Banner>{flash}</Banner> : null}
      <Actions>
        <button className="gf-btn" disabled={busy} onClick={onNext}>
          Next
        </button>
      </Actions>
    </Shell>
  );
}
