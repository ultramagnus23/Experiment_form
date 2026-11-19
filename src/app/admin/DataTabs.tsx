'use client';
import { useEffect, useState } from 'react';
import { api, fmtDate } from './fmt';

const EXPORTS = [
  ['complete', 'Complete CSV dataset', 'Every participant record, all columns (incl. incomplete, declined, flagged and excluded).'],
  ['conditions', 'Condition-wise CSV', 'One row per condition: n, yes/no counts and %, mean/median/SD latency.'],
  ['decision_times', 'Decision-time CSV', 'Participant ID, condition, decision and latency (ms and s) with quality flags.'],
  ['demographics', 'Demographic CSV', 'Participant ID, age, gender, major and condition.'],
] as const;

export function ExportTab() {
  const [ret, setRet] = useState<any>(null);
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const load = async () => {
    const r = await api('/api/admin/retention');
    if (r.ok) setRet(r.data);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-base font-medium">Data export</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {EXPORTS.map(([k, title, desc]) => (
            <div key={k} className="rounded-lg border border-gf-border bg-white p-4">
              <div className="text-sm font-medium">{title}</div>
              <p className="mb-3 mt-1 text-xs text-gf-muted">{desc}</p>
              <a className="gf-btn inline-block" href={`/api/admin/export/${k}`} onClick={() => setTimeout(load, 1500)}>Download CSV</a>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-gf-muted">Exports contain the anonymous participant IDs only: no authentication or administrator information. Every export is recorded in the audit log. UTF-8 with BOM for Excel; arrays use “|”.</p>
      </section>

      <section className="rounded-lg border border-gf-border bg-white p-4 space-y-3">
        <h2 className="text-base font-medium">Retention and deletion</h2>
        {ret && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
            <div><dt className="text-xs text-gf-muted">Retention period</dt><dd>{ret.retentionYears} years</dd></div>
            <div><dt className="text-xs text-gf-muted">Research records</dt><dd>{ret.total}</dd></div>
            <div><dt className="text-xs text-gf-muted">Oldest record</dt><dd>{fmtDate(ret.oldest)}</dd></div>
            <div><dt className="text-xs text-gf-muted">First deletion due</dt><dd>{fmtDate(ret.deletionDueAt)}</dd></div>
            <div><dt className="text-xs text-gf-muted">Records past retention</dt><dd>{ret.expired}</dd></div>
            <div><dt className="text-xs text-gf-muted">Last complete export</dt><dd>{fmtDate(ret.lastCompleteExportAt)}</dd></div>
            <div><dt className="text-xs text-gf-muted">Operational session records</dt><dd>{ret.sessions} ({ret.purgeableSessions} purgeable)</dd></div>
          </dl>
        )}
        <p className="text-xs text-gf-muted">
          <b>Research records</b> (de-identified responses) are kept for the retention period. <b>Operational session data</b> (hashed participant cookies, sign-in tokens) is temporary and can be purged at any time without touching research data.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded border border-gf-border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={async () => { const r = await api('/api/admin/retention/purge-sessions', { method: 'POST' }); setMsg(r.ok ? `Purged ${r.data.deleted} operational session record(s).` : r.data?.error); load(); }}>
            Purge operational session data
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <input className="rounded border border-gf-border px-3 py-1.5 text-sm" placeholder="Type DELETE" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button
            className="rounded bg-gf-error px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={confirm !== 'DELETE' || !ret || ret.expired === 0}
            onClick={async () => {
              const r = await api('/api/admin/retention/delete', { method: 'POST', json: { confirm } });
              setMsg(r.ok ? `Deleted ${r.data.deleted} record(s) older than the retention period.` : r.data?.error);
              setConfirm('');
              load();
            }}
          >
            Delete records past retention
          </button>
          <span className="text-xs text-gf-muted">Requires a complete-dataset download within the previous 24 hours.</span>
        </div>
        {msg ? <p className="text-sm">{msg}</p> : null}
      </section>
    </div>
  );
}

export function AuditTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api('/api/admin/audit').then((r) => r.ok && setRows(r.data.rows));
  }, []);
  return (
    <div className="overflow-x-auto rounded-lg border border-gf-border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gf-border text-left text-gf-muted">
            <th className="p-2 font-normal">When</th><th className="p-2 font-normal">Administrator</th><th className="p-2 font-normal">Action</th><th className="p-2 font-normal">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-100 last:border-0 align-top">
              <td className="whitespace-nowrap p-2">{fmtDate(r.at)}</td>
              <td className="p-2">{r.admin_email}</td>
              <td className="p-2">{r.action}</td>
              <td className="p-2 font-mono text-xs text-gf-muted">{JSON.stringify(r.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
