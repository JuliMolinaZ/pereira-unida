import "server-only";
import {
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} para DigitalOcean Spaces.`);
  return value;
}

export function isSpacesConfigured(): boolean {
  return Boolean(
    process.env.SPACES_KEY &&
      process.env.SPACES_SECRET &&
      process.env.SPACES_BUCKET &&
      process.env.SPACES_REGION
  );
}

function spacesBucket(): string {
  return required("SPACES_BUCKET");
}

function spacesClient(): S3Client {
  const region = required("SPACES_REGION");
  return new S3Client({
    region,
    endpoint: process.env.SPACES_ENDPOINT?.trim() || `https://${region}.digitaloceanspaces.com`,
    credentials: {
      accessKeyId: required("SPACES_KEY"),
      secretAccessKey: required("SPACES_SECRET"),
    },
    forcePathStyle: false,
  });
}

export function spacesPublicUrl(key: string): string {
  const region = required("SPACES_REGION");
  const bucket = spacesBucket();
  const cdn =
    process.env.SPACES_CDN_URL?.replace(/\/$/, "") ||
    `https://${bucket}.${region}.cdn.digitaloceanspaces.com`;
  return `${cdn}/${key}`;
}

export async function uploadSpaceObject(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<string> {
  const client = spacesClient();
  await client.send(
    new PutObjectCommand({
      Bucket: spacesBucket(),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ACL: "public-read",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return spacesPublicUrl(input.key);
}

export async function deleteSpaceObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const client = spacesClient();
  await client.send(
    new DeleteObjectsCommand({
      Bucket: spacesBucket(),
      Delete: {
        Objects: keys.map((Key) => ({ Key })),
        Quiet: true,
      },
    })
  );
}
