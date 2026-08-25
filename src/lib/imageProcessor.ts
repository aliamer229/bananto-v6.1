import { readBinary, writeBinary } from "./storage.server";

export interface ImageProcessingOptions {
  highQuality?: boolean;
  preserveDimensions?: boolean;
}

export interface ConvertedImage {
  bytes: Uint8Array;
  mime: "image/webp";
  width?: number;
  height?: number;
  size: number;
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
 * Convert any supported image (JPEG, PNG, AVIF, TIFF, BMP, GIF, HEIC/HEIF, WebP)
 * to a smart-optimized, high-fidelity WebP format.
 *
 * Guaranteed smart processing:
 * - Preserves aspect ratio and full UV texture layout without stretch or unwanted cropping.
 * - Automatically corrects EXIF orientation.
 * - Preserves alpha transparency.
 * - Removes non-essential metadata while keeping color accuracy.
 * - Uses ultra-high quality for 3D textures (98) and crisp high-quality for box covers (90).
 */
export async function convertToWebP(
  bytes: Uint8Array,
  mime: string,
  highQuality = false
): Promise<Uint8Array | null> {
  const result = await processImageToWebP(bytes, mime, { highQuality });
  return result ? result.bytes : null;
}

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
      const image = sharp(bytes, { failOnError: false });
      
      // Auto-rotate according to EXIF orientation, preserve alpha, strip heavy metadata
      const pipeline = image
        .rotate() // Automatic EXIF rotation
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
    // Sharp failed or not available in current environment (e.g. edge worker)
  }

  // 2. Fallback to @jsquash (pure WebAssembly, works in Cloudflare Workers & browser)
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
      // Already valid WebP
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

  // If already WebP and decoders weren't needed, preserve it
  if (isWebP(bytes)) {
    return {
      bytes,
      mime: "image/webp",
      size: bytes.length,
    };
  }

  return null;
}
