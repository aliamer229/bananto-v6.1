import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/lib/imageProcessor.ts', 'utf8');

file = file.replace(
  `export interface ConvertedImage {
  bytes: Uint8Array;
  mime: "image/avif" | "image/webp";
  width?: number;
  height?: number;
  size: number;
}`,
  `export interface ConvertedImage {
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
}`
);

writeFileSync('src/lib/imageProcessor.ts', file);
