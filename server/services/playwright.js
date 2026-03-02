import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DATA_DIR = path.join(__dirname, '..', '..', 'playwright-data');
const COOKIES_DIR = path.join(BASE_DATA_DIR, 'cookies');

// Ensure directories exist
if (!fs.existsSync(COOKIES_DIR)) fs.mkdirSync(COOKIES_DIR, { recursive: true });

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const ANTI_DETECT_ARGS = ['--disable-blink-features=AutomationControlled', '--no-sandbox'];

// ─── Browser helpers ──────────────────────────────────────────────────

/**
 * Create a browser context with anti-detection measures.
 */
async function createStealthContext(browser, opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 800 },
    userAgent: opts.userAgent || DESKTOP_UA,
    ...(opts.isMobile ? { isMobile: true, hasTouch: true } : {}),
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  return context;
}

// ─── Cookie helpers (platform-aware) ──────────────────────────────────

function getCookiePath(userId, platform) {
  return path.join(COOKIES_DIR, `${userId}-${platform}.json`);
}

function getLegacyCookiePath(userId) {
  return path.join(COOKIES_DIR, `${userId}.json`);
}

function saveCookies(userId, platform, cookies) {
  fs.writeFileSync(getCookiePath(userId, platform), JSON.stringify(cookies, null, 2));
  console.log(`[PLAYWRIGHT] Saved ${cookies.length} cookies for user ${userId} (${platform})`);
}

function loadCookies(userId, platform) {
  const p = getCookiePath(userId, platform);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
  }
  // Backward compatibility: try legacy path for linkedin
  if (platform === 'linkedin') {
    const legacy = getLegacyCookiePath(userId);
    if (fs.existsSync(legacy)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(legacy, 'utf8'));
        saveCookies(userId, 'linkedin', cookies);
        fs.unlinkSync(legacy);
        console.log(`[PLAYWRIGHT] Migrated legacy cookies for user ${userId} to linkedin format`);
        return cookies;
      } catch { return null; }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// LINKEDIN
// ═══════════════════════════════════════════════════════════════════════

// ─── LinkedIn LOGIN (visible browser) ─────────────────────────────────
export async function loginToLinkedInWithCredentials(email, password, userId = 'test') {
  console.log(`[PLAYWRIGHT] Opening visible browser for LinkedIn login (user ${userId})...`);

  const browser = await chromium.launch({ headless: false, args: ANTI_DETECT_ARGS });
  const context = await createStealthContext(browser);
  const page = await context.newPage();

  try {
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    if (page.url().includes('/feed')) {
      const cookies = await context.cookies();
      saveCookies(userId, 'linkedin', cookies);
      await browser.close();
      return { success: true, message: 'Already logged in! Session saved.' };
    }

    if (!email || !password) {
      await browser.close();
      return { success: false, message: 'Credentials not provided' };
    }

    await page.fill('#username', email);
    await page.fill('#password', password);
    await page.click('[data-litms-control-urn="login-submit"]');

    console.log(`[PLAYWRIGHT] Credentials submitted, waiting for feed (up to 90s for verification)...`);

    try {
      await page.waitForURL('**/feed/**', { timeout: 90000 });
    } catch {
      const url = page.url();
      if (!url.includes('/feed') && !url.includes('/mynetwork')) {
        console.log(`[PLAYWRIGHT] Did not reach feed. URL: ${url}`);
        await browser.close();
        return { success: false, message: 'Login timed out. Please complete any LinkedIn verification in the browser window that opened, then try again.' };
      }
    }

    const cookies = await context.cookies();
    saveCookies(userId, 'linkedin', cookies);
    console.log(`[PLAYWRIGHT] LinkedIn login successful for ${userId}!`);
    await browser.close();
    return { success: true, message: 'Logged in! Session saved for scheduled posts.' };
  } catch (err) {
    console.error(`[PLAYWRIGHT] LinkedIn login error:`, err.message);
    try { await browser.close(); } catch {}
    return { success: false, message: `Login failed: ${err.message}` };
  }
}

