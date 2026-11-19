import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { getAdminEmail } from '@/lib/admin-auth';
import { blobEnabled, MAX_AUDIO_BYTES } from '@/lib/env';
import { fail, json, readJson, sameOrigin } from '@/lib/http';

const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'];

/**
 * Presigned direct-to-Blob upload (no read-write token needed: tokens are issued with the store id and
 * Vercel's OIDC token). The browser asks for a presigned PUT URL here, then uploads straight to the private
 * Blob store, bypassing Vercel's 4.5 MB function body limit. Only authenticated admins get URLs.
 * The upload is validated afterwards by POST /api/admin/audio/[slot].
 */
export async function POST(req: Request) {
  if (!blobEnabled()) return fail(400, 'Blob storage is not configured');
  const body = await readJson<HandleUploadPresignedBody>(req);
  if (!body || typeof body !== 'object') return fail(400, 'Bad request');

  if (body.type === 'blob.generate-presigned-url') {
    if (!(await getAdminEmail())) return fail(401, 'Not authenticated');
    if (!sameOrigin(req)) return fail(403, 'Cross-origin request rejected');
  }

  try {
    const result = await handleUploadPresigned({
      request: req,
      body,
      getSignedToken: async (pathname) => {
        if (!/^audio\/[A-Za-z0-9._-]{1,120}$/.test(pathname)) throw new Error('Invalid upload path');
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_AUDIO_BYTES,
        });
        return { token };
      },
    });
    return json(result);
  } catch (e: any) {
    return fail(400, e?.message ?? 'Upload not allowed');
  }
}
