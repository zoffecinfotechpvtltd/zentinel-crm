import { pool } from "../db/pool";
import { dumpDatabase } from "../lib/backupRestore";
import { isObjectStorageConfigured, uploadObject } from "../lib/objectStorage";

// The "Download backup now" button under Settings only helps if someone
// remembers to click it. This does the same dump automatically and pushes
// it to object storage (if configured) so a backup exists even if nobody
// ever visits Settings. A no-op — not an error — when object storage isn't
// configured, since there's nowhere durable to put it on a free-tier host
// with an ephemeral disk.
export async function runAutomatedBackupJob(): Promise<{ skipped: boolean; key?: string }> {
  if (!isObjectStorageConfigured) {
    return { skipped: true };
  }
  const backup = await dumpDatabase(pool);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const key = `backups/zentinel-backup-${dateStamp}.json`;
  await uploadObject(key, Buffer.from(JSON.stringify(backup)), "application/json");
  return { skipped: false, key };
}
