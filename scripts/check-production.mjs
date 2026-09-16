import assert from 'node:assert/strict';

// Public endpoint checks only. Never accept credentials or fetch household records.
const [value, mode] = process.argv.slice(2);
if (!value || !['--configured', '--unconfigured'].includes(mode)) {
  console.error('Usage: npm run check:production -- https://your-host --configured|--unconfigured');
  process.exit(1);
}
const origin = new URL(value);
assert.equal(origin.protocol, 'https:', 'Production must use HTTPS');
assert.equal(origin.origin, value, 'Use an origin without a path, query or trailing slash');
const configured = mode === '--configured';
const get = (path) =>
  fetch(new URL(path, origin), {
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
const index = await get('/');
assert.equal(index.status, 200, 'The web application must load');
assert.match(index.headers.get('content-type') ?? '', /text\/html/);
console.log('PASS HTTPS web application');

const configResponse = await get('/api/config');
assert.equal(configResponse.status, 200);
assert.deepEqual(await configResponse.json(), {
  demoEnabled: false,
  oidcEnabled: configured,
  mode: 'production',
});
console.log(`PASS production mode; Google login ${configured ? 'configured' : 'awaiting setup'}`);

for (const path of ['/api/bootstrap', '/api/data/backup', '/api/ws']) {
  const response = await get(path);
  assert.equal(
    response.status,
    configured ? 401 : 503,
    `${path} must reject unauthenticated requests`,
  );
  assert.equal(
    (await response.json()).code,
    configured ? 'UNAUTHENTICATED' : 'AUTH_NOT_CONFIGURED',
    `${path} must return the application's access restriction, not a platform error`,
  );
  console.log(`PASS unauthenticated access blocked: ${path}`);
}
const demo = await fetch(new URL('/api/auth/demo', origin), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin.origin },
  body: JSON.stringify({ userId: 'u1' }),
  redirect: 'manual',
  signal: AbortSignal.timeout(15_000),
});
assert.equal(demo.status, 404, 'Demo login must be unavailable remotely');
assert.equal((await demo.json()).code, 'NOT_FOUND');
console.log('PASS remote demo login blocked');
console.log('Actual Google login and two-user collaboration still require browser verification.');
