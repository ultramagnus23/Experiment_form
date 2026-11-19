'use client';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';

// Palette: categorical slots 1-2 of the reference palette (validated). Yes = blue, No = orange.
// Condition identity is carried by the axis labels, so no further hues are needed.
export const C_YES = '#2a78d6';
export const C_NO = '#eb6834';
export const C_NEUTRAL = '#2a78d6';
const GRID = '#e3e3e0';
const INK2 = '#52514e';

const axis = { stroke: INK2, fontSize: 12, tickLine: false } as const;

export function ChartBox({ title, note, children, height = 260 }: { title: string; note?: string; children: React.ReactElement; height?: number }) {
  return (
    <figure className="rounded-lg border border-gf-border bg-white p-4">
      <figcaption className="mb-2 text-sm font-medium text-gf-text">{title}</figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
      {note ? <p className="mt-2 text-xs text-gf-muted">{note}</p> : null}
    </figure>
  );
}

const tip = { contentStyle: { fontSize: 12, borderRadius: 6, border: '1px solid #dadce0' }, cursor: { fill: 'rgba(0,0,0,0.04)' } };

export function YesNoCounts({ data }: { data: { name: string; yes: number; no: number }[] }) {
  return (
    <ChartBox title="Decisions by condition (count)">
      <BarChart data={data} barGap={2} margin={{ left: -10 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="yes" name="Yes, share" fill={C_YES} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="no" name="No, keep private" fill={C_NO} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartBox>
  );
}

export function YesNoPercent({ data }: { data: { name: string; yes: number; no: number }[] }) {
  return (
    <ChartBox title="Decisions by condition (% of participants)">
      <BarChart data={data} barGap={2} margin={{ left: -10 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" {...axis} />
        <YAxis domain={[0, 100]} unit="%" {...axis} />
        <Tooltip {...tip} formatter={(v: number) => `${v.toFixed(1)}%`} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="yes" name="Yes %" fill={C_YES} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="no" name="No %" fill={C_NO} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartBox>
  );
}

export function LatencyBars({ title, data }: { title: string; data: { name: string; mean: number | null; median: number | null }[] }) {
  return (
    <ChartBox title={title} height={240}>
      <BarChart data={data} barGap={2} margin={{ left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" {...axis} />
        <YAxis unit=" s" {...axis} />
        <Tooltip {...tip} formatter={(v: number) => `${v.toFixed(2)} s`} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="mean" name="Mean" fill={C_NEUTRAL} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="median" name="Median" fill="#7aa9e6" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartBox>
  );
}

function jitter(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 0.5;
}

export function LatencyScatter({ points }: { points: { id: string; condition: number; latency_ms: number; decision: string }[] }) {
  const mk = (d: string) => points.filter((p) => p.decision === d).map((p) => ({ id: p.id, x: p.condition + jitter(p.id), y: p.latency_ms / 1000, condition: p.condition }));
  return (
    <ChartBox title="Individual decision times (each dot = one participant)" height={300} note="Horizontal position within a condition is jittered for legibility only.">
      <ScatterChart margin={{ left: 0, right: 10 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="x" domain={[0.5, 4.5]} ticks={[1, 2, 3, 4]} tickFormatter={(v) => `C${v}`} {...axis} />
        <YAxis type="number" dataKey="y" unit=" s" {...axis} />
        <ZAxis range={[60, 60]} />
        <Tooltip {...tip} cursor={{ strokeDasharray: '3 3' }} formatter={(v: any, n: string) => (n === 'y' ? `${Number(v).toFixed(2)} s` : v)} labelFormatter={() => ''} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Scatter name="Yes, share" data={mk('yes_share')} fill={C_YES} stroke="#fff" />
        <Scatter name="No, keep private" data={mk('no_keep_private')} fill={C_NO} stroke="#fff" />
      </ScatterChart>
    </ChartBox>
  );
}

export function CountBars({ title, data }: { title: string; data: { label: string; count: number }[] }) {
  return (
    <ChartBox title={title} height={220}>
      <BarChart data={data} margin={{ left: -10 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tip} />
        <Bar dataKey="count" name="Participants" fill={C_NEUTRAL} radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ChartBox>
  );
}
