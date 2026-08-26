const sharp = require('sharp');
async function test() {
  const svg = `
    <svg width="200" height="200">
      <rect width="200" height="200" fill="white" />
      <rect x="50" y="50" width="100" height="100" fill="red" />
    </svg>
  `;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  
  const img2 = sharp(buf).trim({ threshold: 10 });
  
  // Wait, sharp returns a new object, but metadata() on that object might not reflect trim unless we toBuffer() first.
  const buf2 = await img2.toBuffer();
  const meta2 = await sharp(buf2).metadata();
  console.log('White BG -> Trimmed to:', meta2.width, 'x', meta2.height);

  const svg2 = `
    <svg width="200" height="200">
      <rect x="0" y="0" width="200" height="40" fill="red" />
      <rect x="0" y="40" width="200" height="160" fill="blue" />
    </svg>
  `;
  const buf3 = await sharp(Buffer.from(svg2)).png().toBuffer();
  const buf4 = await sharp(buf3).trim({ threshold: 10 }).toBuffer();
  const meta4 = await sharp(buf4).metadata();
  console.log('Red/Blue (already tight) -> Trimmed to:', meta4.width, 'x', meta4.height);
}
test().catch(console.error);
