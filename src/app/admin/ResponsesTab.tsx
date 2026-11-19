'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate } from './fmt';

type Row = any;
const COLS: { key: string; label: string; get?: (r: Row) => any }[] = [
  { key: 'id', label: 'Participant ID' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'major', label: 'Major' },
  { key: 'condition', label: 'Condition' },
  { key: 'framing', label: 'Framing' },
  { key: 'audio_type', label: 'Audio' },
  { key: 'decision', label: 'Decision', get: (r) => (r.decision === 'yes_share' ? 'Yes, share' : r.decision === 'no_keep_private' ? 'No, keep private' : '') },
  { key: 'latency_ms', label: 'Latency (ms)' },
  { key: 'submitted_at', label: 'Submitted', get: (r) => fmtDate(r.submitted_at) },
  { key: 'audio_status', label: 'Audio status', get: (r) => [r.audio_status, r.audio_interrupted ? 'interrupted' : ''].filter(Boolean).join(', ') },
  { key: 'status', label: 'Status' },
  { key: 'flags', label: 'Flags', get: (r) => [...(r.flags ?? []), r.excluded ? 'EXCLUDED' : ''].filter(Boolean).join(', ') },
];

export default function ResponsesTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fCond, setFCond] = useState('');
  const [fDec, setFDec] = useState('');
  const [fStatus, setFStatus] = useState('completed');
  const [fGender, setFGender] = useState('');
  const [fMajor, setFMajor] = useState('');
  const [fAge, setFAge] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'submitted_at', dir: -1 });
  const [action, setAction] = useState<{ row: Row; kind: 'exclude' | 'include' | 'delete' } | null>(null);
  const [reason, setReason] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const r = await api('/api/admin/responses');
    if (r.ok) setRows(r.data.rows);
  };
  useEffect(() => {
    load();
  }, []);

  const genders = useMemo(() => [...new Set(rows.map((r) => r.gender).filter(Boolean))], [rows]);
  const view = useMemo(() => {
    let v = rows.filter(
      (r) =>
        (!fCond || String(r.condition) === fCond) &&
        (!fDec || r.decision === fDec) &&
        (!fStatus || r.status === fStatus) &&
        (!fGender || r.gender === fGender) &&
        (!fAge || String(r.age) === fAge) &&
        (!fMajor || (r.major ?? '').toLowerCase().includes(fMajor.toLowerCase())),
    );
    v = [...v].sort((a, b) => {
      const A = a[sort.key], B = b[sort.key];
      if (A === B) return 0;
      if (A === null || A === undefined) return 1;
      if (B === null || B === undefined) return -1;
      return (A > B ? 1 : -1) * sort.dir;
    });
    return v;
  }, [rows, fCond, fDec, fStatus, fGender, fAge, fMajor, sort]);

  async function run() {
    if (!action) return;
    const { row, kind } = action;
    const r =
      kind === 'delete'
        ? await api(`/api/admin/responses/${row.id}`, { method: 'DELETE', json: { reason, confirmId } })
        : await api(`/api/admin/responses/${row.id}`, { method: 'PATCH', json: { excluded: kind === 'exclude', reason } });
    setMsg(r.ok ? 'Done. The action was written to the audit log.' : r.data?.error ?? 'Failed');
    if (r.ok) {
      setAction(null);
      setReason('');
      setConfirmId('');
      await load();
      onChange();
    }
  }

  const sel = 'rounded border border-gf-border bg-white px-2 py-1 text-sm';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <select className={sel} value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option>
          {['completed', 'assigned', 'demographics_done', 'eligible', 'consented', 'opened', 'declined', 'ineligible'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={sel} value={fCond} onChange={(e) => setFCond(e.target.value)} aria-label="Condition filter">
          <option value="">All conditions</option>
          {[1, 2, 3, 4].map((c) => <option key={c} value={c}>Condition {c}</option>)}
        </select>
        <select className={sel} value={fDec} onChange={(e) => setFDec(e.target.value)} aria-label="Decision filter">
          <option value="">All decisions</option>
          <option value="yes_share">Yes, share</option>
          <option value="no_keep_private">No, keep private</option>
        </select>
        <select className={sel} value={fGender} onChange={(e) => setFGender(e.target.value)} aria-label="Gender filter">
          <option value="">All genders</option>
          {genders.map((g) => <option key={g}>{g}</option>)}
        </select>
        <input className={sel + ' w-20'} placeholder="Age" value={fAge} onChange={(e) => setFAge(e.target.value)} aria-label="Age filter" />
        <input className={sel + ' w-40'} placeholder="Major contains…" value={fMajor} onChange={(e) => setFMajor(e.target.value)} aria-label="Major filter" />
        <span className="text-xs text-gf-muted">{view.length} of {rows.length} records</span>
      </div>
      {msg ? <p className="text-sm text-gf-muted">{msg}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-gf-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gf-border text-left text-gf-muted">
              {COLS.map((c) => (
                <th key={c.key} className="whitespace-nowrap p-2 font-normal">
                  <button onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((-s.dir) as 1 | -1) : 1 }))} className="hover:text-gf-text">
                    {c.label} {sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}
                  </button>
                </th>
              ))}
              <th className="p-2 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} className={`border-b border-gray-100 last:border-0 ${r.excluded ? 'opacity-50' : ''}`}>
                {COLS.map((c) => (
                  <td key={c.key} className="whitespace-nowrap p-2 tabular-nums">{String((c.get ? c.get(r) : r[c.key]) ?? '')}</td>
                ))}
                <td className="whitespace-nowrap p-2 text-xs">
                  <button className="mr-2 text-gf-accent" onClick={() => { setAction({ row: r, kind: r.excluded ? 'include' : 'exclude' }); setMsg(null); }}>
                    {r.excluded ? 'Include' : 'Exclude'}
                  </button>
                  <button className="text-gf-error" onClick={() => { setAction({ row: r, kind: 'delete' }); setMsg(null); }}>Delete</button>
                </td>
              </tr>
            ))}
            {!view.length && <tr><td colSpan={COLS.length + 1} className="p-4 text-gf-muted">No records match.</td></tr>}
          </tbody>
        </table>
      </div>

      {action && (
        <div className="rounded-lg border border-gf-border bg-white p-4 space-y-3">
          <div className="text-sm font-medium">
            {action.kind === 'delete' ? 'Delete' : action.kind === 'exclude' ? 'Exclude' : 'Re-include'} record {action.row.id}
          </div>
          <p className="text-xs text-gf-muted">
            {action.kind === 'delete'
              ? 'Permanently removes this participant record. Responses are never edited, only excluded or deleted, and every action is logged with your reason.'
              : 'Exclusion only removes the record from analysis; the data is kept and can be re-included. Logged.'}
          </p>
          <input className="w-full rounded border border-gf-border px-3 py-2 text-sm" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {action.kind === 'delete' && (
            <input className="w-full rounded border border-gf-border px-3 py-2 text-sm" placeholder={`Type ${action.row.id} to confirm`} value={confirmId} onChange={(e) => setConfirmId(e.target.value)} />
          )}
          <div className="flex gap-2">
            <button className="gf-btn" onClick={run} disabled={reason.trim().length < 3 || (action.kind === 'delete' && confirmId !== action.row.id)}>Confirm</button>
            <button className="rounded border border-gf-border px-4 py-2 text-sm" onClick={() => setAction(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
