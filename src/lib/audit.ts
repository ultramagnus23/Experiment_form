import { PoolClient } from 'pg';
import { query } from './db';

export async function audit(email: string, action: string, details: Record<string, unknown> = {}, client?: PoolClient) {
  const sql = 'INSERT INTO admin_audit(admin_email, action, details) VALUES ($1,$2,$3::jsonb)';
  const params = [email, action, JSON.stringify(details)];
  if (client) await client.query(sql, params);
  else await query(sql, params);
}
