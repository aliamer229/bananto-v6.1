const sharp = require('sharp');
async function test() {
  const svg = `
    <svg width="200" height="200">
      <rect width="200" height="200" fill="white" />
      <rect x="50" y="50" width="100" height="100" fill="red" />
    </svg>
  `;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  
  const img = sharp(buf);
  const meta = await img.metadata();
  
  const w = meta.width;
  const h = meta.height;
  
  // Extract 4 corners
  const tl = await sharp(buf).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  const tr = await sharp(buf).extract({ left: w - 1, top: 0, width: 1, height: 1 }).raw().toBuffer();
  const bl = await sharp(buf).extract({ left: 0, top: h - 1, width: 1, height: 1 }).raw().toBuffer();
  const br = await sharp(buf).extract({ left: w - 1, top: h - 1, width: 1, height: 1 }).raw().toBuffer();
  
  const corners = [tl, tr, bl, br];
  console.log('Corners:', corners.map(c => Array.from(c)));
  
  // Check if they are similar
  const isSimilar = (c1, c2) => Math.abs(c1[0]-c2[0]) < 10 && Math.abs(c1[1]-c2[1]) < 10 && Math.abs(c1[2]-c2[2]) < 10;
  const allSimilar = isSimilar(tl, tr) && isSimilar(tl, bl) && isSimilar(tl, br);
  
  console.log('All similar?', allSimilar);
}
test().catch(console.error);
