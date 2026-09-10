import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFile } from 'node:process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
};

const sendJSON = (response, status, data) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
};

// 서버의 .env, 소스 코드, Git 파일은 웹으로 제공하지 않습니다.
const isPublicPath = (pathname) => {
  if (pathname === '/index.html') return true;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.some((part) => part.startsWith('.') || part.includes('\\'))) return false;
  const extension = extname(pathname).toLowerCase();
  if (parts[0] === 'css') return extension === '.css';
  if (parts[0] === 'js') return extension === '.js';
  return parts[0] === 'images' && Object.hasOwn(MIME_TYPES, extension)
    && !['.html', '.css', '.js'].includes(extension);
};

export const createPortfolioServer = ({ token = '', fetchImpl = fetch, rootDirectory = ROOT } = {}) => {
  const handleRequest = async (request, response) => {
    const expectedHosts = [`127.0.0.1:${request.socket.localPort}`, `localhost:${request.socket.localPort}`];
    if (!expectedHosts.includes(request.headers.host)) {
      sendJSON(response, 403, { message: '로컬 주소로 접속해 주세요.' });
      return;
    }
    const origin = `http://${request.headers.host}`;
    if (request.headers.origin && request.headers.origin !== origin) {
      sendJSON(response, 403, { message: '다른 사이트에서는 요청할 수 없습니다.' });
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      sendJSON(response, 405, { message: '지원하지 않는 요청입니다.' });
      return;
    }

    let url;
    let pathname;
    try {
      url = new URL(request.url, origin);
      pathname = decodeURIComponent(url.pathname);
    } catch {
      sendJSON(response, 400, { message: '잘못된 요청 주소입니다.' });
      return;
    }

    if (pathname === '/api/github/repos') {
      const username = url.searchParams.get('username') || '';
      if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) {
        sendJSON(response, 400, { message: '올바른 GitHub 사용자명을 입력해 주세요.' });
        return;
      }
      if (request.method === 'HEAD') {
        response.writeHead(200, { 'Cache-Control': 'no-store' });
        response.end();
        return;
      }

      const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'B1-1-Portfolio' };
      if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
      try {
        const upstream = await fetchImpl(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100`, {
          headers,
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        });
        if (!upstream.ok) {
          const messages = {
            401: 'GitHub 인증에 실패했습니다. 로컬 서버의 토큰 설정을 확인해 주세요.',
            403: 'GitHub 요청이 제한되었습니다. 잠시 후 다시 시도해 주세요.',
            404: 'GitHub 사용자를 찾을 수 없습니다.',
            429: 'GitHub 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          };
          const status = Object.hasOwn(messages, upstream.status) ? upstream.status : 502;
          sendJSON(response, status, { message: messages[status] || 'GitHub에서 프로젝트를 불러올 수 없습니다.' });
          return;
        }
        const repositories = await upstream.json();
        if (!Array.isArray(repositories) || repositories.some((repo) => !repo || typeof repo.name !== 'string' || typeof repo.html_url !== 'string')) {
          throw new Error('Invalid repository response');
        }
        // 공개 카드에 필요한 필드만 반환합니다. 인증 헤더와 원본 오류는 전달하지 않습니다.
        const publicRepositories = repositories.filter((repo) => repo.private === false).map((repo) => ({
          name: repo.name,
          description: typeof repo.description === 'string' ? repo.description : null,
          html_url: repo.html_url,
          language: typeof repo.language === 'string' ? repo.language : null,
          stargazers_count: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0,
        }));
        sendJSON(response, 200, publicRepositories);
      } catch {
        // 예외 문자열에는 인증 정보가 포함될 수 있으므로 응답과 로그에 출력하지 않습니다.
        sendJSON(response, 502, { message: 'GitHub에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' });
      }
      return;
    }

    const publicPath = pathname === '/' ? '/index.html' : pathname;
    if (!isPublicPath(publicPath)) {
      sendJSON(response, 404, { message: '페이지를 찾을 수 없습니다.' });
      return;
    }
    try {
      const absoluteRoot = await realpath(rootDirectory);
      const filename = await realpath(resolve(absoluteRoot, `.${publicPath}`));
      const relativePath = relative(absoluteRoot, filename);
      if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || !isPublicPath(`/${relativePath.split(sep).join('/')}`)) {
        sendJSON(response, 404, { message: '페이지를 찾을 수 없습니다.' });
        return;
      }
      const content = await readFile(filename);
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(filename).toLowerCase()],
        'Content-Length': content.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch {
      sendJSON(response, 404, { message: '페이지를 찾을 수 없습니다.' });
    }
  };

  return createServer((request, response) => {
    handleRequest(request, response).catch(() => {
      if (!response.headersSent) sendJSON(response, 500, { message: '요청을 처리할 수 없습니다.' });
      else response.end();
    });
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    loadEnvFile(resolve(ROOT, '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('.env 설정을 읽을 수 없습니다. 파일 형식을 확인해 주세요.');
      process.exit(1);
    }
  }
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT는 1~65535 사이의 정수여야 합니다.');
    process.exit(1);
  }
  const server = createPortfolioServer({ token: process.env.GITHUB_TOKEN || '' });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? '포트가 사용 중입니다. 기존 서버를 종료하거나 .env의 PORT를 변경해 주세요.' : '로컬 서버를 시작할 수 없습니다.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Portfolio: http://127.0.0.1:${port}`);
    console.log(process.env.GITHUB_TOKEN?.trim() ? 'GitHub: 서버 토큰 사용' : 'GitHub: 토큰 없이 공개 저장소 조회');
  });
}
