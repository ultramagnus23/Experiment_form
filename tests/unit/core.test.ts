import test from 'node:test';
import assert from 'node:assert/strict';
import { mean, median, sd, summarize } from '../../src/lib/stats';
import { csvCell, toCsv } from '../../src/lib/csv';
import { newPermutedBlock, newParticipantId, shuffle } from '../../src/lib/random';
import { CONDITIONS, FRAMING_SENTENCE, trialPayload } from '../../src/lib/experiment';

test('mean/median/sd', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.ok(Math.abs(sd([2, 4, 4, 4, 5, 5, 7, 9])! - 2.138089935) < 1e-6); // sample SD
  assert.equal(sd([5]), null);
  assert.equal(mean([]), null);
});

test('summarize', () => {
  const s = summarize([
    { decision: 'yes_share', latency_ms: 1000 },
    { decision: 'no_keep_private', latency_ms: 3000 },
    { decision: 'yes_share', latency_ms: 2000 },
  ]);
  assert.equal(s.n, 3);
  assert.equal(s.yes, 2);
  assert.ok(Math.abs(s.yesPct! - 66.6667) < 0.001);
  assert.equal(s.meanMs, 2000);
  assert.equal(s.medianMs, 2000);
});

test('csv escaping and formula-injection protection', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("=HYPERLINK(\"x\")"), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell(-5), '-5'); // real negative numbers untouched
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(['a', 'b']), 'a|b');
  assert.ok(toCsv(['x'], [{ x: 1 }]).startsWith('﻿x\r\n1'));
});

test('permuted block always contains each condition exactly once', () => {
  for (let i = 0; i < 2000; i++) assert.deepEqual([...newPermutedBlock()].sort(), [1, 2, 3, 4]);
});

test('permuted block ordering is not degenerate (all 24 orders occur)', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(newPermutedBlock().join(''));
  assert.equal(seen.size, 24);
});

test('shuffle is unbiased enough (position of 1 roughly uniform)', () => {
  const counts = [0, 0, 0, 0];
  const N = 20000;
  for (let i = 0; i < N; i++) counts[shuffle([1, 2, 3, 4]).indexOf(1)]++;
  for (const c of counts) assert.ok(Math.abs(c / N - 0.25) < 0.02, `skew: ${counts}`);
});

test('participant IDs are well-formed and unique', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 5000; i++) {
    const id = newParticipantId();
    assert.match(id, /^P-[A-HJ-NP-Z2-9]{10}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 5000);
});

test('design: framing text identical within framing, audio mapping correct', () => {
  assert.equal(CONDITIONS[1].framing, CONDITIONS[2].framing);
  assert.equal(CONDITIONS[3].framing, CONDITIONS[4].framing);
  assert.notEqual(CONDITIONS[1].framing, CONDITIONS[3].framing);
  assert.deepEqual([1, 2, 3, 4].map((c) => CONDITIONS[c as 1].audio), ['crowd', 'brown', 'crowd', 'brown']);
  assert.equal(trialPayload(1, 0.3).framingSentence, trialPayload(2, 0.3).framingSentence);
  assert.equal(trialPayload(3, 0.3).framingSentence, trialPayload(4, 0.3).framingSentence);
  assert.equal(trialPayload(1, 0.3).framingSentence, FRAMING_SENTENCE.positive);
  assert.deepEqual(trialPayload(1, 0.3).baseline, trialPayload(4, 0.3).baseline);
  // payload must not leak condition identity
  assert.ok(!('condition' in trialPayload(1, 0.3)));
});
