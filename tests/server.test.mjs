import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createPortfolioServer } from '../server.mjs';

const TOKEN = 'test-only-not-a-real-token';
const fixtureRepository = { name: 'portfolio', private: false, description: 'A portfolio', html_url: 'https://github.com/hkk-cody/B1-1', language: 'JavaScript', stargazers_count: 1 };

const startServer = async (t, options = {}) => {
  const server = createPortfolioServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
};

test('token is sent only to GitHub; browser gets public card fields', async (t) => {
  let upstreamRequest;
  const base = await startServer(t, {
    token: TOKEN,
    fetchImpl: async (url, options) => {
      upstreamRequest = { url, options };
      return Response.json([
        { ...fixtureRepository, internal: TOKEN },
        { ...fixtureRepository, name: 'private', private: true },
      ]);
    },
  });
  const response = await fetch(`${base}/api/github/repos?username=hkk-cody`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(body.includes(TOKEN), false);
  assert.deepEqual(JSON.parse(body), [{ name: 'portfolio', description: 'A portfolio', html_url: fixtureRepository.html_url, language: 'JavaScript', stargazers_count: 1 }]);
  assert.equal(upstreamRequest.options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(upstreamRequest.options.redirect, 'error');
  assert.equal(upstreamRequest.url, 'https://api.github.com/users/hkk-cody/repos?sort=updated&per_page=100');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('blank token allows unauthenticated public requests', async (t) => {
  const base = await startServer(t, { fetchImpl: async (_url, options) => {
    assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
    return Response.json([]);
  } });
  assert.deepEqual(await (await fetch(`${base}/api/github/repos?username=hkk-cody`)).json(), []);
});

test('sensitive files, traversal and symbolic links cannot expose .env', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'portfolio-static-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'js'));
  await mkdir(join(root, 'images'));
  await writeFile(join(root, '.env'), `GITHUB_TOKEN=${TOKEN}`);
  await writeFile(join(root, 'index.html'), '<h1>Portfolio</h1>');
  await writeFile(join(root, 'js', 'main.js'), 'const ready = true;');
  await symlink(join(root, '.env'), join(root, 'js', 'secret.js'));
  const base = await startServer(t, { rootDirectory: root });
  for (const path of ['/.env', '/.env.example', '/.git/config', '/server.mjs', '/package.json', '/js/../.env', '/%2eenv', '/js/%2e%2e/%2eenv', '/js/secret.js', '/README.md', '/images/.env']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 404, path);
    assert.equal((await response.text()).includes(TOKEN), false, path);
  }
  assert.match(await (await fetch(base)).text(), /Portfolio/);
  assert.equal((await fetch(`${base}/js/main.js`)).status, 200);
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('rejects malformed usernames, cross-origin calls and write requests', async (t) => {
  let calls = 0;
  const base = await startServer(t, { fetchImpl: async () => { calls += 1; return Response.json([]); } });
  assert.equal((await fetch(`${base}/api/github/repos?username=../secret`)).status, 400);
  assert.equal((await fetch(`${base}/api/github/repos?username=hkk-cody`, { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(`${base}/api/github/repos?username=hkk-cody`, { method: 'POST' })).status, 405);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = request(base, { headers: { Host: 'example.com' } }, (response) => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal(calls, 0);
});

test('upstream HTTP errors do not echo response bodies or tokens', async (t) => {
  let status = 401;
  const base = await startServer(t, { token: TOKEN, fetchImpl: async () => Response.json({ message: TOKEN }, { status }) });
  for (const nextStatus of [401, 403, 404, 429, 500]) {
    status = nextStatus;
    const response = await fetch(`${base}/api/github/repos?username=hkk-cody`);
    assert.equal(response.status, nextStatus === 500 ? 502 : nextStatus);
    assert.equal((await response.text()).includes(TOKEN), false);
  }
});

test('network failures and malformed responses produce a safe error', async (t) => {
  let mode = 'throw';
  const base = await startServer(t, { token: TOKEN, fetchImpl: async () => {
    if (mode === 'throw') throw new Error(TOKEN);
    if (mode === 'html') return new Response('<html>Unavailable</html>');
    return Response.json([null]);
  } });
  for (const nextMode of ['throw', 'html', 'null']) {
    mode = nextMode;
    const response = await fetch(`${base}/api/github/repos?username=hkk-cody`);
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes(TOKEN), false);
  }
});
