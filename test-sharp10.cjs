const sharp = require('sharp');
async function test() {
  const svg = `
    <svg width="200" height="200">
      <!-- red switch banner at top -->
      <rect width="200" height="30" fill="red" />
      <!-- black cover below -->
      <rect y="30" width="200" height="170" fill="black" />
    </svg>
  `;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  
  const w = 200, h = 200;
  const tl = await sharp(buf).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  const tr = await sharp(buf).extract({ left: w - 1, top: 0, width: 1, height: 1 }).raw().toBuffer();
  const bl = await sharp(buf).extract({ left: 0, top: h - 1, width: 1, height: 1 }).raw().toBuffer();
  const br = await sharp(buf).extract({ left: w - 1, top: h - 1, width: 1, height: 1 }).raw().toBuffer();
  
  const isSimilar = (c1, c2) => {
    return Math.abs(c1[0] - c2[0]) < 15 && Math.abs(c1[1] - c2[1]) < 15 && Math.abs(c1[2] - c2[2]) < 15;
  };
  
  const allSimilar = isSimilar(tl, tr) && isSimilar(tl, bl) && isSimilar(tl, br);
  console.log('All similar?', allSimilar);
}
test().catch(console.error);
