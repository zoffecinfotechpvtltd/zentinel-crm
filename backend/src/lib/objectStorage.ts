import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

// Free-tier object storage (Cloudflare R2, Backblaze B2, or any other
// S3-compatible provider) for attachments — Render's free-tier disk is
// wiped on every redeploy/restart, so anything written to local disk in
// production is lost. Configuring these three env vars switches storage
// over automatically; leaving them unset keeps the original local-disk
// behavior (desktop build, local dev) working exactly as before.
const BUCKET = process.env.S3_BUCKET;
const ENDPOINT = process.env.S3_ENDPOINT;
const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const REGION = process.env.S3_REGION || "auto";

export const isObjectStorageConfigured = Boolean(BUCKET && ENDPOINT && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: REGION,
      endpoint: ENDPOINT,
      credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! },
    });
  }
  return client;
}

// storage_path values for object-storage-backed attachments are prefixed
// "s3://<key>" so the download route (and anything else touching
// attachments.storage_path) can tell at a glance which backend a given row
// uses, including ones uploaded before object storage was configured.
export function objectStorageKeyFor(path: string): string | null {
  return path.startsWith("s3://") ? path.slice("s3://".length) : null;
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<string> {
  await getClient().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
  return `s3://${key}`;
}

export async function downloadObject(key: string): Promise<{ body: Readable; contentType?: string }> {
  const result = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return { body: result.Body as Readable, contentType: result.ContentType };
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
