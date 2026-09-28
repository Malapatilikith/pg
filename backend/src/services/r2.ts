import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { EnvBindings } from "../types";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]);

const getR2Client = (env: EnvBindings) => {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY
    }
  });
};

const sanitizeFileName = (name: string) => {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").toLowerCase();
};

const sanitizeExtension = (ext: string) => {
  return ext.toLowerCase().replace(/[^a-z0-9]/g, "");
};

const getExtensionFromMimeType = (mimeType: string) => {
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
};

const buildObjectKey = (
  folder: "aadhaar" | "receipts" | "logos",
  entityId: string,
  originalFileName: string,
  mimeType: string
) => {
  const fileBaseName = originalFileName.replace(/\.[^/.]+$/, "");
  const safeName = sanitizeFileName(fileBaseName) || "document";
  const rawExt = originalFileName.includes(".") ? originalFileName.split(".").pop() ?? "" : "";
  const ext = sanitizeExtension(rawExt) || getExtensionFromMimeType(mimeType);
  const label = folder === "aadhaar" ? "aadhaar-card" : folder === "logos" ? "brand-logo" : "payment-receipt";

  return `${folder}/${entityId}/${label}-${safeName}.${ext}`;
};

const getParentPrefixes = (key: string) => {
  const parts = key.split("/").filter(Boolean);
  if (parts.length < 2) {
    return [];
  }

  const prefixes: string[] = [];
  for (let i = parts.length - 1; i >= 1; i--) {
    prefixes.push(`${parts.slice(0, i).join("/")}/`);
  }

  return prefixes;
};

const cleanupEmptyPrefixes = async (client: S3Client, bucket: string, deletedKey: string) => {
  const prefixes = getParentPrefixes(deletedKey);

  for (const prefix of prefixes) {
    try {
      const listed = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: 2
        })
      );

      const hasAnyObjects = (listed.Contents ?? []).some((item) => Boolean(item.Key && item.Key !== prefix));
      if (hasAnyObjects) {
        continue;
      }

      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: prefix
        })
      );
    } catch {
      // Prefix cleanup is best-effort; object delete has already completed.
      continue;
    }
  }
};

export const validateFile = (file: File) => {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Invalid file type. Allowed: jpg, jpeg, png, webp, pdf");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File too large. Max size is 5MB");
  }
};

export const uploadFileToR2 = async (
  env: EnvBindings,
  file: File,
  folder: "aadhaar" | "receipts" | "logos",
  entityId: string
) => {
  validateFile(file);

  const client = getR2Client(env);
  const key = buildObjectKey(folder, entityId, file.name, file.type);

  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: new Uint8Array(await file.arrayBuffer()),
      ContentType: file.type
    })
  );

  const publicBase = env.R2_PUBLIC_URL.replace(/\/$/, "");
  return `${publicBase}/${key}`;
};

const resolveKeyFromPublicUrl = (publicBase: string, fileUrl: string) => {
  const normalizedBase = publicBase.replace(/\/$/, "");
  const normalizedUrl = fileUrl.trim();

  if (normalizedUrl.startsWith(`${normalizedBase}/`)) {
    return normalizedUrl.slice(normalizedBase.length + 1);
  }

  try {
    const parsed = new URL(normalizedUrl);
    return parsed.pathname.replace(/^\/+/, "");
  } catch {
    return null;
  }
};

export const deleteFileFromR2 = async (env: EnvBindings, fileUrl: string) => {
  const key = resolveKeyFromPublicUrl(env.R2_PUBLIC_URL, fileUrl);
  if (!key) {
    return;
  }

  const client = getR2Client(env);
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key
    })
  );

  await cleanupEmptyPrefixes(client, env.R2_BUCKET_NAME, key);
};

export const deleteFilesFromR2 = async (env: EnvBindings, fileUrls: string[]) => {
  for (const url of fileUrls) {
    if (!url) {
      continue;
    }

    try {
      await deleteFileFromR2(env, url);
    } catch {
      // File cleanup should not block parent entity deletion.
      continue;
    }
  }
};
