const sharp = require('sharp');
async function test() {
  const svg = `
    <svg width="200" height="200">
      <!-- white banner -->
      <rect x="0" y="0" width="200" height="30" fill="white" />
      <text x="10" y="20" fill="black">PS5</text>
      <!-- artwork -->
      <rect x="0" y="30" width="200" height="170" fill="blue" />
    </svg>
  `;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  
  const { data, info } = await sharp(buf).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
  console.log('Trim info:', info);
}
test().catch(console.error);
