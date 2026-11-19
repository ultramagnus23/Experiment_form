import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getAdminEmail } from '@/lib/admin-auth';
import { blobEnabled, MAX_AUDIO_BYTES } from '@/lib/env';
import { fail, json, sameOrigin } from '@/lib/http';

/**
 * Issues a short-lived, narrowly-scoped client token so the ADMIN'S BROWSER can upload audio straight to the
 * private Blob store (bypassing Vercel's 4.5 MB function body limit). Only authenticated admins get tokens.
 */
export async function POST(req: Request) {
  if (!blobEnabled()) return fail(400, 'Blob storage is not configured');
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return fail(400, 'Bad request');
  }

  if (body.type === 'blob.generate-client-token') {
    if (!(await getAdminEmail())) return fail(401, 'Not authenticated');
    if (!sameOrigin(req)) return fail(403, 'Cross-origin request rejected');
  }

  try {
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^audio\/[A-Za-z0-9._-]{1,120}$/.test(pathname)) throw new Error('Invalid upload path');
        return {
          allowedContentTypes: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'],
          maximumSizeInBytes: MAX_AUDIO_BYTES,
          addRandomSuffix: true,
        };
      },
      // No onUploadCompleted: the dashboard calls POST /api/admin/audio/[slot] after the upload, which validates the file.
    });
    return json(result);
  } catch (e: any) {
    return fail(400, e?.message ?? 'Upload not allowed');
  }
}
