import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";
import {
  getSafePublicAssetBaseUrl,
  validateAndSanitizeRasterImage,
} from "./image-upload-security";

describe("image upload security", () => {
  it("decodes and re-encodes a valid raster image with dimensions", async () => {
    const source = await sharp({
      create: { width: 8, height: 6, channels: 4, background: "#ff000080" },
    }).png().withMetadata({ orientation: 6 }).toBuffer();

    const result = await validateAndSanitizeRasterImage({
      dataBase64: source.toString("base64"),
      declaredContentType: "image/png",
      maxBytes: 1_000_000,
      maxPixels: 1_000,
    });

    expect(result.contentType).toBe("image/png");
    expect(result.extension).toBe(".png");
    expect(result.width * result.height).toBe(48);
    expect((await sharp(result.body).metadata()).exif).toBeUndefined();
  });

  it("rejects MIME spoofing and non-image payloads", async () => {
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "red" },
    }).png().toBuffer();

    await expect(validateAndSanitizeRasterImage({
      dataBase64: png.toString("base64"),
      declaredContentType: "image/jpeg",
      maxBytes: 100_000,
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validateAndSanitizeRasterImage({
      dataBase64: Buffer.from("<svg><script>alert(1)</script></svg>").toString("base64"),
      declaredContentType: "image/png",
      maxBytes: 100_000,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects images whose decoded pixel count is too large", async () => {
    const png = await sharp({
      create: { width: 101, height: 101, channels: 3, background: "blue" },
    }).png().toBuffer();

    await expect(validateAndSanitizeRasterImage({
      dataBase64: png.toString("base64"),
      declaredContentType: "image/png",
      maxBytes: 100_000,
      maxPixels: 10_000,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects animated WebP frames", async () => {
    const animated = await createAnimatedWebp();

    await expect(validateAndSanitizeRasterImage({
      dataBase64: animated.toString("base64"),
      declaredContentType: "image/webp",
      maxBytes: 100_000,
    })).rejects.toThrow("애니메이션 이미지는 업로드할 수 없습니다.");
  });

  it("requires a separate HTTPS asset origin in production", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalOrigins = process.env.CORS_ALLOWED_ORIGINS;
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com/";
    try {
      expect(() => getSafePublicAssetBaseUrl("http://assets.example.com")).toThrow();
      expect(() => getSafePublicAssetBaseUrl("https://app.example.com/assets")).toThrow();
      expect(getSafePublicAssetBaseUrl("https://assets.example.com/")).toBe("https://assets.example.com");
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.CORS_ALLOWED_ORIGINS = originalOrigins;
    }
  });
});

async function createAnimatedWebp(): Promise<Buffer> {
  const staticWebp = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  }).webp().toBuffer();
  const frameBitstream = staticWebp.subarray(12);
  const frame = () => chunk("ANMF", Buffer.concat([
    uint24(0),
    uint24(0),
    uint24(0),
    uint24(0),
    uint24(100),
    Buffer.from([0]),
    frameBitstream,
  ]));
  const body = Buffer.concat([
    Buffer.from("WEBP"),
    chunk("VP8X", Buffer.concat([Buffer.from([2, 0, 0, 0]), uint24(0), uint24(0)])),
    chunk("ANIM", Buffer.alloc(6)),
    frame(),
    frame(),
  ]);
  const header = Buffer.alloc(8);
  header.write("RIFF");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

function uint24(value: number): Buffer {
  return Buffer.from([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]);
}
