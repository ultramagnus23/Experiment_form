import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const g = globalThis as unknown as { __expPool?: Pool };

export function pool(): Pool {
  if (!g.__expPool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    const serverless = !!process.env.VERCEL;
    g.__expPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Serverless: keep few, short-lived connections (use the pooled Neon URL).
      max: serverless ? 3 : 10,
      idleTimeoutMillis: serverless ? 5000 : 30000,
      connectionTimeoutMillis: 15000,
    });
  }
  return g.__expPool;
}

export function query<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
  return pool().query<T>(text, params);
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
