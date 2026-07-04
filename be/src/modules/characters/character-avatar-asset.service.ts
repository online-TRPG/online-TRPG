import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  CharacterAvatarType as PrismaCharacterAvatarType,
  Prisma,
} from "@prisma/client";
import { createHash, createHmac, randomUUID } from "crypto";
import {
  CharacterAvatarType,
  CharacterAvatarAssetResponseDto,
  UploadCharacterAvatarDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";

type CharacterAvatarAssetRow = {
  id: string;
  fileName: string;
  contentType: string;
  storageKey: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  fileSizeBytes: number;
  uploadedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

type CharacterAvatarAssetDelegate = {
  findMany: (args: unknown) => Promise<CharacterAvatarAssetRow[]>;
  create: (args: unknown) => Promise<CharacterAvatarAssetRow>;
  findFirst: (args: unknown) => Promise<CharacterAvatarAssetRow | null>;
};

@Injectable()
export class CharacterAvatarAssetService {
  constructor(private readonly prisma: PrismaService) {}

  resolveAvatarType(value?: CharacterAvatarType): PrismaCharacterAvatarType {
    switch (value) {
      case CharacterAvatarType.PRESET:
        return PrismaCharacterAvatarType.PRESET;
      case CharacterAvatarType.UPLOAD:
        return PrismaCharacterAvatarType.UPLOAD;
      case CharacterAvatarType.DEFAULT:
      default:
        return PrismaCharacterAvatarType.DEFAULT;
    }
  }

  async listMyAvatarAssets(userId: string): Promise<CharacterAvatarAssetResponseDto[]> {
    await this.ensureUserExists(userId);

    let assets;
    try {
      assets = await this.characterAvatarAssetDelegate.findMany({
        where: { uploadedByUserId: userId },
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      this.rethrowCharacterAvatarAssetStorageError(error);
    }

    return assets.map((asset) => this.mapCharacterAvatarAsset(asset));
  }

  async uploadMyAvatarAsset(
    userId: string,
    dto: UploadCharacterAvatarDto,
  ): Promise<CharacterAvatarAssetResponseDto> {
    await this.ensureUserExists(userId);

    const allowedContentTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (!allowedContentTypes.has(dto.contentType)) {
      throw new BadRequestException("초상화는 PNG, JPEG, WebP 이미지만 업로드할 수 있습니다.");
    }

    const body = Buffer.from(dto.dataBase64, "base64");
    const maxBytes = Number(process.env.R2_MAX_AVATAR_IMAGE_BYTES ?? 5 * 1024 * 1024);
    if (body.byteLength <= 0) {
      throw new BadRequestException("초상화 이미지가 비어 있습니다.");
    }
    if (body.byteLength > maxBytes) {
      throw new BadRequestException("초상화 이미지 파일이 너무 큽니다.");
    }

    const { storageKey, publicUrl } = await this.putR2Object({
      body,
      contentType: dto.contentType,
      fileName: dto.fileName,
      keyPrefix: `users/${userId}/avatars`,
    });

    let asset;
    try {
      asset = await this.characterAvatarAssetDelegate.create({
        data: {
          fileName: dto.fileName.trim(),
          contentType: dto.contentType,
          storageKey,
          publicUrl,
          width: null,
          height: null,
          fileSizeBytes: body.byteLength,
          uploadedByUserId: userId,
        },
      });
    } catch (error) {
      this.rethrowCharacterAvatarAssetStorageError(error);
    }

    return this.mapCharacterAvatarAsset(asset);
  }

  async deleteMyAvatarAsset(userId: string, assetId: string): Promise<void> {
    await this.ensureUserExists(userId);

    let asset;
    try {
      asset = await this.characterAvatarAssetDelegate.findFirst({
        where: { id: assetId, uploadedByUserId: userId },
      });
    } catch (error) {
      this.rethrowCharacterAvatarAssetStorageError(error);
    }

    if (!asset) {
      throw new NotFoundException("초상화 이미지를 찾을 수 없습니다.");
    }

    await this.deleteR2Object(asset.storageKey);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.character.updateMany({
          where: {
            ownerUserId: userId,
            avatarUrl: asset.publicUrl,
          },
          data: {
            avatarType: PrismaCharacterAvatarType.DEFAULT,
            avatarPresetId: null,
            avatarUrl: null,
            avatarUpdatedAt: new Date(),
          },
        });
        await (tx as unknown as { characterAvatarAsset: { delete: (args: unknown) => Promise<unknown> } })
          .characterAvatarAsset
          .delete({ where: { id: asset.id } });
      });
    } catch (error) {
      this.rethrowCharacterAvatarAssetStorageError(error);
    }
  }

  private get characterAvatarAssetDelegate(): CharacterAvatarAssetDelegate {
    return (this.prisma as unknown as {
      characterAvatarAsset: CharacterAvatarAssetDelegate;
    }).characterAvatarAsset;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    }).catch(() => {
      throw new NotFoundException(`User ${userId} was not found.`);
    });
  }

  private mapCharacterAvatarAsset(asset: CharacterAvatarAssetRow): CharacterAvatarAssetResponseDto {
    return {
      id: asset.id,
      fileName: asset.fileName,
      contentType: asset.contentType,
      storageKey: asset.storageKey,
      publicUrl: asset.publicUrl,
      width: asset.width,
      height: asset.height,
      fileSizeBytes: asset.fileSizeBytes,
      uploadedByUserId: asset.uploadedByUserId,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  private rethrowCharacterAvatarAssetStorageError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      throw new ServiceUnavailableException(
        "Character avatar asset storage schema is missing. Run `npm run prisma:push -w @trpg/be` and restart the backend.",
      );
    }

    throw error;
  }

  private async putR2Object({
    body,
    contentType,
    fileName,
    keyPrefix,
  }: {
    body: Buffer;
    contentType: string;
    fileName: string;
    keyPrefix: string;
  }): Promise<{ storageKey: string; publicUrl: string }> {
    const accountId = process.env.R2_ACCOUNT_ID;
    const bucket = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");

    if (!accountId || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
      throw new BadRequestException("R2 업로드 환경변수가 설정되지 않았습니다.");
    }

    const extension = this.getSafeAvatarFileExtension(fileName, contentType);
    const key = `${keyPrefix}/${randomUUID()}${extension}`;
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const url = new URL(`${endpoint}/${bucket}/${key}`);
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256").update(body).digest("hex");
    const encodedPath = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const canonicalHeaders =
      `host:${url.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "PUT",
      encodedPath,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");
    const signingKey = this.getSignatureKey(secretAccessKey, dateStamp, "auto", "s3");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: authorization,
          "Content-Type": contentType,
          "x-amz-content-sha256": payloadHash,
          "x-amz-date": amzDate,
        },
        body,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown network error";
      throw new BadGatewayException(
        `R2 avatar upload request failed before a response was received. ${detail}`,
      );
    }

    if (!response.ok) {
      const message = await response.text();
      throw new BadRequestException(`R2 업로드에 실패했습니다. (${response.status}) ${message}`);
    }

    return {
      storageKey: key,
      publicUrl: `${publicBaseUrl}/${key}`,
    };
  }

  private async deleteR2Object(storageKey: string): Promise<void> {
    const accountId = process.env.R2_ACCOUNT_ID;
    const bucket = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
      throw new BadRequestException("R2 삭제 환경변수가 설정되지 않았습니다.");
    }

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const url = new URL(`${endpoint}/${bucket}/${storageKey}`);
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256").update("").digest("hex");
    const encodedPath = `/${bucket}/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
    const canonicalHeaders =
      `host:${url.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "DELETE",
      encodedPath,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");
    const signingKey = this.getSignatureKey(secretAccessKey, dateStamp, "auto", "s3");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: authorization,
          "x-amz-content-sha256": payloadHash,
          "x-amz-date": amzDate,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown network error";
      throw new BadGatewayException(
        `R2 avatar delete request failed before a response was received. ${detail}`,
      );
    }

    if (response.ok || response.status === 404) {
      return;
    }

    const message = await response.text();
    throw new BadRequestException(`R2 삭제에 실패했습니다. (${response.status}) ${message}`);
  }

  private formatAmzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  }

  private getSignatureKey(
    secret: string,
    dateStamp: string,
    region: string,
    service: string,
  ): Buffer {
    const kDate = createHmac("sha256", `AWS4${secret}`).update(dateStamp).digest();
    const kRegion = createHmac("sha256", kDate).update(region).digest();
    const kService = createHmac("sha256", kRegion).update(service).digest();
    return createHmac("sha256", kService).update("aws4_request").digest();
  }

  private getSafeAvatarFileExtension(fileName: string, contentType: string): string {
    const lowered = fileName.toLowerCase();
    const match = lowered.match(/\.(png|jpe?g|webp)$/);
    if (match) {
      return match[0] === ".jpeg" ? ".jpg" : match[0];
    }

    switch (contentType) {
      case "image/png":
        return ".png";
      case "image/jpeg":
        return ".jpg";
      case "image/webp":
        return ".webp";
      default:
        return ".img";
    }
  }
}
