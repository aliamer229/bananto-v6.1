const sharp = require('sharp');
async function test() {
  const svg = `
    <svg width="200" height="200">
      <rect width="200" height="200" fill="white" />
      <rect x="50" y="50" width="100" height="100" fill="red" />
    </svg>
  `;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  
  // Try chaining
  let img = sharp(buf);
  try {
    img = img.trim({ background: '#ffffff', threshold: 10 });
    img = img.trim({ background: '#00000000', threshold: 10 }); // transparent
    const buf2 = await img.toBuffer();
    const meta2 = await sharp(buf2).metadata();
    console.log('Chained trim success:', meta2.width, 'x', meta2.height);
  } catch (e) {
    console.error('Chained trim error:', e.message);
  }
}
test().catch(console.error);
