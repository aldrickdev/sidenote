// Original geometric Sidenote mark. No external or generated image assets.
// Raster provenance: public/icons/*.png are deterministic renders of this SVG.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
try {
  await mkdir('public/icons', { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>body{margin:0}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#296145"/><path d="M39 29h50v73L64 88l-25 14Z" fill="none" stroke="#ffffff" stroke-width="7" stroke-linejoin="round"/><path d="M52 58h24M64 46v24" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/></svg>`);
    await page.screenshot({ path: `public/icons/${size}.png`, omitBackground: true });
    await page.close();
  }
} finally { await browser.close(); }