// ─── LinkedIn POST (visible browser with anti-detection) ──────────────
// LinkedIn blocks headless compose dialogs, so we use visible browser.
export async function createLinkedInPost(text, imagePath = null, userId = 'default') {
  const cookies = loadCookies(userId, 'linkedin');
  if (!cookies || cookies.length === 0) {
    return { success: false, message: 'No saved LinkedIn session. User needs to Test Login in Settings first.' };
  }

  console.log(`[PLAYWRIGHT] Posting to LinkedIn for user ${userId}...`);

  const browser = await chromium.launch({ headless: false, args: ANTI_DETECT_ARGS });
  const context = await createStealthContext(browser);
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for page to be fully interactive (network idle + extra settle time)
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch { /* ok */ }
    await page.waitForTimeout(3000);

    if (page.url().includes('/login') || page.url().includes('/authwall')) {
      console.log(`[PLAYWRIGHT] LinkedIn session expired for user ${userId}`);
      await browser.close();
      return { success: false, message: 'Session expired. User needs to Test Login again in Settings.' };
    }

    // Click "Start a post" with retry — LinkedIn sometimes ignores the first click
    const MAX_CLICK_ATTEMPTS = 3;
    let textbox = null;

    for (let attempt = 1; attempt <= MAX_CLICK_ATTEMPTS; attempt++) {
      console.log(`[PLAYWRIGHT] Clicking "Start a post" (attempt ${attempt}/${MAX_CLICK_ATTEMPTS})...`);

      // Use $$() iteration to find the exact button by text content
      const startPostBtns = await page.$$('div[role="button"]');
      let clicked = false;
      for (const btn of startPostBtns) {
        const btnText = await btn.textContent();
        if (btnText && btnText.includes('Start a post')) {
          await btn.click({ force: true });
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        console.log(`[PLAYWRIGHT] Could not find "Start a post" button on attempt ${attempt}`);
        if (attempt === MAX_CLICK_ATTEMPTS) break;
        await page.waitForTimeout(2000);
        continue;
      }

      // Wait for the textbox to appear (do NOT scope to dialog — LinkedIn's overlay structure varies)
      try {
        textbox = await page.waitForSelector('[role="textbox"]', { timeout: 15000 });
        console.log(`[PLAYWRIGHT] Compose textbox ready on attempt ${attempt}`);
        break;
      } catch {
        console.log(`[PLAYWRIGHT] Textbox did not appear on attempt ${attempt}, retrying...`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(2000);
      }
    }

    if (!textbox) {
      await browser.close();
      return { success: false, message: 'Compose dialog did not open after multiple attempts.' };
    }

    await textbox.click();
    await page.keyboard.type(text, { delay: 10 });

    // Upload image if provided
    if (imagePath) {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(imagePath);
        await page.waitForTimeout(3000);
      }
    }

    await page.waitForTimeout(1000);

    // Click the Post button (use getByRole for exact match)
    const postBtn = page.getByRole('button', { name: 'Post', exact: true });
    await postBtn.click({ timeout: 10000 });
    await page.waitForTimeout(5000);

    // Try to get the post URL
    const postUrl = await page.evaluate(() => {
      const posts = document.querySelectorAll('a[href*="/feed/update/"]');
      return posts.length > 0 ? posts[0].href : null;
    });

    const freshCookies = await context.cookies();
    saveCookies(userId, 'linkedin', freshCookies);

    await browser.close();
    return { success: true, postUrl, message: 'Post published successfully' };
  } catch (err) {
    console.error(`[PLAYWRIGHT] LinkedIn post error:`, err.message);
    try { await browser.close(); } catch {}
    return { success: false, message: `Failed to post: ${err.message}` };
  }
}

