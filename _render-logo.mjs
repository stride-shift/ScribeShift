import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';

const svg = readFileSync('C:/tmp/scribeshift-logo.svg', 'utf-8');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function render(bg, outPath) {
  const html = `<!doctype html><html><body style="margin:0;background:${bg};display:inline-block">${svg}</body></html>`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 420, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const el = await page.$('svg');
  await el.screenshot({ path: outPath, omitBackground: bg === 'transparent' });
  await browser.close();
  console.log('wrote', outPath);
}

await render('#ffffff', 'C:/tmp/scribeshift-logo-light.png');
await render('#0b1220', 'C:/tmp/scribeshift-logo-dark.png');
await render('transparent', 'C:/tmp/scribeshift-logo-transparent.png');
