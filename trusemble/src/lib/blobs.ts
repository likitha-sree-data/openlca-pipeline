import { get, run } from './db';

/**
 * Small files (an uploaded spreadsheet, the county outlines) are kept in the database, not on disk,
 * so they survive restarts and are visible to every server instance. Needs no file storage service.
 */
export async function putBlob(name: string, data: Buffer | Uint8Array): Promise<void> {
  await run(
    `INSERT INTO blobs (name, data, size, updated_at) VALUES (?, ?, ?, now_iso())
     ON CONFLICT (name) DO UPDATE SET data = excluded.data, size = excluded.size, updated_at = now_iso()`,
    name, data as never, data.length,
  );
}

export async function getBlob(name: string): Promise<Buffer | null> {
  const row = await get<{ data: Uint8Array | Buffer | null }>('SELECT data FROM blobs WHERE name = ?', name);
  return row?.data ? Buffer.from(row.data) : null;
}

/** When a blob last changed, so callers can cache the bytes and re-read only when it moves. */
export async function blobVersion(name: string): Promise<string | null> {
  return (await get<{ updated_at: string }>('SELECT updated_at FROM blobs WHERE name = ?', name))?.updated_at ?? null;
}

export async function deleteBlob(name: string): Promise<void> {
  await run('DELETE FROM blobs WHERE name = ?', name);
}
