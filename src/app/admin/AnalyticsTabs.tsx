'use client';
import { fmtMs, fmtPct, fmtSec } from './fmt';
import { CountBars, LatencyBars, LatencyScatter, YesNoCounts, YesNoPercent } from './Charts';

const Stat = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <div className="rounded-lg border border-gf-border bg-white p-4" title={hint}>
    <div className="text-2xl font-medium tabular-nums">{value}</div>
    <div className="text-xs text-gf-muted">{label}</div>
  </div>
);

const LABEL: Record<number, string> = { 1: 'C1', 2: 'C2', 3: 'C3', 4: 'C4' };

export function OverviewTab({ s }: { s: any }) {
  const o = s.overview;
  const conds: any[] = s.conditions;
  const rows: [string, (c: any) => React.ReactNode][] = [
    ['Participants assigned (incl. incomplete)', (c) => c.assigned],
    ['Number of participants (completed)', (c) => c.n],
    ['Yes, share', (c) => c.yes],
    ['No, keep private', (c) => c.no],
    ['Yes percentage', (c) => fmtPct(c.yesPct)],
    ['No percentage', (c) => fmtPct(c.noPct)],
    ['Mean decision time', (c) => `${fmtMs(c.meanMs)} (${fmtSec(c.meanMs)})`],
    ['Median decision time', (c) => `${fmtMs(c.medianMs)} (${fmtSec(c.medianMs)})`],
    ['Standard deviation', (c) => `${fmtMs(c.sdMs)} (${fmtSec(c.sdMs)})`],
  ];
  return (
    <>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Study status</h2>
          <span className={`rounded-full px-3 py-0.5 text-xs ${s.enabled && s.audioReady ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            {s.enabled ? (s.audioReady ? 'Open to participants' : 'Enabled, but audio missing') : 'Closed (disabled)'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Opened the experiment" value={o.opened} />
          <Stat label="Consented" value={o.consented} />
          <Stat label="Declined consent" value={o.declined} />
          <Stat label="Eligible" value={o.eligible} />
          <Stat label="Ineligible" value={o.ineligible} />
          <Stat label="Completed" value={`${o.completed} / ${s.target}`} hint="Completed responses vs target sample size" />
          <Stat label="Incomplete (started, not finished)" value={o.incomplete} hint="Opened but not completed, declined or ineligible: abandoned or in progress" />
          <Stat label="Excluded by researchers" value={o.excluded} />
        </div>
        <p className="text-xs text-gf-muted">
          Statistics below use {s.analysed} completed response(s){s.excludeFlagged ? ', flagged trials removed' : ''}; researcher-excluded records are always omitted. {o.flagged} completed trial(s) carry quality flags.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-medium">Condition-wise comparison</h2>
        <div className="overflow-x-auto rounded-lg border border-gf-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gf-border text-left text-gf-muted">
                <th className="p-3 font-normal">Metric</th>
                {conds.map((c) => (
                  <th key={c.condition} className="p-3 font-medium text-gf-text">
                    {LABEL[c.condition]}
                    <div className="text-xs font-normal text-gf-muted">
                      {c.framing} · {c.audio}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, f]) => (
                <tr key={name} className="border-b border-gray-100 last:border-0">
                  <td className="p-3 text-gf-muted">{name}</td>
                  {conds.map((c) => (
                    <td key={c.condition} className="p-3 tabular-nums">{f(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gf-muted">SD is the sample standard deviation (n − 1); shown as “–” when n &lt; 2. Percentages are of completed responses in that condition.</p>
      </section>
    </>
  );
}

export function ChartsTab({ s }: { s: any }) {
  const conds: any[] = s.conditions;
  const counts = conds.map((c) => ({ name: LABEL[c.condition], yes: c.yes, no: c.no }));
  const pcts = conds.map((c) => ({ name: LABEL[c.condition], yes: c.yesPct ?? 0, no: c.noPct ?? 0 }));
  const lat = conds.map((c) => ({ name: LABEL[c.condition], mean: c.meanMs === null ? null : c.meanMs / 1000, median: c.medianMs === null ? null : c.medianMs / 1000 }));
  const framing = [
    { name: 'Positive', ...pickLat(s.framing.positive) },
    { name: 'Negative', ...pickLat(s.framing.negative) },
  ];
  const noise = [
    { name: 'Crowd', ...pickLat(s.noise.crowd) },
    { name: 'Brown', ...pickLat(s.noise.brown) },
  ];
  const table = (title: string, g: Record<string, any>) => (
    <div className="overflow-x-auto rounded-lg border border-gf-border bg-white">
      <table className="w-full text-sm">
        <caption className="p-3 text-left text-sm font-medium">{title}</caption>
        <thead>
          <tr className="border-y border-gf-border text-left text-gf-muted">
            {['Group', 'n', 'Yes %', 'Mean', 'Median', 'SD'].map((h) => (
              <th key={h} className="p-3 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(g).map(([k, v]: [string, any]) => (
            <tr key={k} className="border-b border-gray-100 last:border-0">
              <td className="p-3 capitalize">{k}</td>
              <td className="p-3 tabular-nums">{v.n}</td>
              <td className="p-3 tabular-nums">{fmtPct(v.yesPct)}</td>
              <td className="p-3 tabular-nums">{fmtSec(v.meanMs)}</td>
              <td className="p-3 tabular-nums">{fmtSec(v.medianMs)}</td>
              <td className="p-3 tabular-nums">{fmtSec(v.sdMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-4">
      <p className="text-xs text-gf-muted">C1 positive+crowd · C2 positive+brown · C3 negative+crowd · C4 negative+brown. Blue = Yes, orange = No.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <YesNoCounts data={counts} />
        <YesNoPercent data={pcts} />
      </div>
      <h2 className="text-base font-medium">Decision latency</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <LatencyBars title="Mean and median decision time by condition (s)" data={lat} />
        <LatencyScatter points={s.points} />
        <LatencyBars title="Positive vs negative framing (s)" data={framing} />
        <LatencyBars title="Crowd vs brown noise (s)" data={noise} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {table('Framing comparison', s.framing)}
        {table('Noise comparison', s.noise)}
      </div>
    </div>
  );
}

const pickLat = (g: any) => ({ mean: g.meanMs === null ? null : g.meanMs / 1000, median: g.medianMs === null ? null : g.medianMs / 1000 });

export function DemographicsTab({ s }: { s: any }) {
  const d = s.demographics;
  const list = (title: string, rows: { label: string; count: number }[]) => (
    <div className="rounded-lg border border-gf-border bg-white">
      <div className="p-3 text-sm font-medium">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-gray-100">
              <td className="p-3">{r.label}</td>
              <td className="p-3 text-right tabular-nums">{r.count}</td>
            </tr>
          ))}
          {!rows.length && <tr><td className="p-3 text-gf-muted">No data yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-4">
      <p className="text-xs text-gf-muted">Based on {s.analysed} completed response(s). Researcher-only: small groups here can be identifying, so do not share or screenshot this page publicly.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <CountBars title="Age distribution" data={d.ages} />
        <CountBars title="Gender distribution" data={d.genders} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {list('Age', d.ages)}
        {list('Gender', d.genders)}
        {list('Major', d.majors)}
      </div>
    </div>
  );
}
