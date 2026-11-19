import test from 'node:test';
import assert from 'node:assert/strict';
import { hashAdminPassword, verifyAdminPassword, slugMatches, accessConfig, clientIp } from '../../src/lib/admin-password';

test('scrypt hash has the documented format and verifies only the right password', () => {
  const stored = hashAdminPassword('correct horse battery');
  assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(verifyAdminPassword('correct horse battery', stored), true);
  assert.equal(verifyAdminPassword('correct horse battery!', stored), false);
  assert.equal(verifyAdminPassword('', stored), false);
});

test('hashes are salted: same password, different stored values', () => {
  assert.notEqual(hashAdminPassword('same-password-here'), hashAdminPassword('same-password-here'));
});

test('malformed stored hash never verifies', () => {
  assert.equal(verifyAdminPassword('x', 'not-a-hash'), false);
  assert.equal(verifyAdminPassword('x', 'scrypt$zz$00'), false);
  assert.equal(verifyAdminPassword('x', 'md5$' + 'ab'.repeat(8) + '$' + 'cd'.repeat(32)), false);
});

test('slug comparison is exact', () => {
  assert.equal(slugMatches('my-secret-slug', 'my-secret-slug'), true);
  assert.equal(slugMatches('my-secret-slug ', 'my-secret-slug'), false);
  assert.equal(slugMatches('MY-secret-slug', 'my-secret-slug'), false);
  assert.equal(slugMatches('', 'my-secret-slug'), false);
});

test('feature is off unless both env vars are set and the hash is well formed', () => {
  const saved = { s: process.env.ADMIN_ACCESS_SLUG, h: process.env.ADMIN_PASSWORD_HASH };
  try {
    delete process.env.ADMIN_ACCESS_SLUG;
    delete process.env.ADMIN_PASSWORD_HASH;
    assert.equal(accessConfig(), null);
    process.env.ADMIN_ACCESS_SLUG = 'abc';
    assert.equal(accessConfig(), null);
    process.env.ADMIN_PASSWORD_HASH = 'garbage';
    assert.equal(accessConfig(), null);
    process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('a-long-enough-password');
    assert.deepEqual(accessConfig()?.slug, 'abc');
  } finally {
    if (saved.s === undefined) delete process.env.ADMIN_ACCESS_SLUG; else process.env.ADMIN_ACCESS_SLUG = saved.s;
    if (saved.h === undefined) delete process.env.ADMIN_PASSWORD_HASH; else process.env.ADMIN_PASSWORD_HASH = saved.h;
  }
});

test('client IP comes from the first X-Forwarded-For entry', () => {
  const req = new Request('http://x/', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } });
  assert.equal(clientIp(req), '203.0.113.7');
  assert.equal(clientIp(new Request('http://x/')), 'unknown');
});
