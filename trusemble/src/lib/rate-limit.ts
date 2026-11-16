import { get, run } from './db';

/** Fixed-window limiter backed by SQLite so it holds across workers. Returns true when allowed. */
export function allow(bucket: string, limit: number, windowSeconds: number, now = Date.now()): boolean {
  const win = Math.floor(now / 1000 / windowSeconds);
  run('DELETE FROM rate_limits WHERE window_start < ?', win - 1);
  run(
    `INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
     ON CONFLICT(bucket, window_start) DO UPDATE SET hits = hits + 1`,
    bucket,
    win,
  );
  const row = get<{ hits: number }>('SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?', bucket, win);
  return (row?.hits ?? 1) <= limit;
}
