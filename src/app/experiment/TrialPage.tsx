'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLoadError, ExperimentAudio } from '@/lib/client-audio';
import { Actions, Banner, Question, Radio, Shell, TitleCard, Card } from './ui';

export interface TrialData {
  baseline: string[];
  framingSentence: string;
  question: string;
  options: { value: string; label: string }[];
  volume: number;
}

type Phase = 'preparing' | 'tap' | 'error' | 'vignette' | 'submitting';
type Post = (path: string, body?: unknown) => Promise<{ ok: boolean; status: number; data: any }>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The experimental page.
 *  1. Audio is loaded and started (using the gesture from the previous page's Next click when available).
 *  2. Only once the audio clock is verifiably advancing is the vignette rendered.
 *  3. The latency timer starts after the vignette has actually been painted (double requestAnimationFrame) and uses
 *     performance.now() (monotonic). It lives in a ref, so React re-renders never reset it.
 *  4. On submit the elapsed time is captured synchronously in the click handler, audio is stopped, then the result is sent.
 */
export default function TrialPage({
  trial,
  preAudio,
  post,
  onDone,
}: {
  trial: TrialData;
  preAudio: ExperimentAudio | null;
  post: Post;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(preAudio ? 'preparing' : 'tap');
  const [choice, setChoice] = useState<string>('');
  const [showRequired, setShowRequired] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [timerOn, setTimerOn] = useState(false);

  const audioRef = useRef<ExperimentAudio | null>(preAudio);
  const modeRef = useRef<'started' | 'started_after_tap'>('started');
  const t0 = useRef<number | null>(null);
  const flowStarted = useRef(false);
  const submitting = useRef(false);
  const latencyRef = useRef<number>(0);
  const interruptedRef = useRef(false);
  const choiceRef = useRef('');

  const report = useCallback(
    (kind: string, detail?: string) => {
      post('/api/p/audio-event', { kind, detail }).catch(() => {});
    },
    [post],
  );

  const runAudio = useCallback(
    async (a: ExperimentAudio, viaTap: boolean) => {
      setPhase('preparing');
      try {
        if (!a.hasStarted) {
          const buf = await a.load('/api/p/audio');
          a.start(buf, trial.volume);
        }
      } catch (e) {
        const err = e as AudioLoadError;
        report(err.kind ?? 'play_error', err.message);
        setErrorMsg('The audio could not be started.');
        setPhase('error');
        return;
      }
      const ok = await a.confirmRunning();
      if (!ok) {
        if (viaTap) {
          report('blocked', 'not running after tap');
          setErrorMsg('The audio could not be started.');
          setPhase('error');
        } else {
          report('tap_required');
          setPhase('tap');
        }
        return;
      }
      modeRef.current = viaTap ? 'started_after_tap' : 'started';
      setPhase('vignette');
    },
    [report, trial.volume],
  );

  // First entry: use the audio context that was unlocked by the Next click on the Instructions page.
  useEffect(() => {
    if (flowStarted.current || !preAudio) return;
    flowStarted.current = true;
    runAudio(preAudio, false);
  }, [preAudio, runAudio]);

  // Tap-to-start (autoplay blocked, or page reloaded mid-trial).
  const onTap = () => {
    let a = audioRef.current;
    if (!a || a.ctx.state === 'closed') {
      a = ExperimentAudio.createInGesture(); // inside the tap gesture
      audioRef.current = a;
    } else {
      a.ctx.resume().catch(() => {});
    }
    if (!a) {
      setErrorMsg('This browser cannot play the experiment audio.');
      setPhase('error');
      return;
    }
    flowStarted.current = true;
    runAudio(a, true);
  };

  // Start the timer only after the vignette has been painted.
  useEffect(() => {
    if (phase !== 'vignette' || t0.current !== null) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (t0.current !== null) return;
        t0.current = performance.now();
        setTimerOn(true);
        (async () => {
          for (let i = 0; i < 3; i++) {
            const r = await post('/api/p/trial-start', { audioStatus: modeRef.current }).catch(() => null);
            if (r?.ok) return;
            await sleep(400);
          }
        })();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase, post]);

  // Prevent accidental reload / navigation during the trial.
  useEffect(() => {
    if (phase !== 'vignette') return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [phase]);

  // Safety: audio never outlives the page.
  useEffect(() => {
    const stop = () => audioRef.current?.stop();
    window.addEventListener('pagehide', stop);
    return () => window.removeEventListener('pagehide', stop);
  }, []);

  const send = useCallback(async () => {
    setSendFailed(false);
    setPhase('submitting');
    for (let i = 0; i < 4; i++) {
      const r = await post('/api/p/submit', {
        decision: choiceRef.current,
        latencyMs: latencyRef.current,
        audioInterrupted: interruptedRef.current,
        audioStatus: modeRef.current,
      }).catch(() => null);
      if (r && (r.ok || r.status === 409)) {
        onDone();
        return;
      }
      if (r && r.status === 400) break;
      await sleep(600 * (i + 1));
    }
    setSendFailed(true);
  }, [post, onDone]);

  const onSubmit = () => {
    if (submitting.current || t0.current === null) return;
    if (!choice) {
      setShowRequired(true); // the timer keeps running: no valid decision yet
      return;
    }
    // Capture time FIRST, synchronously, then stop audio.
    const t1 = performance.now();
    submitting.current = true;
    latencyRef.current = Math.max(1, Math.round(t1 - t0.current));
    choiceRef.current = choice;
    interruptedRef.current = audioRef.current?.interrupted ?? false;
    audioRef.current?.stop();
    window.onbeforeunload = null;
    send();
  };

  if (phase === 'preparing') {
    return (
      <Shell step={5}>
        <TitleCard title="Please wait…" />
      </Shell>
    );
  }

  if (phase === 'tap') {
    return (
      <Shell step={5}>
        <TitleCard title="Tap once to start the experiment audio">
          <p className="mb-4">Please make sure you are wearing the headphones, then tap the button below.</p>
          <Actions>
            <button className="gf-btn" onClick={onTap}>
              Start
            </button>
          </Actions>
        </TitleCard>
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell step={5}>
        <Banner>{errorMsg} Please let the experimenter know.</Banner>
        <Card>
          <Actions>
            <button className="gf-btn" onClick={onTap}>
              Try again
            </button>
          </Actions>
        </Card>
      </Shell>
    );
  }

  // vignette | submitting
  return (
    <Shell step={5}>
      <TitleCard title="Scenario">
        {trial.baseline.map((t, i) => (
          <p key={i} className="mb-3">
            {t}
          </p>
        ))}
        <p>{trial.framingSentence}</p>
      </TitleCard>
      <Question label={trial.question} error={showRequired && !choice ? 'This is a required question' : null}>
        <div role="radiogroup" aria-label={trial.question}>
          {trial.options.map((o) => (
            <Radio key={o.value} name="decision" value={o.value} checked={choice === o.value} disabled={phase === 'submitting'} onChange={setChoice}>
              {o.label}
            </Radio>
          ))}
        </div>
      </Question>
      {sendFailed ? <Banner>Your response could not be saved. Please check the connection and try again.</Banner> : null}
      <Actions>
        <button className="gf-btn" onClick={sendFailed ? send : onSubmit} disabled={phase === 'submitting' || !timerOn}>
          {phase === 'submitting' ? 'Submitting…' : sendFailed ? 'Try again' : 'Submit'}
        </button>
      </Actions>
    </Shell>
  );
}
