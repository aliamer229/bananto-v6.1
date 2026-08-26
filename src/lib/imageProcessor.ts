import { readBinary, writeBinary } from "./storage.server";

export interface ImageProcessingOptions {
  highQuality?: boolean;
  preserveDimensions?: boolean;
  generateVariants?: boolean;
}

export interface ConvertedImage {
  bytes: Uint8Array;
  mime: "image/avif" | "image/webp";
  width?: number;
  height?: number;
  size: number;
  variants?: {
    thumb?: Uint8Array;
    card?: Uint8Array;
    large?: Uint8Array;
  };
}

export interface ImageVariant {
  width: number;
  height: number;
  avif: Uint8Array;
  webp: Uint8Array;
}

export interface MultiFormatImageResult {
  avif: ConvertedImage;
  webp: ConvertedImage;
  variants?: {
    thumb?: ImageVariant;
    card?: ImageVariant;
    medium?: ImageVariant;
    full?: ImageVariant;
  };
  originalWidth?: number;
  originalHeight?: number;
}

/**
 * Checks if bytes represent a valid WebP container
 */
export function isWebP(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return (
    bytes[0] === 0x52 && // 'R'
    bytes[1] === 0x49 && // 'I'
    bytes[2] === 0x46 && // 'F'
    bytes[3] === 0x46 && // 'F'
    bytes[8] === 0x57 && // 'W'
    bytes[9] === 0x45 && // 'E'
    bytes[10] === 0x42 && // 'B'
    bytes[11] === 0x50 // 'P'
  );
}

/**
 * Checks if bytes represent a valid AVIF / HEIF container
 */
export function isAvif(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  // ftyp box at offset 4
  return (
    bytes[4] === 0x66 && // 'f'
    bytes[5] === 0x74 && // 't'
    bytes[6] === 0x79 && // 'y'
    bytes[7] === 0x70    // 'p'
  );
}

/**
 * Convert any supported image to a smart-optimized, high-fidelity AVIF format.
 * (Preferred primary format for web delivery).
 */
export async function convertToAvif(
  bytes: Uint8Array,
  mime: string,
  highQuality = false
): Promise<Uint8Array | null> {
  const result = await processImageToAvif(bytes, mime, { highQuality });
  return result ? result.bytes : null;
}

/**
 * Convert any supported image to a smart-optimized WebP format.
 * (Universal secondary fallback).
 */
export async function convertToWebP(
  bytes: Uint8Array,
  mime: string,
  highQuality = false
): Promise<Uint8Array | null> {
  const result = await processImageToWebP(bytes, mime, { highQuality });
  return result ? result.bytes : null;
}

/**
 * Process image to AVIF format with Sharp or WebAssembly fallback.
 */
export async function processImageToAvif(
  bytes: Uint8Array,
  mime: string,
  options: ImageProcessingOptions = {}
): Promise<ConvertedImage | null> {
  if (!bytes || bytes.length === 0) return null;

  const quality = options.highQuality ? 92 : 85;

  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default || sharpModule;
    if (typeof sharp === "function") {
      const image = sharp(bytes, { failOnError: false } as any);
      const metadata = await image.metadata().catch(() => undefined);

      const pipeline = image
        .rotate() // Auto-correct EXIF orientation
        .avif({
          quality,
          effort: 5,
          chromaSubsampling: options.highQuality ? "4:4:4" : "4:2:0",
        });

      const buffer = await pipeline.toBuffer();
      const resultBytes = new Uint8Array(buffer);

      return {
        bytes: resultBytes,
        mime: "image/avif",
        width: metadata?.width,
        height: metadata?.height,
        size: resultBytes.length,
      };
    }
  } catch (err) {
    // Sharp not available or failed
  }

  // If already AVIF, return as is
  if (isAvif(bytes)) {
    return {
      bytes,
      mime: "image/avif",
      size: bytes.length,
    };
  }

  // Fallback to WebP if AVIF encoder unavailable
  const webpFallback = await processImageToWebP(bytes, mime, options);
  if (webpFallback) {
    return {
      bytes: webpFallback.bytes,
      mime: "image/webp" as any,
      width: webpFallback.width,
      height: webpFallback.height,
      size: webpFallback.size,
    };
  }

  return null;
}

/**
 * Process image to WebP format with Sharp or jsquash fallback.
 */
