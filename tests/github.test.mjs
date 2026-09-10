import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/github.js', import.meta.url), 'utf8');
const settle = () => new Promise((resolve) => setImmediate(resolve));

const runLoader = (hostname, fetchImpl) => {
  const calls = [];
  const states = [];
  const results = [];
  let retry;
  let abort;
  let timeoutCleared = false;
  const context = vm.createContext({
    AbortController,
    fetch: async (url, options) => { calls.push({ url, options }); return fetchImpl(url, options); },
    window: {
      location: { hostname },
      PORTFOLIO_CONFIG: { githubUsername: 'hkk-cody' },
      PortfolioProjects: {
        setState: (value) => states.push(value),
        setRepositories: (value) => results.push(value),
        onRetry: (handler) => { retry = handler; },
      },
      setTimeout: (handler) => { abort = handler; return 1; },
      clearTimeout: () => { timeoutCleared = true; },
    },
  });
  vm.runInContext(source, context);
  return { calls, states, results, retry: () => retry(), abort: () => abort(), cleared: () => timeoutCleared };
};

test('local page calls same-origin proxy without credentials', async () => {
  const loader = runLoader('127.0.0.1', async () => Response.json([]));
  await settle();
  assert.equal(loader.calls[0].url, '/api/github/repos?username=hkk-cody');
  assert.equal(loader.calls[0].options.credentials, 'omit');
  assert.equal(Object.hasOwn(loader.calls[0].options.headers, 'Authorization'), false);
  assert.equal(loader.states[0].status, 'loading');
  assert.deepEqual(loader.results, [[]]);
  assert.equal(loader.cleared(), true);
});

test('GitHub Pages calls the public API directly without a token', async () => {
  const loader = runLoader('hkk-cody.github.io', async () => Response.json([]));
  await settle();
  assert.equal(loader.calls[0].url, 'https://api.github.com/users/hkk-cody/repos?sort=updated&per_page=100');
  assert.equal(Object.hasOwn(loader.calls[0].options.headers, 'Authorization'), false);
});

test('HTTP errors and malformed responses can recover via retry', async () => {
  let mode = 'error';
  const loader = runLoader('localhost', async () => {
    if (mode === 'error') return Response.json({}, { status: 403 });
    if (mode === 'malformed') return Response.json([null]);
    return Response.json([{ name: 'portfolio', html_url: 'https://github.com/hkk-cody/B1-1' }]);
  });
  await settle();
  assert.equal(loader.states.at(-1).status, 'error');
  assert.match(loader.states.at(-1).message, /제한/);
  mode = 'malformed';
  await loader.retry();
  assert.equal(loader.states.at(-1).status, 'error');
  mode = 'success';
  await loader.retry();
  assert.equal(loader.results.at(-1)[0].name, 'portfolio');
});

test('slow requests are aborted and duplicate requests are suppressed', async () => {
  const loader = runLoader('localhost', async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  }));
  await loader.retry();
  assert.equal(loader.calls.length, 1);
  loader.abort();
  await settle();
  assert.equal(loader.states.at(-1).status, 'error');
  assert.match(loader.states.at(-1).message, /시간이 초과/);
  assert.equal(loader.cleared(), true);
});
