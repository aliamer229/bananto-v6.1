const sharp = require('sharp');
async function test() {
  const svg = `
    <svg width="200" height="200">
      <rect width="200" height="200" fill="white" />
      <rect x="50" y="50" width="100" height="100" fill="red" />
    </svg>
  `;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  
  const pixel = await sharp(buf).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  console.log('Pixel length:', pixel.length);
  const [r, g, b, a] = pixel;
  console.log('r, g, b, a =', r, g, b, a);
  
  const isWhite = r > 240 && g > 240 && b > 240;
  const isBlack = r < 15 && g < 15 && b < 15;
  const isTransparent = a < 15;
  
  if (isWhite || isBlack || isTransparent) {
    console.log('Margin detected, trimming...');
    const buf2 = await sharp(buf).trim({ threshold: 12 }).toBuffer();
    const meta2 = await sharp(buf2).metadata();
    console.log('Trimmed size:', meta2.width, 'x', meta2.height);
  } else {
    console.log('No margin detected, keeping as is.');
  }
}
test().catch(console.error);
