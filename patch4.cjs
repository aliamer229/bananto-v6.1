const fs = require('fs');
let code = fs.readFileSync('src/lib/mediaIngest.server.ts', 'utf8');

const replacement = `
export function isSafeRemoteImageUrl(raw: string): URL | null {
  if (!raw || typeof raw !== "string" || raw.length > 4096) return null;
  // Remove zero-width spaces and control characters
  let cleanStr = raw.replace(/[\\u200B-\\u200D\\uFEFF\\x00-\\x1F\\x7F]/g, "").trim();
  // Quick unescape of common HTML entities if present
  cleanStr = cleanStr.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  
  let url: URL;
  try {
    url = new URL(cleanStr);
  } catch {
    // If it fails, maybe the path has unencoded spaces or weird chars, let's try a fallback encode URI
    try {
      url = new URL(encodeURI(cleanStr));
    } catch {
      return null;
    }
  }
`;

code = code.replace(
  /export function isSafeRemoteImageUrl\(raw: string\): URL \| null \{[\s\S]*?try \{\n\s*url = new URL\(trimmed\);\n\s*\} catch \{\n\s*return null;\n\s*\}/,
  replacement
);

fs.writeFileSync('src/lib/mediaIngest.server.ts', code);
