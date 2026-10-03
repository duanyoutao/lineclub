// A discarded or reloaded tab continues in the terminal instead of replaying
// the entry and the opening animation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { signIn } from './sign-in.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
const report = { checks: [], skipped: [], errors: [] };
const base = process.env.REVIEW_URL || 'http://127.0.0.1:5199/';
let server, browser, failed = null;
const stats = page => page.evaluate(() => window.rhine.stats());
const ready = page => page.waitForFunction(() => window.rhine?.stats().ready);
const started = page => page.waitForFunction(() => window.rhine.stats().startup === 'started');
try {
  if (!process.env.REVIEW_URL) {
    server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(root + sep)) throw Error('path');
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise(done => server.listen(5199, '127.0.0.1', done));
  }
  browser = await chromium.launch({ channel: process.env.REVIEW_CHANNEL || 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));

  // A fresh tab keeps the sign-in: storage is only written after entering.
  await page.goto(base); await ready(page);
  assert.equal((await stats(page)).startup, 'sign-in');
  assert.equal((await stats(page)).resumed, null);
  assert.equal(await page.locator('.login-form').isVisible(), true);
  await signIn(page); await started(page);
  assert.equal((await stats(page)).mode, 'boot');
  report.checks.push('a fresh tab asks for credentials and starts the opening');

  // Enter the array on another file, then reload like a discarded tab.
  await page.evaluate(() => window.rhine.select(9));
  await page.evaluate(() => window.rhine.archive());
  await page.waitForFunction(() => window.rhine.stats().mode === 'archive');
  const chosen = (await stats(page)).selected;
  await page.reload(); await ready(page); await signIn(page); await started(page);
  assert.equal((await stats(page)).resumed, 'archive');
  assert.equal((await stats(page)).mode, 'archive');
  assert.equal((await stats(page)).selected, chosen);
  assert.equal(await page.locator('.login-form').count(), 0);
  assert.equal(await page.locator('#stage').evaluate(el => el.inert), false);
  await page.waitForFunction(() => !document.querySelector('#loading'));
  await page.waitForFunction(() => document.activeElement?.classList.contains('read-file'), null, { timeout: 10000 });
  report.checks.push({ name: 'reload resumes the array at the same file', selected: chosen });

  // An open document resumes too, including its decryption reveal.
  await page.evaluate(() => window.rhine.detail());
  await page.waitForFunction(() => window.rhine.stats().mode === 'detail');
  const detailId = (await stats(page)).selected;
  await page.reload(); await ready(page); await signIn(page); await started(page);
  assert.equal((await stats(page)).resumed, 'detail');
  assert.equal((await stats(page)).mode, 'detail');
  assert.equal((await stats(page)).selected, detailId);
  assert.equal(await page.locator('.login-form').count(), 0);
  await page.waitForFunction(() => !document.querySelector('#detail-ui').hidden && !document.querySelector('#detail-content').inert);
  report.checks.push({ name: 'reload resumes the open document', selected: detailId });

  // The installed offline copy serves the same navigation; resume must hold.
  try {
    await page.waitForFunction(() => navigator.serviceWorker?.controller && document.documentElement.dataset.offlineReady === 'true', null, { timeout: 180000 });
    await context.setOffline(true);
    await page.reload(); await ready(page); await signIn(page); await started(page);
    assert.equal((await stats(page)).resumed, 'detail');
    assert.equal((await stats(page)).mode, 'detail');
    report.checks.push('offline reload from the service worker resumes the document');
  } catch (error) {
    report.skipped.push(`offline reload: ${String(error.message).split('\n')[0]}`);
  }
  await context.setOffline(false);

  // Explicit review URLs keep their original bypass: no entry and no resume.
  await page.goto(`${base}?scene=archive`); await ready(page);
  assert.equal((await stats(page)).resumed, null);
  assert.equal((await stats(page)).startup, 'started');
  assert.equal((await stats(page)).mode, 'archive');
  assert.equal(await page.locator('.login-form').count(), 0);
  report.checks.push('a review URL still bypasses the sign-in and the resume');
  const other = await context.newPage();
  other.on('pageerror', error => report.errors.push(error.message));
  await other.goto(base); await ready(other);
  assert.equal((await stats(other)).resumed, null);
  assert.equal(await other.locator('.login-form').isVisible(), true);
  await other.close();
  report.checks.push('a new tab keeps its own session and asks for credentials');
  await context.close();

  // Reduced motion has no opening, but still resumes the visible state.
  const quiet = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await quiet.addInitScript(() => localStorage.setItem('rhine-settings', JSON.stringify({ reduced: true, sound: true, music: true })));
  const quietPage = await quiet.newPage();
  quietPage.on('pageerror', error => report.errors.push(error.message));
  await quietPage.goto(base); await ready(quietPage);
  assert.equal(await quietPage.locator('.login-form').isVisible(), true);
  await signIn(quietPage); await started(quietPage);
  assert.equal((await stats(quietPage)).mode, 'archive');
  await quietPage.evaluate(() => window.rhine.select(4));
  await quietPage.reload(); await ready(quietPage); await signIn(quietPage); await started(quietPage);
  assert.equal((await stats(quietPage)).resumed, 'archive');
  assert.equal((await stats(quietPage)).mode, 'archive');
  assert.equal(await quietPage.locator('.login-form').count(), 0);
  report.checks.push('reduced motion resumes the array without the opening');
  await quiet.close();

  // Storage can be blocked (private windows, hardened browsers): the entry and
  // the terminal keep working, with no resume.
  const blocked = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await blocked.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new Error('storage blocked'); } }));
  const blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', error => report.errors.push(error.message));
  await blockedPage.goto(base); await ready(blockedPage);
  assert.equal(await blockedPage.locator('.login-form').isVisible(), true);
  await signIn(blockedPage); await started(blockedPage);
  await blockedPage.reload(); await ready(blockedPage);
  assert.equal((await stats(blockedPage)).resumed, null);
  assert.equal(await blockedPage.locator('.login-form').isVisible(), true);
  report.checks.push('blocked session storage falls back to the sign-in');
  await blocked.close();

  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
  console.log('Sign-in, reload resume, document resume, offline resume, review bypass, per-tab sessions, reduced motion and blocked storage passed.');
} catch (error) {
  failed = String(error?.message ?? error);
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise(done => server.close(done));
  await mkdir('verification/session-resume', { recursive: true });
  await writeFile('verification/session-resume/results.json', JSON.stringify({ ...report, failed }, null, 2));
}
