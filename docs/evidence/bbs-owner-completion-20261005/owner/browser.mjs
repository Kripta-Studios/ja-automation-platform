import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Credentials remain in an external private cookie jar, never in evidence.
const origin = process.env.OWNER_TRAINING_ORIGIN || 'http://127.0.0.1:5179';
const cookieRoot = process.env.OWNER_TRAINING_COOKIE_ROOT || '/home/kripta/bbs-manual-demo-20261005-side';
const output = import.meta.dirname;
const privateDumps = process.env.OWNER_TRAINING_PRIVATE_DUMPS || join(cookieRoot, 'owner-browser-private-dumps');
mkdirSync(join(output, 'screenshots'), { recursive: true });
mkdirSync(privateDumps, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
const page = await context.newPage();
page.setDefaultTimeout(10_000);
process.on('SIGINT', async () => { await browser.close(); process.exit(130); });
const diagnostics = { pageErrors: [], consoleErrors: [], httpErrors: [], posts: [] };
page.on('request', request => { if (request.method() === 'POST') diagnostics.posts.push(new URL(request.url()).pathname + new URL(request.url()).search); });
page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) diagnostics.httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
const trainingDb = new DatabaseSync(process.env.OWNER_TRAINING_DATABASE || join(cookieRoot, 'owner-training-runtime/training.sqlite'), { readOnly: true });
const privateNames = trainingDb.prepare("SELECT name FROM user WHERE name NOT LIKE 'BBS%' AND length(name)>4").all().map(row => row.name).sort((a,b) => b.length-a.length);
trainingDb.close();
const redact = value => {
  if (typeof value !== 'string') return value;
  let safe = value.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, ':record').replace(/[A-Za-z0-9._+-]+@j-aautomation\.com/gi, '[redacted company email]');
  for (const name of privateNames) safe = safe.split(name).join('[redacted person]');
  return safe;
};
async function user(name = 'owner') {
  const cookies = readFileSync(join(cookieRoot, `${name}.cookies`), 'utf8').split('\n')
    .filter(line => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')))
    .map(line => { const fields = line.replace(/^#HttpOnly_/, '').split('\t'); return { name: fields[5].replace('__Secure-', ''), value: fields[6], domain: new URL(origin).hostname, path: fields[2], secure: false, httpOnly: line.startsWith('#HttpOnly_') }; });
  await context.clearCookies();
  await context.addCookies(cookies);
}
await user();
console.log(JSON.stringify({ ready: true }));
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  try {
    const command = JSON.parse(line);
    if (command.exit) break;
    if (command.user) await user(command.user);
    if (command.goto) await page.goto(`${origin}/j-aautomation/app${command.goto}${command.goto.includes('?') ? '&' : '?'}lang=en`, { waitUntil: 'networkidle' });
    if (command.viewport) await page.setViewportSize(command.viewport);
    if (command.openDetails) await page.locator(command.openDetails).evaluate(element => { element.open = true; });
    if (command.fill) for (const [selector, value] of Object.entries(command.fill)) await page.locator(selector).fill(value);
    if (command.randomPassword) await page.locator(command.randomPassword).fill(`BbsLab!${randomBytes(18).toString('base64url')}`);
    if (command.select) for (const [selector, value] of Object.entries(command.select)) await page.locator(selector).selectOption(value);
    if (command.check) await page.locator(command.check).check();
    if (command.click) await page.getByRole(command.role || 'button', { name: command.click, exact: command.exact ?? true }).click();
    if (command.selectorClick) await page.locator(command.selectorClick).click();
    if (command.requestSubmit) await page.locator(command.requestSubmit).evaluate(element => element.requestSubmit());
    if (command.press) await page.keyboard.press(command.press);
    if (command.waitFor) await page.locator(command.waitFor).waitFor({ state: 'visible' });
    if (command.click || command.selectorClick) await page.waitForLoadState('networkidle');
    if (command.assert) for (const text of command.assert) if (!await page.getByText(text, { exact: false }).first().isVisible()) throw new Error(`Expected visible: ${text}`);
    if (command.absent) for (const text of command.absent) if (await page.getByText(text, { exact: false }).first().isVisible()) throw new Error(`Expected absent: ${text}`);
    if (command.download) {
      const event = page.waitForEvent('download');
      await page.locator(command.download.selector).click();
      const artifact = await event;
      if (await artifact.failure()) throw new Error('Native download failed');
      await artifact.saveAs(join(privateDumps, command.download.filename));
      console.log(JSON.stringify({ downloaded: command.download.filename, suggestedFilename: redact(artifact.suggestedFilename()) }));
    }
    if (command.shot) {
      const options = { path: join(output, 'screenshots', command.shot) };
      if (command.shotSelector) await page.locator(command.shotSelector).screenshot(options);
      else await page.screenshot({ ...options, fullPage: command.fullPage ?? false });
    }
    const text = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
    const state = { url: page.url(), text, forms: await page.locator('main form').evaluateAll(forms => forms.map(form => ({ action: form.getAttribute('action'), inputs: [...form.querySelectorAll('input,select,textarea')].filter(e => !['password','hidden'].includes(e.type)).map(e => ({ name: e.name, type: e.type, value: e.value, label: e.getAttribute('aria-label'), options: e.options ? [...e.options].map(o => ({ value: o.value, label: o.text })) : undefined })), buttons: [...form.querySelectorAll('button')].map(e => e.textContent.trim()) }))), diagnostics };
    if (command.dump) writeFileSync(join(privateDumps, command.dump), JSON.stringify(state, (_key, value) => redact(value), 2) + '\n', {mode:0o600});
    const invalid = command.validity ? await page.locator('main form').evaluateAll(forms => forms.map(form => ({ action:form.getAttribute('action'), invalid:[...form.elements].filter(element=>element.willValidate && !element.validity.valid).map(element=>({name:element.name,message:element.validationMessage})) }))) : undefined;
    console.log(JSON.stringify({ url: redact(page.url()), shot: command.shot, text: command.text ? redact(text.slice(0, command.text)) : undefined, forms: command.forms ? state.forms : undefined, invalid, diagnostics }));
  } catch (error) { console.log(JSON.stringify({ error: error.message })); }
}
await context.close();
await browser.close();
process.exit(0);
