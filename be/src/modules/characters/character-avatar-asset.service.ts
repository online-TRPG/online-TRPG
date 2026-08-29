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
import {
  getSafePublicAssetBaseUrl,
  validateAndSanitizeRasterImage,
} from "../../common/security/image-upload-security";

type CharacterAvatarAssetRow = Prisma.CharacterAvatarAssetGetPayload<Prisma.CharacterAvatarAssetDefaultArgs>;

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

    const maxBytes = Number(process.env.R2_MAX_AVATAR_IMAGE_BYTES ?? 5 * 1024 * 1024);
    const image = await validateAndSanitizeRasterImage({
      dataBase64: dto.dataBase64,
      declaredContentType: dto.contentType,
      maxBytes,
      maxWidth: Number(process.env.R2_MAX_AVATAR_WIDTH ?? 4096),
      maxHeight: Number(process.env.R2_MAX_AVATAR_HEIGHT ?? 4096),
      maxPixels: Number(process.env.R2_MAX_AVATAR_PIXELS ?? 16_000_000),
    });
    const quotaBytes = Number(process.env.R2_MAX_AVATAR_STORAGE_BYTES_PER_USER ?? 50 * 1024 * 1024);
    const usage = await this.characterAvatarAssetDelegate.aggregate({
      where: { uploadedByUserId: userId },
      _sum: { fileSizeBytes: true },
    });
    if ((usage._sum.fileSizeBytes ?? 0) + image.body.byteLength > quotaBytes) {
      throw new BadRequestException("사용자별 초상화 저장 용량을 초과했습니다.");
    }

    const { storageKey, publicUrl } = await this.putR2Object({
      body: image.body,
      contentType: image.contentType,
      extension: image.extension,
      keyPrefix: `users/${userId}/avatars`,
    });

    let asset;
    try {
      asset = await this.characterAvatarAssetDelegate.create({
        data: {
          fileName: dto.fileName.trim(),
          contentType: image.contentType,
          storageKey,
          publicUrl,
          width: image.width,
          height: image.height,
          fileSizeBytes: image.body.byteLength,
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
        await tx.characterAvatarAsset.delete({ where: { id: asset.id } });
      });
    } catch (error) {
      this.rethrowCharacterAvatarAssetStorageError(error);
    }
  }

  private get characterAvatarAssetDelegate(): Prisma.CharacterAvatarAssetDelegate {
    return this.prisma.characterAvatarAsset;
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
    extension,
    keyPrefix,
  }: {
    body: Buffer;
    contentType: string;
    extension: ".png" | ".jpg" | ".webp";
    keyPrefix: string;
  }): Promise<{ storageKey: string; publicUrl: string }> {
    const accountId = process.env.R2_ACCOUNT_ID;
    const bucket = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    let publicBaseUrl: string;
    try {
      publicBaseUrl = getSafePublicAssetBaseUrl(process.env.R2_PUBLIC_BASE_URL);
    } catch {
      throw new ServiceUnavailableException("이미지 공개 저장소 설정이 올바르지 않습니다.");
    }

    if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException("이미지 저장소 설정이 올바르지 않습니다.");
    }

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
    } catch {
      throw new BadGatewayException("이미지 저장소에 연결할 수 없습니다.");
    }

    if (!response.ok) {
      throw new BadGatewayException("이미지 저장소 업로드에 실패했습니다.");
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
    } catch {
      throw new BadGatewayException("이미지 저장소에 연결할 수 없습니다.");
    }

    if (response.ok || response.status === 404) {
      return;
    }

    throw new BadGatewayException("이미지 저장소 삭제에 실패했습니다.");
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

}
