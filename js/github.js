(() => {
  'use strict';

  const { githubUsername } = window.PORTFOLIO_CONFIG;
  const { setState, setRepositories, onRetry } = window.PortfolioProjects;
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const publicURL = `https://api.github.com/users/${encodeURIComponent(githubUsername)}/repos?sort=updated&per_page=100`;
  const proxyURL = `/api/github/repos?username=${encodeURIComponent(githubUsername)}`;
  let isLoading = false;

  const loadRepositories = async () => {
    if (isLoading) return;
    isLoading = true;
    setState({ status: 'loading' });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      // 브라우저는 인증 정보를 보관하지 않고 로컬 서버만 .env를 읽습니다.
      const response = await fetch(isLocal ? proxyURL : publicURL, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) {
        const messages = {
          401: 'GitHub 인증에 실패했습니다. 토큰 설정을 확인해 주세요.',
          403: 'GitHub 요청이 제한되었습니다. 잠시 후 다시 시도해 주세요.',
          404: isLocal ? 'GitHub 사용자명과 로컬 서버 실행 상태를 확인해 주세요. npm start로 실행할 수 있습니다.' : 'GitHub 사용자를 찾을 수 없습니다.',
          429: 'GitHub 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        };
        setState({ status: 'error', message: messages[response.status] || '프로젝트를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.' });
        return;
      }
      const repositories = await response.json();
      if (!Array.isArray(repositories) || repositories.some((repo) => !repo || typeof repo.name !== 'string' || typeof repo.html_url !== 'string')) {
        throw new Error('Invalid repository response');
      }
      setRepositories(repositories);
    } catch {
      setState({ status: 'error', message: controller.signal.aborted
        ? '응답 시간이 초과되었습니다. 다시 시도해 주세요.'
        : '프로젝트를 불러올 수 없습니다. 네트워크 연결을 확인해 주세요.' });
    } finally {
      window.clearTimeout(timeout);
      isLoading = false;
    }
  };

  onRetry(loadRepositories);
  loadRepositories();
})();