export async function processImageToWebP(
  bytes: Uint8Array,
  mime: string,
  options: ImageProcessingOptions = {}
): Promise<ConvertedImage | null> {
  if (!bytes || bytes.length === 0) return null;

  const quality = options.highQuality ? 98 : 90;

  // 1. Try sharp first (Node.js runtime)
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default || sharpModule;
    if (typeof sharp === "function") {
      const image = sharp(bytes, { failOnError: false } as any);
      
      const pipeline = image
        .rotate()
        .webp({
          quality,
          effort: 6,
          lossless: false,
          nearLossless: options.highQuality,
          smartSubsample: true,
          alphaQuality: 100,
        });

      const metadata = await image.metadata().catch(() => undefined);
      const buffer = await pipeline.toBuffer();
      const resultBytes = new Uint8Array(buffer);

      return {
        bytes: resultBytes,
        mime: "image/webp",
        width: metadata?.width,
        height: metadata?.height,
        size: resultBytes.length,
      };
    }
  } catch (err) {
    // Sharp failed or not available in current environment
  }

  // 2. Fallback to @jsquash (pure WebAssembly)
  try {
    let imageData: any = null;
    const cleanMime = (mime || "").toLowerCase().split(";")[0]?.trim();

    if (cleanMime === "image/jpeg" || cleanMime === "image/jpg") {
      const { default: decodeJpeg } = await import("@jsquash/jpeg/decode");
      imageData = await decodeJpeg(bytes.buffer as ArrayBuffer);
    } else if (cleanMime === "image/png") {
      const { default: decodePng } = await import("@jsquash/png/decode");
      imageData = await decodePng(bytes.buffer as ArrayBuffer);
    } else if (cleanMime === "image/webp" || isWebP(bytes)) {
      return {
        bytes,
        mime: "image/webp",
        size: bytes.length,
      };
    }

    if (imageData) {
      const { default: encodeWebp } = await import("@jsquash/webp/encode");
      const encodedBuffer = await encodeWebp(imageData, { quality });
      const outBytes = new Uint8Array(encodedBuffer);
      return {
        bytes: outBytes,
        mime: "image/webp",
        width: imageData.width,
        height: imageData.height,
        size: outBytes.length,
      };
    }
  } catch (jsquashErr) {
    console.error("jsquash conversion fallback failed:", jsquashErr);
  }

  // If already WebP, preserve it
  if (isWebP(bytes)) {
    return {
      bytes,
      mime: "image/webp",
      size: bytes.length,
    };
  }

  return null;
}

/**
 * High-performance full image pipeline: produces primary AVIF + fallback WebP
 * and optional responsive variants (thumb: 240w, card: 480w, medium: 800w, full: original).
 */
export async function processImagePipeline(
  bytes: Uint8Array,
  mime: string,
  options: ImageProcessingOptions = {}
): Promise<MultiFormatImageResult | null> {
  if (!bytes || bytes.length === 0) return null;

  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default || sharpModule;
    if (typeof sharp === "function") {
      const base = sharp(bytes, { failOnError: false } as any).rotate();
      const meta = await base.metadata().catch(() => undefined);
      const origW = meta?.width || 800;
      const origH = meta?.height || 600;

      const avifQuality = options.highQuality ? 92 : 85;
      const webpQuality = options.highQuality ? 98 : 90;

      const fullAvifBuf = await base
        .clone()
        .avif({ quality: avifQuality, effort: 5 })
        .toBuffer();

      const fullWebpBuf = await base
        .clone()
        .webp({ quality: webpQuality, effort: 5, smartSubsample: true })
        .toBuffer();

      const result: MultiFormatImageResult = {
        avif: {
          bytes: new Uint8Array(fullAvifBuf),
          mime: "image/avif",
          width: origW,
          height: origH,
          size: fullAvifBuf.length,
        },
        webp: {
          bytes: new Uint8Array(fullWebpBuf),
          mime: "image/webp",
          width: origW,
          height: origH,
          size: fullWebpBuf.length,
        },
        originalWidth: origW,
        originalHeight: origH,
      };

      if (options.generateVariants && !options.highQuality) {
        const variantSizes = [
          { name: "thumb" as const, width: Math.min(240, origW) },
          { name: "card" as const, width: Math.min(480, origW) },
          { name: "medium" as const, width: Math.min(800, origW) },
        ];

        result.variants = {};

        for (const { name, width } of variantSizes) {
          if (width >= origW) continue;
          const resized = base.clone().resize({ width, fit: "inside", withoutEnlargement: true });
          const [avifBuf, webpBuf] = await Promise.all([
            resized.clone().avif({ quality: avifQuality, effort: 4 }).toBuffer(),
            resized.clone().webp({ quality: webpQuality, effort: 4 }).toBuffer(),
          ]);

          const resMeta = await resized.metadata().catch(() => undefined);
          result.variants[name] = {
            width: resMeta?.width || width,
            height: resMeta?.height || Math.round((width * origH) / origW),
            avif: new Uint8Array(avifBuf),
            webp: new Uint8Array(webpBuf),
          };
        }
      }

      return result;
    }
  } catch (err) {
    console.error("[imagePipeline] Sharp pipeline error:", err);
  }

  // Fallback if Sharp is unavailable
  const webp = await processImageToWebP(bytes, mime, options);
  if (!webp) return null;

  return {
    avif: {
      bytes: webp.bytes,
      mime: "image/webp" as any,
      width: webp.width,
      height: webp.height,
      size: webp.size,
    },
    webp,
    originalWidth: webp.width,
    originalHeight: webp.height,
  };
}
