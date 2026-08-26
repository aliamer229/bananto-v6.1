const sharp = require('sharp');
async function test() {
  const img = sharp({
    create: {
      width: 100, height: 100, channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 } // red
    }
  });
  const buf = await img.png().toBuffer();
  
  const img2 = sharp(buf).trim({ threshold: 10 });
  const meta = await img2.metadata();
  console.log('Original width:', 100, 'Trimmed width:', meta.width);
}
test().catch(console.error);
