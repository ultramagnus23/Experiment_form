'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './fmt';
import { OverviewTab, ChartsTab, DemographicsTab } from './AnalyticsTabs';
import ResponsesTab from './ResponsesTab';
import { ExportTab, AuditTab } from './DataTabs';
import SettingsTab from './SettingsTab';

const TABS = ['Overview', 'Charts', 'Demographics', 'Responses', 'Export & data', 'Settings', 'Audit log'] as const;
type Tab = (typeof TABS)[number];

export default function Dashboard({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>('Overview');
  const [stats, setStats] = useState<any>(null);
  const [excludeFlagged, setExcludeFlagged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api('/api/admin/stats' + (excludeFlagged ? '?exclude_flagged=1' : ''));
    if (r.ok) setStats(r.data);
    else setError('Could not load statistics');
  }, [excludeFlagged]);
  useEffect(() => {
    load();
  }, [load]);

  async function logout() {
    await api('/api/admin/auth/logout', { method: 'POST' });
    location.href = '/admin';
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gf-border bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-base font-medium">Research dashboard</div>
            <div className="text-xs text-gf-muted">Private · {email}</div>
          </div>
          <button onClick={logout} className="rounded border border-gf-border px-3 py-1.5 text-sm hover:bg-gray-50">Sign out</button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t ? 'border-gf-accent font-medium text-gf-accent' : 'border-transparent text-gf-muted hover:text-gf-text'}`}>
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {error ? <p className="text-gf-error text-sm">{error}</p> : null}
        {['Overview', 'Charts', 'Demographics'].includes(tab) && (
          <label className="flex items-center gap-2 text-sm text-gf-muted">
            <input type="checkbox" checked={excludeFlagged} onChange={(e) => setExcludeFlagged(e.target.checked)} />
            Exclude flagged trials from analysis (resumed trial, timing mismatch, audio interrupted)
            <button onClick={load} className="ml-3 rounded border border-gf-border px-2 py-0.5 text-xs hover:bg-gray-50">Refresh</button>
          </label>
        )}
        {tab === 'Overview' && stats && <OverviewTab s={stats} />}
        {tab === 'Charts' && stats && <ChartsTab s={stats} />}
        {tab === 'Demographics' && stats && <DemographicsTab s={stats} />}
        {tab === 'Responses' && <ResponsesTab onChange={load} />}
        {tab === 'Export & data' && <ExportTab />}
        {tab === 'Settings' && <SettingsTab onChange={load} />}
        {tab === 'Audit log' && <AuditTab />}
        {!stats && ['Overview', 'Charts', 'Demographics'].includes(tab) && !error ? <p className="text-sm text-gf-muted">Loading…</p> : null}
      </main>
    </div>
  );
}
