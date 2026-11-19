export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Sample standard deviation (n-1 denominator). Null when n < 2. */
export function sd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function pct(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

export interface GroupSummary {
  n: number;
  yes: number;
  no: number;
  yesPct: number | null;
  noPct: number | null;
  meanMs: number | null;
  medianMs: number | null;
  sdMs: number | null;
}

export function summarize(rows: { decision: string; latency_ms: number }[]): GroupSummary {
  const lat = rows.map((r) => r.latency_ms);
  const yes = rows.filter((r) => r.decision === 'yes_share').length;
  const no = rows.filter((r) => r.decision === 'no_keep_private').length;
  return {
    n: rows.length,
    yes,
    no,
    yesPct: pct(yes, rows.length),
    noPct: pct(no, rows.length),
    meanMs: mean(lat),
    medianMs: median(lat),
    sdMs: sd(lat),
  };
}