// ─── LinkedIn headless session check ──────────────────────────────────
export async function headlessLinkedInLogin(userId) {
  const cookies = loadCookies(userId, 'linkedin');
  if (!cookies || cookies.length === 0) {
    return { success: false, message: 'No saved session' };
  }

  const browser = await chromium.launch({ headless: true, args: ANTI_DETECT_ARGS });
  const context = await createStealthContext(browser);
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    if (page.url().includes('/login') || page.url().includes('/authwall')) {
      await browser.close();
      return { success: false, message: 'Session expired' };
    }

    const freshCookies = await context.cookies();
    saveCookies(userId, 'linkedin', freshCookies);

    await browser.close();
    return { success: true, message: 'Session valid' };
  } catch (err) {
    try { await browser.close(); } catch {}
    return { success: false, message: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TWITTER / X
// ═══════════════════════════════════════════════════════════════════════

// ─── Twitter LOGIN (visible browser) ──────────────────────────────────
export async function loginToTwitterWithCredentials(email, password, userId = 'test') {
  console.log(`[PLAYWRIGHT] Opening visible browser for Twitter login (user ${userId})...`);

  const browser = await chromium.launch({ headless: false, args: ANTI_DETECT_ARGS });
  const context = await createStealthContext(browser);
  const page = await context.newPage();

  try {
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('/home')) {
      const cookies = await context.cookies();
      saveCookies(userId, 'twitter', cookies);
      await browser.close();
      return { success: true, message: 'Already logged in! Session saved.' };
    }

    if (!email || !password) {
      await browser.close();
      return { success: false, message: 'Credentials not provided' };
    }

    await page.waitForSelector('input[autocomplete="username"]', { timeout: 15000 });
    await page.fill('input[autocomplete="username"]', email);
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(2000);

    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    await page.fill('input[type="password"]', password);
    await page.click('button[data-testid="LoginForm_Login_Button"]');

    console.log(`[PLAYWRIGHT] Twitter credentials submitted, waiting for home (up to 90s for verification)...`);

    try {
      await page.waitForURL('**/home**', { timeout: 90000 });
    } catch {
      const url = page.url();
      if (!url.includes('/home')) {
        console.log(`[PLAYWRIGHT] Did not reach Twitter home. URL: ${url}`);
        await browser.close();
        return { success: false, message: 'Login timed out. Please complete any verification in the browser window.' };
      }
    }

    const cookies = await context.cookies();
    saveCookies(userId, 'twitter', cookies);
    console.log(`[PLAYWRIGHT] Twitter login successful for ${userId}!`);
    await browser.close();
    return { success: true, message: 'Logged in to Twitter! Session saved.' };
  } catch (err) {
    console.error(`[PLAYWRIGHT] Twitter login error:`, err.message);
    try { await browser.close(); } catch {}
    return { success: false, message: `Login failed: ${err.message}` };
  }
}

// ─── Twitter POST (visible browser with anti-detection) ───────────────
export async function createTwitterPost(text, imagePath = null, userId = 'default') {
  const cookies = loadCookies(userId, 'twitter');
  if (!cookies || cookies.length === 0) {
    return { success: false, message: 'No saved Twitter session. User needs to Test Login first.' };
  }

  console.log(`[PLAYWRIGHT] Posting to Twitter for user ${userId}...`);

  const browser = await chromium.launch({ headless: false, args: ANTI_DETECT_ARGS });
  const context = await createStealthContext(browser);
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('/login') || page.url().includes('/i/flow/login')) {
      await browser.close();
      return { success: false, message: 'Twitter session expired. User needs to Test Login again.' };
    }

    await page.waitForSelector('div[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    await page.click('div[data-testid="tweetTextarea_0"]');
    await page.keyboard.type(text, { delay: 10 });

    if (imagePath) {
      const fileInput = await page.$('input[data-testid="fileInput"]');
      if (fileInput) {
        await fileInput.setInputFiles(imagePath);
        await page.waitForTimeout(3000);
      }
    }

    await page.click('button[data-testid="tweetButton"]');
    await page.waitForTimeout(5000);

    const freshCookies = await context.cookies();
    saveCookies(userId, 'twitter', freshCookies);

    await browser.close();
    return { success: true, postUrl: null, message: 'Tweet published successfully' };
  } catch (err) {
    console.error(`[PLAYWRIGHT] Twitter post error:`, err.message);
    try { await browser.close(); } catch {}
    return { success: false, message: `Failed to tweet: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FACEBOOK
// ═══════════════════════════════════════════════════════════════════════

// ─── Facebook LOGIN (visible browser) ─────────────────────────────────
export async function loginToFacebookWithCredentials(email, password, userId = 'test') {
  console.log(`[PLAYWRIGHT] Opening visible browser for Facebook login (user ${userId})...`);

  const browser = await chromium.launch({ headless: false, args: ANTI_DETECT_ARGS });
  const context = await createStealthContext(browser);
  const page = await context.newPage();

  try {
    await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    if (page.url() === 'https://www.facebook.com/' || page.url().includes('facebook.com/?')) {
      const cookies = await context.cookies();
      saveCookies(userId, 'facebook', cookies);
      await browser.close();
      return { success: true, message: 'Already logged in! Session saved.' };
    }

    if (!email || !password) {
      await browser.close();
      return { success: false, message: 'Credentials not provided' };
    }

    await page.fill('#email', email);
    await page.fill('#pass', password);
    await page.click('button[name="login"]');

    console.log(`[PLAYWRIGHT] Facebook credentials submitted, waiting (up to 90s for verification)...`);

    try {
      await page.waitForURL('**/facebook.com/**', { timeout: 90000 });
      await page.waitForTimeout(3000);
    } catch {
      // continue — check URL below
    }

    const url = page.url();
    if (url.includes('/login') || url.includes('/checkpoint')) {
      await browser.close();
      return { success: false, message: 'Login requires additional verification. Please complete it in the browser window.' };
    }

    const cookies = await context.cookies();
    saveCookies(userId, 'facebook', cookies);
    console.log(`[PLAYWRIGHT] Facebook login successful for ${userId}!`);
    await browser.close();
    return { success: true, message: 'Logged in to Facebook! Session saved.' };
  } catch (err) {
    console.error(`[PLAYWRIGHT] Facebook login error:`, err.message);
    try { await browser.close(); } catch {}
    return { success: false, message: `Login failed: ${err.message}` };
  }
}

// ─── Facebook POST (visible browser with anti-detection) ──────────────
export async function createFacebookPost(text, imagePath = null, userId = 'default') {
  const cookies = loadCookies(userId, 'facebook');
  if (!cookies || cookies.length === 0) {
    return { success: false, message: 'No saved Facebook session. User needs to Test Login first.' };
  }

  console.log(`[PLAYWRIGHT] Posting to Facebook for user ${userId}...`);

  const browser = await chromium.launch({ headless: false, args: ANTI_DETECT_ARGS });
  const context = await createStealthContext(browser);
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('/login')) {
      await browser.close();
      return { success: false, message: 'Facebook session expired. User needs to Test Login again.' };
    }

    // Click "What's on your mind?" to open the post composer
    await page.click('div[role="button"]:has-text("What\'s on your mind")');
    await page.waitForTimeout(2000);

    // Type in the post dialog
    await page.waitForSelector('div[role="dialog"] div[contenteditable="true"]', { timeout: 10000 });
    await page.click('div[role="dialog"] div[contenteditable="true"]');
    await page.keyboard.type(text, { delay: 10 });

    if (imagePath) {
      const photoButton = await page.$('div[role="dialog"] div[aria-label="Photo/video"]');
      if (photoButton) {
        await photoButton.click();
        await page.waitForTimeout(1000);
      }
      const fileInput = await page.$('div[role="dialog"] input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(imagePath);
        await page.waitForTimeout(3000);
      }
    }

    // Click Post button
    await page.click('div[role="dialog"] div[aria-label="Post"][role="button"]');
    await page.waitForTimeout(5000);

    const freshCookies = await context.cookies();
    saveCookies(userId, 'facebook', freshCookies);

    await browser.close();
    return { success: true, postUrl: null, message: 'Facebook post published successfully' };
  } catch (err) {
    console.error(`[PLAYWRIGHT] Facebook post error:`, err.message);
    try { await browser.close(); } catch {}
    return { success: false, message: `Failed to post to Facebook: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// INSTAGRAM
// ═══════════════════════════════════════════════════════════════════════

// ─── Instagram LOGIN (visible browser, mobile UA) ─────────────────────
export async function loginToInstagramWithCredentials(email, password, userId = 'test') {
  console.log(`[PLAYWRIGHT] Opening visible browser for Instagram login (user ${userId})...`);

  const browser = await chromium.launch({ headless: false, args: ANTI_DETECT_ARGS });
  const context = await createStealthContext(browser, {
    viewport: { width: 375, height: 812 },
    userAgent: MOBILE_UA,
    isMobile: true,
  });
  const page = await context.newPage();

  try {
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Dismiss cookie banner if present
    try {
      const cookieBtn = await page.$('button:has-text("Allow all cookies"), button:has-text("Accept"), button:has-text("Allow essential and optional cookies")');
      if (cookieBtn) await cookieBtn.click();
      await page.waitForTimeout(1000);
    } catch { /* no banner */ }

    if (!page.url().includes('/accounts/login')) {
      const cookies = await context.cookies();
      saveCookies(userId, 'instagram', cookies);
      await browser.close();
      return { success: true, message: 'Already logged in! Session saved.' };
    }

    if (!email || !password) {
      await browser.close();
      return { success: false, message: 'Credentials not provided' };
    }

    await page.fill('input[name="username"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    console.log(`[PLAYWRIGHT] Instagram credentials submitted, waiting (up to 90s)...`);

    try {
      await page.waitForURL('**/instagram.com/**', { timeout: 90000 });
      await page.waitForTimeout(3000);
    } catch { /* continue */ }

    if (page.url().includes('/accounts/login') || page.url().includes('/challenge')) {
      await browser.close();
      return { success: false, message: 'Login requires verification. Complete it in the browser window.' };
    }

    // Dismiss "Save login info?" or "Turn on notifications?" dialogs
    try {
      const notNow = await page.$('button:has-text("Not Now")');
      if (notNow) await notNow.click();
      await page.waitForTimeout(1000);
      const notNow2 = await page.$('button:has-text("Not Now")');
      if (notNow2) await notNow2.click();
    } catch { /* no dialogs */ }

    const cookies = await context.cookies();
    saveCookies(userId, 'instagram', cookies);
    console.log(`[PLAYWRIGHT] Instagram login successful for ${userId}!`);
    await browser.close();
    return { success: true, message: 'Logged in to Instagram! Session saved.' };
  } catch (err) {
    console.error(`[PLAYWRIGHT] Instagram login error:`, err.message);
    try { await browser.close(); } catch {}
    return { success: false, message: `Login failed: ${err.message}` };
  }
}

// ─── Instagram POST (visible browser, mobile UA) ──────────────────────
// NOTE: Instagram requires an image to create a post.
export async function createInstagramPost(text, imagePath = null, userId = 'default') {
  if (!imagePath) {
    return { success: false, message: 'Instagram requires an image to create a post.' };
  }

  const cookies = loadCookies(userId, 'instagram');
  if (!cookies || cookies.length === 0) {
    return { success: false, message: 'No saved Instagram session. User needs to Test Login first.' };
  }

  console.log(`[PLAYWRIGHT] Posting to Instagram for user ${userId}...`);

  const browser = await chromium.launch({ headless: false, args: ANTI_DETECT_ARGS });
  const context = await createStealthContext(browser, {
    viewport: { width: 375, height: 812 },
    userAgent: MOBILE_UA,
    isMobile: true,
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('/accounts/login')) {
      await browser.close();
      return { success: false, message: 'Instagram session expired. User needs to Test Login again.' };
    }

    // Click the "+" create post button
    const createBtn = await page.$('svg[aria-label="New post"]') || await page.$('a[href="/create/style/"]');
    if (createBtn) {
      await createBtn.click();
    } else {
      await page.click('[role="menuitem"] svg[aria-label="New post"], nav a[href="/create/style/"]');
    }
    await page.waitForTimeout(2000);

    // Upload image
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(imagePath);
      await page.waitForTimeout(3000);
    }

    // Click Next (through crop/filter steps)
    try {
      const nextBtn = await page.$('button:has-text("Next")');
      if (nextBtn) { await nextBtn.click(); await page.waitForTimeout(2000); }
      const nextBtn2 = await page.$('button:has-text("Next")');
      if (nextBtn2) { await nextBtn2.click(); await page.waitForTimeout(2000); }
    } catch { /* may already be on caption step */ }

    // Add caption
    const captionField = await page.$('textarea[aria-label="Write a caption..."]');
    if (captionField) {
      await captionField.fill(text);
    }

    // Click Share
    await page.click('button:has-text("Share")');
    await page.waitForTimeout(5000);

    const freshCookies = await context.cookies();
    saveCookies(userId, 'instagram', freshCookies);

    await browser.close();
    return { success: true, postUrl: null, message: 'Instagram post published successfully' };
  } catch (err) {
    console.error(`[PLAYWRIGHT] Instagram post error:`, err.message);
    try { await browser.close(); } catch {}
    return { success: false, message: `Failed to post to Instagram: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LEGACY
// ═══════════════════════════════════════════════════════════════════════

export async function loginToLinkedIn() {
  return { success: false, message: 'Use loginToLinkedInWithCredentials instead' };
}

export async function closeBrowser() {
  // No-op — we close browsers after each operation now
}
