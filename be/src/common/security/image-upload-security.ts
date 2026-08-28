import { BadRequestException } from "@nestjs/common";
import sharp, { type Metadata } from "sharp";
import { getCorsAllowedOrigins } from "./browser-security";

export type SafeRasterContentType = "image/png" | "image/jpeg" | "image/webp";

export type SanitizedRasterImage = {
  body: Buffer;
  contentType: SafeRasterContentType;
  extension: ".png" | ".jpg" | ".webp";
  width: number;
  height: number;
};

export function getSafePublicAssetBaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("R2_PUBLIC_BASE_URL is required.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("R2_PUBLIC_BASE_URL must be an absolute URL.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("R2_PUBLIC_BASE_URL must not contain credentials, a query, or a fragment.");
  }
  if (process.env.NODE_ENV === "production") {
    if (parsed.protocol !== "https:") {
      throw new Error("R2_PUBLIC_BASE_URL must use HTTPS in production.");
    }
    const applicationOrigins = getCorsAllowedOrigins();
    if (applicationOrigins.includes(parsed.origin)) {
      throw new Error("R2_PUBLIC_BASE_URL must use an origin separate from the application.");
    }
  }
  return parsed.toString().replace(/\/$/, "");
}

const formats: Record<string, { contentType: SafeRasterContentType; extension: SanitizedRasterImage["extension"] }> = {
  png: { contentType: "image/png", extension: ".png" },
  jpeg: { contentType: "image/jpeg", extension: ".jpg" },
  webp: { contentType: "image/webp", extension: ".webp" },
};

export async function validateAndSanitizeRasterImage(params: {
  dataBase64: string;
  declaredContentType: string;
  maxBytes: number;
  maxWidth?: number;
  maxHeight?: number;
  maxPixels?: number;
}): Promise<SanitizedRasterImage> {
  const maxBytes = readPositiveLimit(params.maxBytes, "maxBytes");
  const maxWidth = readPositiveLimit(params.maxWidth ?? 8192, "maxWidth");
  const maxHeight = readPositiveLimit(params.maxHeight ?? 8192, "maxHeight");
  const maxPixels = readPositiveLimit(params.maxPixels ?? 32_000_000, "maxPixels");
  const declaredContentType = params.declaredContentType.trim().toLowerCase();
  if (!Object.values(formats).some((format) => format.contentType === declaredContentType)) {
    throw invalidImage("PNG, JPEG, WebP 이미지만 업로드할 수 있습니다.");
  }

  const input = decodeCanonicalBase64(params.dataBase64, maxBytes);
  let metadata: Metadata;
  try {
    metadata = await sharp(input, {
      animated: true,
      failOn: "error",
      limitInputPixels: maxPixels,
      sequentialRead: true,
    }).metadata();
  } catch {
    throw invalidImage("손상되었거나 지원하지 않는 이미지입니다.");
  }

  const format = metadata.format ? formats[metadata.format] : undefined;
  if (!format || format.contentType !== declaredContentType) {
    throw invalidImage("선언된 MIME 형식과 실제 이미지 형식이 일치하지 않습니다.");
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw invalidImage("애니메이션 이미지는 업로드할 수 없습니다.");
  }
  if (!metadata.width || !metadata.height) {
    throw invalidImage("이미지 크기를 확인할 수 없습니다.");
  }
  if (
    metadata.width > maxWidth ||
    metadata.height > maxHeight ||
    metadata.width * metadata.height > maxPixels
  ) {
    throw invalidImage("이미지 해상도가 허용 범위를 초과합니다.");
  }

  let body: Buffer;
  try {
    const pipeline = sharp(input, {
      failOn: "error",
      limitInputPixels: maxPixels,
      sequentialRead: true,
    }).rotate();
    body = format.contentType === "image/png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : format.contentType === "image/jpeg"
        ? await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
        : await pipeline.webp({ quality: 90 }).toBuffer();
  } catch {
    throw invalidImage("이미지를 안전한 형식으로 변환할 수 없습니다.");
  }
  if (body.byteLength <= 0 || body.byteLength > maxBytes) {
    throw invalidImage("변환된 이미지 파일이 허용 크기를 초과합니다.");
  }

  const outputMetadata = await sharp(body, { limitInputPixels: maxPixels }).metadata();
  if (!outputMetadata.width || !outputMetadata.height) {
    throw invalidImage("변환된 이미지 크기를 확인할 수 없습니다.");
  }
  return {
    body,
    contentType: format.contentType,
    extension: format.extension,
    width: outputMetadata.width,
    height: outputMetadata.height,
  };
}

function decodeCanonicalBase64(value: string, maxBytes: number): Buffer {
  if (!value || value !== value.trim() || value.length > Math.ceil(maxBytes / 3) * 4 + 4) {
    throw invalidImage("이미지 데이터가 비어 있거나 너무 큽니다.");
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw invalidImage("이미지 데이터의 base64 형식이 올바르지 않습니다.");
  }
  const body = Buffer.from(value, "base64");
  if (body.byteLength <= 0 || body.byteLength > maxBytes || body.toString("base64") !== value) {
    throw invalidImage("이미지 데이터의 base64 형식이 올바르지 않습니다.");
  }
  return body;
}

function readPositiveLimit(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return value;
}

function invalidImage(message: string): BadRequestException {
  return new BadRequestException(message);
}
