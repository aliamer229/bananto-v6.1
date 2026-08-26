const sharp = require('sharp');
async function test() {
  const svg = `
    <svg width="200" height="200">
      <rect width="200" height="200" fill="white" />
      <rect x="50" y="0" width="100" height="200" fill="red" />
    </svg>
  `;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  
  const w = 200, h = 200;
  const tl = await sharp(buf).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  const tr = await sharp(buf).extract({ left: w - 1, top: 0, width: 1, height: 1 }).raw().toBuffer();
  const bl = await sharp(buf).extract({ left: 0, top: h - 1, width: 1, height: 1 }).raw().toBuffer();
  const br = await sharp(buf).extract({ left: w - 1, top: h - 1, width: 1, height: 1 }).raw().toBuffer();
  
  console.log(tl, tr, bl, br);
}
test().catch(console.error);
