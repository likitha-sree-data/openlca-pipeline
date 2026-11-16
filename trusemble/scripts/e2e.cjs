// Browser end-to-end check. Needs Playwright (require('playwright')) and a running, seeded app.
// Usage: BASE=http://localhost:3000 SHOTS=./shots node scripts/e2e.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || null;
const PASSWORD = process.env.SEED_PASSWORD || 'trusemble-dev';
let failures = 0;
const RUN = Date.now().toString(36); // keeps the script re-runnable against the same database
const pass = (m) => console.log('ok   ' + m);
const fail = (m) => { failures++; console.log('FAIL ' + m); };
const check = (cond, m) => (cond ? pass(m) : fail(m));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/tiles\.openfreemap|Failed to load resource|net::ERR|AJAXError|Failed to fetch/i.test(t)) return; // base map tiles are external
    errors.push('console: ' + t);
  });
  const shot = async (name, full = true) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full }); } };
  const go = async (p) => { const r = await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(400); return r; };

  // ---------- public
  await go('/');
  check(await page.locator('h1').innerText() === 'See where wildfire money goes, and where it does not', 'home hero');
  check(await page.getByTestId('public-map').count() === 1, 'home map block renders');
  await page.waitForTimeout(800);
  await shot('home');

  await go('/projects');
  await page.getByPlaceholder('Search projects').fill('Tetherow');
  await page.waitForTimeout(900);
  check((await page.locator('.list-item').count()) >= 1, 'project search finds Tetherow');
  await shot('projects', false);
  await page.locator('.list-item').first().click();
  await page.waitForURL(/\/projects\/\d+/);
  check((await page.locator('h1').innerText()).includes('Tetherow'), 'project page opens');
  check(await page.getByText('Programs to look at').count() === 1, 'project page lists programs');
  await shot('project');

  // map layers draw on a blank basemap (no tile network needed)
  await go('/projects?basemap=blank&layers=projects,gap');
  await page.waitForTimeout(2500);
  const mapH = await page.locator('canvas.maplibregl-canvas').first().evaluate((c) => c.getBoundingClientRect().height);
  check(mapH > 300, `project map has a real size (${Math.round(mapH)}px)`);
  const png = (await page.locator('.map-wrap').first().screenshot()).toString('base64');
  const painted = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i + 1] - d[i] > 25 && d[i + 1] > 80) n++; // the grid is green; the basemap and legend are not
    return n;
  }, png);
  check(painted > 20, `map draws grid squares (${painted} non-background samples)`);

  await go('/funding');
  check((await page.locator('.program').count()) >= 20, 'funding lists programs');
  check(await page.getByRole('heading', { name: /Open now/ }).count() === 1, 'funding has Open now section');
  await shot('funding', false);

  await go('/calculator');
  check((await page.locator('.estimate .big').innerText()).startsWith('$'), 'calculator shows an estimate');
  const before = await page.locator('.estimate .big').innerText();
  await page.locator('#homes-n').fill('600');
  await page.waitForTimeout(150);
  check((await page.locator('.estimate .big').innerText()) !== before, 'calculator reacts to input');
  await page.locator('#homes-n').fill('300');
  await shot('calculator');

  await go('/data');
  check(await page.getByText('Headline counts').count() === 1, 'data headline counts');
  await page.waitForTimeout(600);
  await shot('data', false);

  // contact form
  await go('/contact');
  await page.waitForTimeout(2800); // forms reject instant submits
  await page.locator('#message').fill('Please send the monthly brief for Oregon.');
  await page.locator('#name').fill('Test Person');
  await page.locator('#email').fill('test.person@example.org');
  await page.locator('input[name=consent]').check();
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByText(/was received/).waitFor({ timeout: 8000 });
  check(true, 'contact form submits and shows a reference');

  // wizard
  await go('/request-funding?amount=75000&homes=300');
  await page.waitForTimeout(2800);
  await page.locator('#projectName').fill('Cedar Flats fuels break');
  await page.locator('#description').fill('Thin forty acres of ponderosa around the community and clear the access road.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#state').selectOption('OR');
  await page.locator('#county').fill('Deschutes');
  await page.getByRole('button', { name: 'Continue' }).click();
  check(await page.locator('#amount').inputValue() === '75000', 'wizard prefilled from the calculator');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#name').fill('Wizard Tester');
  await page.locator('#email').fill('wizard@example.org');
  await page.locator('#org').fill('Cedar Flats HOA');
  await page.locator('input[name=consent]').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  check(await page.getByText('Cedar Flats fuels break').count() >= 1, 'wizard review step shows the answers');
  await shot('wizard', false);
  await page.getByRole('button', { name: 'Send request' }).click();
  await page.getByText(/funding request was received/i).waitFor({ timeout: 8000 });
  check(true, 'wizard submits');

  // honeypot silently succeeds but stores nothing
  // ---------- ops
  await go('/ops/requests');
  check(page.url().includes('/ops/login'), 'ops redirects to login when signed out');
  await page.locator('#email').fill('adam@example.org');
  await page.locator('#password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/do not match/).waitFor({ timeout: 5000 });
  check(true, 'bad password is rejected');
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/ops\/requests/);
  check(true, 'login returns to the requested page');

  const body = async () => (await page.locator('body').innerText());
  check((await body()).includes('Wizard Tester') || (await body()).includes('Cedar Flats HOA'), 'public submissions arrive in the requests inbox');
  await shot('ops-requests', false);

  await go('/ops');
  check((await body()).includes('Needs you now') && (await body()).includes('Hello, Adam'), 'Today page greets and lists what needs a person');
  check((await page.locator('.rail a.ico').count()) === 5, 'team tool has five places');
  await shot('ops-overview');
  for (const [p, marker] of [['/ops/pilot', 'Pilot scorecard'], ['/ops/projects', 'Every mitigation project'], ['/ops/matches', 'Suggested pairings'], ['/ops/organizations', 'Firewise sites'], ['/ops/contacts', 'People at partner organizations'], ['/ops/funding', 'Programs that pay'], ['/ops/map', 'Hollow markers'], ['/ops/sources', 'Every source'], ['/ops/imports', 'Bring in a spreadsheet'], ['/ops/data-quality', 'Things only a person can sort out'], ['/ops/check', 'Check the data'], ['/ops/settings', 'Alerts'], ['/ops/calculator', 'Funding calculator'], ['/ops/requests?view=board', 'Requests'], ['/ops/projects?view=board', 'Projects'], ['/ops/requests?needs=schedule', 'Giving each open request']]) {
    const r = await go(p);
    check(r.status() === 200 && (await body()).includes(marker), `ops ${p}`);
  }
  // check the data: one record, side by side with its source
  await go('/ops/check');
  const waiting = async () => Number(((await body()).match(/([\d,]+) waiting/) || [])[1].replace(/,/g, ''));
  const w0 = await waiting();
  check(w0 > 0 && (await body()).includes('Where it came from'), 'check screen shows a record next to its source');
  await shot('ops-check', false);
  await page.getByRole('button', { name: 'It matches the source' }).click();
  await page.waitForTimeout(900);
  check((await waiting()) === w0 - 1, 'checking a record shrinks the queue');
  await go('/ops/settings');
  await page.getByRole('button', { name: 'Send a test alert' }).click();
  await page.getByText(/No alerts are set up yet/).waitFor({ timeout: 5000 });
  check(true, 'alerts page explains what is missing');
  await go('/ops'); await shot('ops-today');
  await go('/ops/pilot'); await shot('ops-pilot');
  await go('/ops/funding'); await shot('ops-funding', false);
  await go('/ops/matches'); await shot('ops-matches', false);

  // create a record, edit it, verify it
  await go('/ops/organizations/new');
  await page.locator('#name').fill(`E2E Test Fire District ${RUN}`);
  await page.locator('#type').selectOption('fire_district');
  await page.getByRole('button', { name: /Create organization/ }).click();
  await page.waitForURL(/\/ops\/organizations\/\d+/);
  check((await body()).includes('Created.'), 'organization created');
  await page.locator('#website').fill('not-a-url');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText(/must start with http/).waitFor({ timeout: 5000 });
  check(true, 'inline validation shows on save');
  await page.locator('#website').fill('https://e2e.example.org');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Saved.').waitFor({ timeout: 5000 });
  check(true, 'organization saved');
  await page.getByRole('button', { name: 'Mark as checked' }).click();
  await page.getByText(/Checked against its source/).first().waitFor({ timeout: 5000 });
  check(true, 'organization verified');

  // import flow
  const csv = `Organization,Type,Website,County,State\nE2E Import Alpha ${RUN},Nonprofit,alpha.example.org,Deschutes,OR\nE2E Import Beta ${RUN},Fire District,,Crook,OR\n`;
  const tmp = path.join(require('node:os').tmpdir(), 'e2e-orgs.csv');
  fs.writeFileSync(tmp, csv);
  await go('/ops/imports');
  await page.setInputFiles('#file', tmp);
  await page.getByRole('button', { name: 'Upload and map columns' }).click();
  await page.waitForURL(/\/ops\/imports\/\d+/);
  check((await body()).includes('Match columns'), 'upload reaches the mapping step');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.waitForURL(/step=review/);
  check((await body()).includes('2') && (await body()).includes('Apply import'), 'review step shows the plan');
  await shot('ops-import-review', false);
  await page.getByRole('button', { name: 'Apply import' }).click();
  await page.waitForURL(/\/ops\/imports\/\d+$/);
  check((await body()).includes('This import was applied'), 'import applied');
  // second run is a no-op
  await go('/ops/imports'); await page.setInputFiles('#file', tmp);
  await page.getByRole('button', { name: 'Upload and map columns' }).click(); await page.waitForURL(/\/ops\/imports\/\d+/);
  await page.getByRole('button', { name: 'Review changes' }).click(); await page.waitForURL(/step=review/);
  check(await page.getByRole('button', { name: 'Apply import' }).isDisabled(), 're-importing the same file changes nothing');
  await page.getByRole('button', { name: 'Discard' }).click();

  // pilot accept as Likitha
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/ops\/login/);
  await page.locator('#email').fill('likitha@example.org'); await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForURL(/\/ops$/);
  await go('/ops/pilot');
  if (await page.getByRole('button', { name: 'Accept' }).count()) { await page.getByRole('button', { name: 'Accept' }).click(); await page.waitForTimeout(600); } // already accepted on a re-run
  check((await body()).includes('Accepted'), 'a person can accept their own pilot lane');

  // mobile
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await m.newPage();
  await mp.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await mp.waitForTimeout(600);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `no horizontal scroll on a phone (overflow ${overflow}px)`);
  if (SHOTS) await mp.screenshot({ path: path.join(SHOTS, 'home-mobile.png') });
  await mp.goto(BASE + '/calculator', { waitUntil: 'domcontentloaded' }); await mp.waitForTimeout(400);
  check((await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'calculator fits a phone');

  check(errors.length === 0, `no unexpected browser errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
  await browser.close();
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
