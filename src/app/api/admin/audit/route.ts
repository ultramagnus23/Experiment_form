import { admin } from '@/lib/admin-auth';
import { json } from '@/lib/http';
import { query } from '@/lib/db';

export const GET = admin(async () => {
  const { rows } = await query('SELECT id, at, admin_email, action, details FROM admin_audit ORDER BY id DESC LIMIT 300');
  return json({ rows });
});
