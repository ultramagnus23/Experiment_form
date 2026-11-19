import { admin } from '@/lib/admin-auth';
import { json } from '@/lib/http';
export const GET = admin(async (_req, { email }) => json({ email }));
