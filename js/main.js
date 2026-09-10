(() => {
  'use strict';

  const config = window.PORTFOLIO_CONFIG;
  const root = document.documentElement;
  const themeButton = document.querySelector('#theme-toggle');
  const menuButton = document.querySelector('#menu-toggle');
  const menu = document.querySelector('#nav-links');
  const header = document.querySelector('#site-header');
  const topButton = document.querySelector('#back-to-top');
  const desktopMedia = window.matchMedia('(min-width: 768px)');
  const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const THEME_KEY = 'portfolio-theme';
  const state = { theme: 'light', isMenuOpen: false };

  const applyProfile = () => {
    document.querySelectorAll('[data-profile]').forEach((element) => {
      const value = config[element.dataset.profile];
      if (typeof value === 'string') element.textContent = value;
    });
    document.querySelectorAll('[data-github-link]').forEach((link) => {
      link.href = `https://github.com/${encodeURIComponent(config.githubUsername)}`;
    });
    document.querySelectorAll('[data-github-handle]').forEach((link) => {
      link.textContent = `@${config.githubUsername}`;
    });
    const profile = document.querySelector('.profile-image');
    profile.src = config.profileImage;
    profile.alt = config.profileImageAlt;
    document.title = `${config.name} — Developer Portfolio`;
    document.querySelector('meta[name="description"]').content = `${config.name}의 웹 개발 포트폴리오. ${config.tagline.replace(/\n/g, ' ')}`;
    document.querySelector('#copyright-year').textContent = new Date().getFullYear();
  };

  const renderTheme = () => {
    root.dataset.theme = state.theme;
    const isDark = state.theme === 'dark';
    themeButton.setAttribute('aria-pressed', String(isDark));
    themeButton.setAttribute('aria-label', isDark ? '라이트 모드 켜기' : '다크 모드 켜기');
  };

  try {
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark' || savedTheme === 'light') state.theme = savedTheme;
  } catch {
    // 저장이 차단된 환경에서도 현재 페이지의 테마 전환은 가능합니다.
  }
  renderTheme();
  themeButton.hidden = false;
  themeButton.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    renderTheme();
    try {
      window.localStorage.setItem(THEME_KEY, state.theme);
    } catch {
      // 저장 불가 시 메모리의 테마 상태를 유지합니다.
    }
  });

  const renderMenu = () => {
    menu.classList.toggle('active', state.isMenuOpen);
    menuButton.setAttribute('aria-expanded', String(state.isMenuOpen));
    menuButton.setAttribute('aria-label', state.isMenuOpen ? '메뉴 닫기' : '메뉴 열기');
  };
  const closeMenu = () => {
    state.isMenuOpen = false;
    renderMenu();
  };

  menuButton.hidden = false;
  root.classList.add('js-menu');
  menuButton.addEventListener('click', () => {
    state.isMenuOpen = !state.isMenuOpen;
    renderMenu();
  });
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.isMenuOpen) {
      closeMenu();
      menuButton.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (state.isMenuOpen && !header.contains(event.target)) closeMenu();
  });
  desktopMedia.addEventListener('change', closeMenu);

  const renderScroll = () => {
    header.classList.toggle('scrolled', window.scrollY >= 60);
    topButton.hidden = window.scrollY < 300;
  };
  let scrollScheduled = false;
  window.addEventListener('scroll', () => {
    if (scrollScheduled) return;
    scrollScheduled = true;
    window.requestAnimationFrame(() => {
      renderScroll();
      scrollScheduled = false;
    });
  }, { passive: true });
  window.addEventListener('pageshow', renderScroll);
  topButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: motionMedia.matches ? 'auto' : 'smooth' });
    document.querySelector('.wordmark').focus({ preventScroll: true });
  });

  // 초기화가 성공한 요소만 숨깁니다. 미지원 환경은 본문을 그대로 보여 줍니다.
  const revealElements = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !motionMedia.matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ isIntersecting, target }) => {
        if (!isIntersecting) return;
        target.classList.remove('reveal-pending');
        target.classList.add('reveal-visible');
        observer.unobserve(target);
      });
    }, { threshold: 0.2 });
    revealElements.forEach((element) => {
      // 화면보다 긴 요소는 20% 임계값에 도달하지 못할 수 있어 숨기지 않습니다.
      if (element.getBoundingClientRect().height > window.innerHeight) return;
      observer.observe(element);
      element.classList.add('reveal-pending');
    });
    const revealAll = () => {
      if (!motionMedia.matches) return;
      observer.disconnect();
      revealElements.forEach((element) => element.classList.remove('reveal-pending'));
    };
    motionMedia.addEventListener('change', revealAll);
    // 키보드로 접근한 요소가 애니메이션 대기 때문에 보이지 않지 않도록 합니다.
    document.addEventListener('focusin', (event) => {
      const section = event.target.closest('[data-reveal]');
      if (!section) return;
      section.classList.remove('reveal-pending');
      observer.unobserve(section);
    });
  }

  applyProfile();
  renderScroll();
})();
