(() => {
  'use strict';

  const region = document.querySelector('#projects-region');
  const grid = document.querySelector('#projects-grid');
  const statePanel = document.querySelector('#projects-state');
  const messageElement = document.querySelector('#projects-state-message');
  const stateSymbol = document.querySelector('#projects-state-symbol');
  const retryButton = document.querySelector('#projects-retry');
  const announcement = document.querySelector('#projects-announcement');
  const localProjects = window.PORTFOLIO_CONFIG.projects;
  const state = { status: 'success', projects: localProjects, message: '' };

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);

  const safeGitHubURL = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password
        ? url.href : '';
    } catch {
      return '';
    }
  };

  const renderCard = (project, index) => {
    const { name, description, tags = [], url, category = 'GitHub 프로젝트', coverTitle, coverLabel = 'PROJECT', stars } = project;
    const safeURL = safeGitHubURL(url);
    const title = escapeHTML(coverTitle || name || 'Untitled').replace(/\n/g, '<br>');
    const starLabel = Number.isFinite(stars) ? `<span>Stars ${escapeHTML(stars)}</span>` : '';

    return `<article class="project-card">
      <div class="project-cover"><span class="eyebrow">${escapeHTML(coverLabel)}</span><p class="cover-title">${title}<span>.</span></p><span class="cover-caption">BUILT WITH CURIOSITY</span></div>
      <div class="project-body">
        <div class="project-meta"><span>${String(index + 1).padStart(2, '0')}</span><span>${escapeHTML(category)}</span>${starLabel}</div>
        <h3>${escapeHTML(name || '이름 없는 프로젝트')}</h3><p>${escapeHTML(description || '설명이 없습니다.')}</p>
        <ul class="tags" aria-label="사용 기술">${tags.map((tag) => `<li>${escapeHTML(tag)}</li>`).join('')}</ul>
        ${safeURL ? `<a class="project-link" href="${escapeHTML(safeURL)}" target="_blank" rel="noopener noreferrer">저장소 보기<span class="sr-only">: ${escapeHTML(name)}</span><span aria-hidden="true">↗</span></a>` : ''}
      </div>
    </article>`;
  };

  const renderProjects = () => {
    const { status, projects, message } = state;
    const hasProjects = status === 'success';
    grid.hidden = !hasProjects;
    statePanel.hidden = hasProjects;
    retryButton.hidden = status !== 'error';
    retryButton.disabled = status === 'loading';
    region.setAttribute('aria-busy', String(status === 'loading'));

    if (hasProjects) {
      grid.innerHTML = projects.map(renderCard).join('');
      announcement.textContent = `${projects.length}개의 프로젝트를 표시했습니다.`;
      messageElement.textContent = '';
      return;
    }
    grid.innerHTML = '';
    const messages = {
      loading: '프로젝트를 불러오는 중입니다.',
      error: '프로젝트를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.',
      empty: '표시할 프로젝트가 없습니다.',
    };
    messageElement.textContent = message || messages[status];
    stateSymbol.textContent = { loading: '…', error: '↻', empty: '—' }[status];
    announcement.textContent = messageElement.textContent;
  };

  const setState = ({ status, projects = state.projects, message = '' }) => {
    if (!['loading', 'success', 'error', 'empty'].includes(status)) {
      throw new TypeError('프로젝트 상태는 loading, success, error, empty 중 하나여야 합니다.');
    }
    if (!Array.isArray(projects)) throw new TypeError('projects는 배열이어야 합니다.');
    state.status = status === 'success' && projects.length === 0 ? 'empty' : status;
    state.projects = projects;
    state.message = message;
    renderProjects();
  };

  // github.js에서 받은 저장소 배열을 카드 데이터로 변환합니다.
  const setRepositories = (repositories) => {
    if (!Array.isArray(repositories)) throw new TypeError('저장소 응답은 배열이어야 합니다.');
    const { featuredRepositories = [], repositoryDetails = {} } = window.PORTFOLIO_CONFIG;
    const rank = (name) => {
      const index = featuredRepositories.indexOf(name);
      return index < 0 ? featuredRepositories.length : index;
    };
    const ordered = [...repositories].sort((first, second) => rank(first.name) - rank(second.name));
    const projects = ordered.slice(0, 6).map(({ name, description, language, html_url, stargazers_count }) => {
      const details = Object.hasOwn(repositoryDetails, name) ? repositoryDetails[name] : {};
      return {
        name: details.name || name,
        description: description || details.description,
        tags: details.tags || [language || '미분류'],
        url: html_url,
        stars: stargazers_count,
        coverTitle: details.coverTitle,
        coverLabel: details.coverLabel || 'GITHUB REPOSITORY',
        category: details.category,
      };
    });
    setState({ status: 'success', projects });
  };

  let retryHandler = () => setState({ status: 'success', projects: localProjects });
  const onRetry = (handler) => {
    if (typeof handler !== 'function') throw new TypeError('재시도 핸들러는 함수여야 합니다.');
    retryHandler = handler;
  };
  retryButton.addEventListener('click', async () => {
    setState({ status: 'loading' });
    try {
      await retryHandler();
    } catch {
      setState({ status: 'error' });
    }
  });

  window.PortfolioProjects = Object.freeze({ setState, setRepositories, onRetry });
  setState(state);
})();
