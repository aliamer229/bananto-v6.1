/**
 * A minimal ZIP reader for the admin batch importer.
 *
 * The batch importer needs one thing from a ZIP file: the text of every `.txt`
 * entry inside it. That is small enough to read directly from the central
 * directory, and doing so keeps a compression library out of the browser
 * bundle — inflating uses the platform's own `DecompressionStream`.
 *
 * Deliberately narrow: stored (method 0) and deflated (method 8) entries only,
 * which is everything a ZIP produced by Windows, macOS, or `zip(1)` contains.
 * Anything else is reported per entry so one odd file cannot fail a whole run.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** The EOCD record is 22 bytes plus a comment of at most 0xffff bytes. */
const EOCD_MAX_SEARCH = 22 + 0xffff;

export interface ZipEntry {
  /** Full path inside the archive, e.g. `games/zelda.txt`. */
  name: string;
  /** File name without its directories. */
  baseName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export class ZipError extends Error {}

function findEndOfCentralDirectory(view: DataView): number {
  const start = Math.max(0, view.byteLength - EOCD_MAX_SEARCH);
  for (let offset = view.byteLength - 22; offset >= start; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new ZipError("الملف ليس أرشيف ZIP صالح");
}

/** Every entry recorded in the archive's central directory. */
export function listZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  if (view.byteLength < 22) throw new ZipError("الملف ليس أرشيف ZIP صالح");

  const eocd = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
    entries.push({
      name,
      baseName: name.split("/").pop() || name,
      compressionMethod: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
      localHeaderOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * The entries a batch import should look at.
 *
 * Directory records, the `__MACOSX` resource forks a Mac adds to every archive,
 * and dot files are all noise; only `.txt` files carry a game template.
 */
export function isImportableTextEntry(entry: ZipEntry): boolean {
  if (entry.name.endsWith("/")) return false;
  if (entry.name.split("/").some((part) => part === "__MACOSX")) return false;
  if (entry.baseName.startsWith(".")) return false;
  return entry.baseName.toLowerCase().endsWith(".txt");
}

async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new DecompressionStream("deflate-raw")).getReader();

  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    size += value.length;
  }

  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Raw bytes of one entry, inflating it when the archive stored it deflated. */
export async function readZipEntryBytes(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buffer);
  const header = entry.localHeaderOffset;
  if (header + 30 > view.byteLength || view.getUint32(header, true) !== LOCAL_SIGNATURE) {
    throw new ZipError("سجل الملف داخل الأرشيف تالف");
  }
  const nameLength = view.getUint16(header + 26, true);
  const extraLength = view.getUint16(header + 28, true);
  const dataStart = header + 30 + nameLength + extraLength;
  const raw = new Uint8Array(buffer, dataStart, entry.compressedSize);

  if (entry.compressionMethod === 0) return raw;
  if (entry.compressionMethod === 8) return inflateRaw(raw);
  throw new ZipError(`نوع ضغط غير مدعوم (${entry.compressionMethod})`);
}

/** UTF-8 text of one entry, with a byte-order mark removed. */
export async function readZipEntryText(buffer: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const bytes = await readZipEntryBytes(buffer, entry);
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}
