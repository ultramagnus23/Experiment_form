'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadPresigned as blobUpload } from '@vercel/blob/client';
import { api, fmtDate } from './fmt';

export default function SettingsTab({ onChange }: { onChange: () => void }) {
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [audio, setAudio] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([api('/api/admin/settings'), api('/api/admin/audio')]);
    if (s.ok) {
      setData(s.data);
      setForm(s.data.settings);
    }
    if (a.ok) setAudio(a.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(partial: Record<string, unknown>, okMsg = 'Saved.') {
    const r = await api('/api/admin/settings', { method: 'PUT', json: partial });
    setMsg(r.ok ? okMsg : r.data?.error ?? 'Failed to save');
    await load();
    onChange();
  }

  if (!form || !audio) return <p className="text-sm text-gf-muted">Loading…</p>;
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });
  const inp = 'rounded border border-gf-border px-3 py-1.5 text-sm';

  return (
    <div className="space-y-6">
      {msg ? <p className="rounded border border-gf-border bg-white p-3 text-sm">{msg}</p> : null}

      <section className="rounded-lg border border-gf-border bg-white p-4 space-y-3">
        <h2 className="text-base font-medium">Experiment status</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-3 py-0.5 text-xs ${form.experiment_enabled ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{form.experiment_enabled ? 'Enabled' : 'Disabled'}</span>
          <button className="gf-btn" onClick={() => save({ experiment_enabled: !form.experiment_enabled }, form.experiment_enabled ? 'Experiment disabled: new participants are blocked.' : 'Experiment enabled.')}>
            {form.experiment_enabled ? 'Disable experiment' : 'Enable experiment'}
          </button>
          <span className="text-xs text-gf-muted">Disabling blocks new participants and new allocations; people already allocated can finish.</span>
        </div>
        {!data.audioReady && <p className="text-xs text-gf-error">Upload both audio files before enabling.</p>}
        <p className="text-sm">Completed responses: <b>{data.completed}</b> / target {form.target_sample_size}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">Audio</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <AudioSlot slot="crowd" title="Crowd noise (Conditions 1 and 3)" active={audio.active.crowd} storage={audio.storage} volume={form.playback_volume} onDone={load} setMsg={setMsg} />
          <AudioSlot slot="brown" title="Brown noise (Conditions 2 and 4)" active={audio.active.brown} storage={audio.storage} volume={form.playback_volume} onDone={load} setMsg={setMsg} />
        </div>
        <details className="rounded-lg border border-gf-border bg-white p-3 text-sm">
          <summary className="cursor-pointer">Version history ({audio.history.length})</summary>
          <table className="mt-2 w-full text-xs">
            <thead><tr className="text-left text-gf-muted"><th>ID</th><th>Slot</th><th>File</th><th>Duration</th><th>Uploaded</th><th>By</th><th>Participants</th><th>Active</th></tr></thead>
            <tbody>
              {audio.history.map((v: any) => (
                <tr key={v.id} className="border-t border-gray-100">
                  <td>{v.id}</td><td>{v.slot}</td><td>{v.original_filename}</td><td>{v.duration_seconds.toFixed(1)} s</td><td>{fmtDate(v.uploaded_at)}</td><td>{v.uploaded_by}</td><td>{v.participants_assigned}</td><td>{v.is_active ? 'yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gf-muted">Replacing a file never alters past participants: each record keeps the exact version it heard.</p>
        </details>
      </section>

      <section className="rounded-lg border border-gf-border bg-white p-4 space-y-4">
        <h2 className="text-base font-medium">Playback volume</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Approved volume cap (0–1): <b>{Number(form.volume_cap).toFixed(2)}</b>
            <input type="range" min={0} max={1} step={0.01} value={form.volume_cap} onChange={(e) => set('volume_cap', Number(e.target.value))} className="mt-1 w-full" />
          </label>
          <label className="block text-sm">
            Standardised playback volume (0–cap): <b>{Number(form.playback_volume).toFixed(2)}</b>
            <input type="range" min={0} max={Math.max(form.volume_cap, 0.01)} step={0.01} value={Math.min(form.playback_volume, form.volume_cap)} onChange={(e) => set('playback_volume', Number(e.target.value))} className="mt-1 w-full" />
          </label>
        </div>
        <p className="text-xs text-gf-muted">
          This is a digital gain applied identically to every participant; the real sound level also depends on the device and headphone volume. Fix the device volume, measure the output with a sound-level meter, and get the cap approved by your ethics board. Match the loudness of the two audio files beforehand (e.g. equal LUFS), or volume differs between sound conditions.
        </p>
        <button className="gf-btn" onClick={() => save({ volume_cap: form.volume_cap, playback_volume: Math.min(form.playback_volume, form.volume_cap) })}>Save volume settings</button>
      </section>

      <section className="rounded-lg border border-gf-border bg-white p-4 space-y-4">
        <h2 className="text-base font-medium">Study settings</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">Target sample size
            <input type="number" min={1} className={inp + ' mt-1 block w-32'} value={form.target_sample_size} onChange={(e) => set('target_sample_size', Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-2 text-sm md:pt-6">
            <input type="checkbox" checked={form.auto_close_at_target} onChange={(e) => set('auto_close_at_target', e.target.checked)} />
            Automatically close the study when the target is reached
          </label>
          <label className="block text-sm">Allocation method
            <select className={inp + ' mt-1 block'} value={form.allocation_method} disabled={data.allocationsExist} onChange={(e) => set('allocation_method', e.target.value)}>
              <option value="permuted_blocks">Randomised permuted blocks of 4 (recommended)</option>
              <option value="simple">Simple randomisation</option>
            </select>
            {data.allocationsExist && <span className="text-xs text-gf-muted">Locked: participants have already been allocated.</span>}
          </label>
          <label className="block text-sm">Retention period (years)
            <input type="number" min={1} className={inp + ' mt-1 block w-32'} value={form.retention_years} onChange={(e) => set('retention_years', Number(e.target.value))} />
          </label>
          <label className="block text-sm md:col-span-2">Study location (shown on the consent page when set)
            <input className={inp + ' mt-1 block w-full'} maxLength={300} value={form.study_location} onChange={(e) => set('study_location', e.target.value)} />
          </label>
        </div>
        <button className="gf-btn" onClick={() => save({ target_sample_size: form.target_sample_size, auto_close_at_target: form.auto_close_at_target, allocation_method: form.allocation_method, retention_years: form.retention_years, study_location: form.study_location })}>
          Save study settings
        </button>
      </section>
    </div>
  );
}

const EXT_MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' };

function AudioSlot({ slot, title, active, storage, volume, onDone, setMsg }: { slot: string; title: string; active: any; storage: 'blob' | 'local'; volume: number; onDone: () => void; setMsg: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const audioEl = useRef<HTMLAudioElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Preview: download the file once and play it from an in-memory blob URL (works in every browser; no Range support needed).
  useEffect(() => {
    let revoked = false;
    let url: string | null = null;
    setPreviewUrl(null);
    if (!active) return;
    fetch(`/api/admin/audio/version/${active.id}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        if (revoked) return;
        url = URL.createObjectURL(b);
        setPreviewUrl(url);
      })
      .catch(() => {});
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [active?.id]);

  useEffect(() => {
    if (audioEl.current) audioEl.current.volume = Math.max(0, Math.min(1, volume)); // preview at the configured level
  }, [volume, previewUrl]);

  async function upload(file: File) {
    setBusy(true);
    setMsg('');
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!EXT_MIME[ext]) {
      setMsg('Only .mp3, .wav and .m4a files are supported.');
      setBusy(false);
      return;
    }
    // Verify THIS browser can decode the file (matters for M4A).
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      await ctx.decodeAudioData(await file.arrayBuffer());
      ctx.close();
    } catch {
      setMsg('This browser could not decode that file, so participants’ browsers may not be able to either. Try WAV or MP3.');
      setBusy(false);
      return;
    }

    try {
      let r;
      if (storage === 'blob') {
        // 1) browser → private Blob store directly (no 4.5 MB serverless limit), 2) server validates + records it.
        const blob = await blobUpload(`audio/${crypto.randomUUID()}.${ext}`, file, {
          access: 'private',
          handleUploadUrl: '/api/admin/audio/upload-token',
          contentType: EXT_MIME[ext],
        });
        r = await api(`/api/admin/audio/${slot}`, { method: 'POST', json: { pathname: blob.pathname, filename: file.name } });
      } else {
        const fd = new FormData();
        fd.append('file', file);
        r = await api(`/api/admin/audio/${slot}`, { method: 'POST', body: fd });
      }
      setMsg(r.ok ? `Uploaded “${file.name}” as the ${slot} noise.` : r.data?.error ?? 'Upload failed');
    } catch (e: any) {
      setMsg(`Upload failed: ${e?.message ?? 'unknown error'}`);
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    onDone();
  }

  return (
    <div className="rounded-lg border border-gf-border bg-white p-4 space-y-3">
      <div className="text-sm font-medium">{title}</div>
      {active ? (
        <>
          <dl className="text-sm">
            <div><span className="text-gf-muted">File: </span>{active.original_filename}</div>
            <div><span className="text-gf-muted">Duration: </span>{active.duration_seconds.toFixed(1)} s · {(active.size_bytes / 1048576).toFixed(1)} MB · uploaded {fmtDate(active.uploaded_at)}</div>
            <div><span className="text-gf-muted">Version: </span>#{active.id} · used by {active.participants_assigned} participant(s)</div>
          </dl>
          {active.duration_seconds > 300 && <p className="text-xs text-amber-700">Long file: participants’ browsers decode the whole file into memory. A 30–120 s seamless loop is recommended.</p>}
          {previewUrl ? <audio ref={audioEl} controls src={previewUrl} className="w-full" /> : <p className="text-xs text-gf-muted">Loading preview…</p>}
          <p className="text-xs text-gf-muted">Preview plays at the configured standardised volume. Use headphones at a low device volume.</p>
        </>
      ) : (
        <p className="text-sm text-gf-error">No file uploaded.</p>
      )}
      <input ref={input} type="file" accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button className="gf-btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : active ? 'Replace file' : 'Upload file'}</button>
    </div>
  );
}
