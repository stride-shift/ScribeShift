import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';

const svg = readFileSync('C:/tmp/scribeshift-lockup.svg', 'utf-8');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function render(bg, outPath) {
  const html = `<!doctype html><html><body style="margin:0;background:${bg};display:inline-block">${svg}</body></html>`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 820, height: 228, deviceScaleFactor: 3 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const el = await page.$('svg');
  await el.screenshot({ path: outPath, omitBackground: bg === 'transparent' });
  await browser.close();
  console.log('wrote', outPath);
}

const out = 'C:/Users/User/Downloads';
await render('#ffffff', `${out}/scribeshift-logo-light.png`);
await render('#0d1117', `${out}/scribeshift-logo-dark.png`);
