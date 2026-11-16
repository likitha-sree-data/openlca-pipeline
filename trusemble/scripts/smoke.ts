// Hits every public route and API and checks the status and a marker string. Usage: BASE=http://localhost:3000 npm run smoke
const BASE = process.env.BASE ?? 'http://localhost:3000';
const checks: [string, number, RegExp?][] = [
  ['/', 200, /See where wildfire money goes/], ['/projects', 200, /Wildfire mitigation project map/], ['/projects/1', 200], ['/funding', 200, /Funding programs/],
  ['/calculator', 200, /defensible space/i], ['/data', 200, /Headline counts/], ['/request-funding', 200, /Request funding/], ['/submit-project', 200], ['/contact', 200],
  ['/fund', 200], ['/about', 200], ['/privacy', 200], ['/terms', 200], ['/robots.txt', 200, /Disallow: \/ops/], ['/sitemap.xml', 200, /<urlset/],
  ['/api/health', 200, /"ok":true/], ['/api/public/projects?limit=3', 200, /"total"/], ['/api/public/map?layer=projects&zoom=4', 200, /"grid"/],
  ['/api/public/map?layer=projects&zoom=10&bbox=-122,43,-120,45', 200, /"points"|"grid"/], ['/api/public/map?layer=nope', 400], ['/api/public/counties', 200, /"mode"/],
  ['/api/public/ledger', 200, /"sources"/], ['/api/public/ledger?format=csv', 200, /name,url/], ['/projects/999999', 404], ['/projects/abc', 404], ['/nope', 404],
  ['/ops', 200, /Operations sign in/], ['/ops/requests', 200, /Operations sign in/], ['/api/ops/lookup?kind=organizations', 401], ['/api/ops/export/contacts', 401], ['/api/ops/map', 401],
];
async function main() {
  let bad = 0;
  for (const [path, status, re] of checks) {
    const res = await fetch(BASE + path, { redirect: 'follow' });
    const body = await res.text();
    const ok = res.status === status && (!re || re.test(body));
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${res.status} ${path}${ok ? '' : `  (wanted ${status}${re ? ' ' + re : ''})`}`);
  }
  if (bad) { console.error(`${bad} failed`); process.exit(1); }
  console.log('all passed');
}
main();
