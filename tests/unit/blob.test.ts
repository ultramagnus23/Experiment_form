import test from 'node:test';
import assert from 'node:assert/strict';
import { serveAudio, isBlobRef, BLOB_PREFIX } from '../../src/lib/audio-serve';

const streamOf = (bytes: Uint8Array) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });

test('blob refs are recognised', () => {
  assert.ok(isBlobRef(`${BLOB_PREFIX}audio/x.wav`));
  assert.ok(!isBlobRef('crowd-123.wav'));
});

test('blob audio is streamed through the function with no URL/filename leaked', async () => {
  let asked = '';
  const getter = async (p: string, o: any) => {
    asked = p;
    assert.equal(o.access, 'private'); // never public
    return { statusCode: 200, stream: streamOf(new Uint8Array([1, 2, 3, 4])) };
  };
  const res = await serveAudio(new Request('http://x/api/p/audio'), `${BLOB_PREFIX}audio/abc.wav`, 'audio/wav', 4, getter);
  assert.equal(asked, 'audio/abc.wav');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'audio/wav');
  assert.equal(res.headers.get('location'), null, 'must not redirect to the Blob URL');
  assert.ok(!(res.headers.get('content-disposition') ?? '').includes('abc'), 'no filename exposed');
  assert.equal(res.headers.get('content-length'), null, 'streamed (no fixed length) so the 4.5 MB response cap does not apply');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3, 4]);
});

test('missing blob → 404', async () => {
  const res = await serveAudio(new Request('http://x'), `${BLOB_PREFIX}audio/none.wav`, 'audio/wav', 1, async () => null);
  assert.equal(res.status, 404);
});
