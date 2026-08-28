/**
 * Entry point bundled for the template import script.
 *
 * Everything here is the application's own code. A new product is built by the
 * same `buildBatchGameImport` the admin batch archive uses — same parser, same
 * field mapping, same hidden-by-default flag — and an update to an existing
 * product goes through `mergeProductUpdate`, the guard the save endpoint uses.
 * Re-deriving either in a script would be a second implementation of the rules
 * that decide what production keeps.
 */
export { parseGameImport } from "@/lib/gameImportParser";
export { buildBatchGameImport } from "@/lib/gameImportForm";
export { mergeProductUpdate, destructiveUpdateLog, oversizedMediaLog } from "@/lib/productMergeGuard";
export { d1All, d1Run } from "@/lib/d1.server";
