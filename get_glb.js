import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('response', async response => {
    if (response.url().endsWith('.glb')) {
      console.log('Got GLB response');
      const buffer = await response.buffer();
      fs.writeFileSync('SwitchCase.glb', buffer);
      console.log('Saved SwitchCase.glb, size:', buffer.length);
      await browser.close();
      process.exit(0);
    }
  });

  await page.goto('https://assets.banan.to/Pages/Glb/SwitchCase.glb');
})();
