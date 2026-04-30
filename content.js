(() => {
  if (window.__videoControlInjected) {
    return;
  }
  window.__videoControlInjected = true;

  const ROOT_ID = 'vc-root';
  const SETTINGS_KEY = 'defaultSkipSeconds';
  const LAYOUT_KEY = 'panelLayout';
  const DEFAULT_SKIP_SECONDS = 10;
  const DEFAULT_DELTA_SECONDS = 50;
  const FULLSCREEN_AUTO_HIDE_MS = 2000;
  const MIN_PLAYER_WIDTH = 360;
  const MIN_PLAYER_HEIGHT = 200;
  const MIN_PLAYER_AREA = 72000;
  const MIN_PLAYER_VISIBLE_RATIO = 0.6;
  const MIN_PLAYER_ASPECT_RATIO = 1.3;
  const MAX_PLAYER_ASPECT_RATIO = 2.8;
  const DEFAULT_PANEL_LAYOUT = {
    collapsed: true,
    anchorX: 'right',
    anchorY: 'bottom',
    offsetX: 18,
    offsetY: 18,
  };
  const DRAG_MARGIN = 8;
  const NAVIGATION_EVENT = 'vc:navigation';

  const ICONS = {
    logo: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 6.5c0-1.38 1.12-2.5 2.5-2.5h9A2.5 2.5 0 0 1 19 6.5v11A2.5 2.5 0 0 1 16.5 20h-9A2.5 2.5 0 0 1 5 17.5v-11Z" fill="currentColor" opacity=".16"/>
        <path d="M8 8.5h5.25c1.72 0 2.75.86 2.75 2.22 0 .97-.54 1.63-1.36 1.95 1.13.28 1.86 1.1 1.86 2.32 0 1.64-1.24 2.51-3.24 2.51H8V8.5Zm2.29 3.47h2.52c.64 0 1.04-.34 1.04-.9 0-.55-.4-.88-1.04-.88h-2.52v1.78Zm0 3.84h2.79c.83 0 1.3-.35 1.3-.99 0-.63-.47-.99-1.3-.99h-2.79v1.98Z" fill="currentColor"/>
      </svg>
    `,
    back: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M11 7 6 12l5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M18 7 13 12l5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `,
    forward: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m13 7 5 5-5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="m6 7 5 5-5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `,
    play: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 6.75v10.5c0 .83.92 1.33 1.62.88l8.25-5.25a1.04 1.04 0 0 0 0-1.76L9.62 5.87A1.04 1.04 0 0 0 8 6.75Z" fill="currentColor"/>
      </svg>
    `,
    pause: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="7" y="6" width="4" height="12" rx="1.4" fill="currentColor"/>
        <rect x="13" y="6" width="4" height="12" rx="1.4" fill="currentColor"/>
      </svg>
    `,
    minus: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 12h12" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
      </svg>
    `,
    plus: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
      </svg>
    `,
    collapse: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m8 10 4 4 4-4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `,
  };

  let root = null;
  let statusEl = null;
  let activeVideo = null;
  let releaseActiveVideo = null;
  let quickSkipSeconds = DEFAULT_SKIP_SECONDS;
  let panelLayout = { ...DEFAULT_PANEL_LAYOUT };
  let lastUrl = location.href;
  let refreshHandle = 0;
  let layoutHandle = 0;
  let settleLayoutTimeout = 0;
  let domObserver = null;
  let titleObserver = null;
  let lastDragEndedAt = 0;
  let fullscreenHideTimeout = 0;

  init();

  async function init() {
    const [storedSkipSeconds, storedLayout] = await Promise.all([
      loadQuickSkipSeconds(),
      loadPanelLayout(),
    ]);

    quickSkipSeconds = storedSkipSeconds;
    panelLayout = storedLayout;

    installHistoryHooks();
    installObservers();
    installListeners();
    refreshPanelState('init');
  }

  function hasSyncStorageApi() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.sync);
  }

  function hasLocalStorageApi() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
  }

  function sanitizeSeconds(value, fallback = DEFAULT_SKIP_SECONDS) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue < 1) {
      return fallback;
    }

    return Math.min(Math.floor(numericValue), 600);
  }

  function sanitizePanelLayout(value) {
    const layout = value && typeof value === 'object' ? value : {};

    return {
      collapsed: typeof layout.collapsed === 'boolean' ? layout.collapsed : DEFAULT_PANEL_LAYOUT.collapsed,
      anchorX: layout.anchorX === 'left' ? 'left' : 'right',
      anchorY: layout.anchorY === 'top' ? 'top' : 'bottom',
      offsetX: sanitizeOffset(layout.offsetX, DEFAULT_PANEL_LAYOUT.offsetX),
      offsetY: sanitizeOffset(layout.offsetY, DEFAULT_PANEL_LAYOUT.offsetY),
    };
  }

  function sanitizeOffset(value, fallback) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    return Math.max(DRAG_MARGIN, Math.round(numericValue));
  }

  function loadQuickSkipSeconds() {
    if (!hasSyncStorageApi()) {
      return Promise.resolve(DEFAULT_SKIP_SECONDS);
    }

    return new Promise((resolve) => {
      chrome.storage.sync.get({ [SETTINGS_KEY]: DEFAULT_SKIP_SECONDS }, (result) => {
        resolve(sanitizeSeconds(result?.[SETTINGS_KEY], DEFAULT_SKIP_SECONDS));
      });
    });
  }

  function loadPanelLayout() {
    if (!hasLocalStorageApi()) {
      return Promise.resolve({ ...DEFAULT_PANEL_LAYOUT });
    }

    return new Promise((resolve) => {
      chrome.storage.local.get({ [LAYOUT_KEY]: DEFAULT_PANEL_LAYOUT }, (result) => {
        resolve(sanitizePanelLayout(result?.[LAYOUT_KEY]));
      });
    });
  }

  function savePanelLayout() {
    if (!hasLocalStorageApi()) {
      return;
    }

    chrome.storage.local.set({ [LAYOUT_KEY]: panelLayout });
  }

  function installHistoryHooks() {
    if (window.__videoControlHistoryPatched) {
      return;
    }
    window.__videoControlHistoryPatched = true;

    for (const methodName of ['pushState', 'replaceState']) {
      const originalMethod = history[methodName];

      if (typeof originalMethod !== 'function') {
        continue;
      }

      history[methodName] = function patchedHistoryMethod(...args) {
        const result = originalMethod.apply(this, args);
        window.dispatchEvent(new Event(NAVIGATION_EVENT));
        return result;
      };
    }
  }

  function installObservers() {
    domObserver?.disconnect();
    titleObserver?.disconnect();

    domObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
      }

      scheduleRefresh('dom-mutation');
    });

    domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    const titleTarget = document.head || document.documentElement;
    titleObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
      }

      scheduleRefresh('title-mutation');
    });

    titleObserver.observe(titleTarget, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  function installListeners() {
    window.addEventListener('popstate', handleNavigationSignal, true);
    window.addEventListener('hashchange', handleNavigationSignal, true);
    window.addEventListener(NAVIGATION_EVENT, handleNavigationSignal);
    window.addEventListener('resize', scheduleLayoutApply);
    document.addEventListener('mousemove', handleFullscreenMouseMove, true);

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    document.addEventListener('keydown', handleHotkeys, true);
    document.addEventListener('keyup', handleHotkeyKeyup, true);

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync' && changes[SETTINGS_KEY]) {
          quickSkipSeconds = sanitizeSeconds(changes[SETTINGS_KEY].newValue, DEFAULT_SKIP_SECONDS);
          updateQuickSkipLabels();

          if (root) {
            setStatus(`Quick skip updated to ${quickSkipSeconds}s.`);
          }
        }

        if (areaName === 'local' && changes[LAYOUT_KEY]) {
          panelLayout = sanitizePanelLayout(changes[LAYOUT_KEY].newValue);

          if (root) {
            applyCollapsedState(panelLayout.collapsed, { persist: false });
            scheduleLayoutApply();
          }
        }
      });
    }
  }

  function handleNavigationSignal() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
    }

    scheduleRefresh('navigation');
  }

  function scheduleRefresh(reason) {
    if (refreshHandle) {
      return;
    }

    refreshHandle = window.requestAnimationFrame(() => {
      refreshHandle = 0;
      refreshPanelState(reason);
    });
  }

  function scheduleLayoutApply() {
    if (!root || layoutHandle) {
      return;
    }

    layoutHandle = window.requestAnimationFrame(() => {
      layoutHandle = 0;
      applyPanelLayout();
    });
  }

  function refreshPanelState(reason) {
    const video = getTargetVideo();

    if (!video) {
      detachActiveVideo();
      removeControlPanel();
      return;
    }

    ensureControlPanel();

    if (video !== activeVideo) {
      attachActiveVideo(video);

      if (reason === 'navigation') {
        setStatus('Video page changed. Controls refreshed.');
      } else {
        setStatus('Video detected. Controls ready.');
      }
    }

    updateQuickSkipLabels();
    updatePlayPauseButton(video);
    updateSpeedDisplay(video);
    scheduleLayoutApply();
  }

  function getVideoMetrics(video) {
    if (!video?.isConnected) {
      return null;
    }

    const rect = video.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const area = width * height;
    const visibleWidth = clamp(Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0), 0, width);
    const visibleHeight = clamp(Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0), 0, height);
    const visibleArea = visibleWidth * visibleHeight;
    const visibleRatio = area > 0 ? visibleArea / area : 0;
    const aspectRatio = height > 0 ? width / height : 0;

    return {
      rect,
      width,
      height,
      area,
      visibleArea,
      visibleRatio,
      aspectRatio,
      style: getComputedStyle(video),
    };
  }

  function isEligibleVideoPlayer(video, metrics = getVideoMetrics(video)) {
    if (!metrics) {
      return false;
    }

    const { rect, width, height, area, visibleRatio, aspectRatio, style } = metrics;

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < MIN_PLAYER_WIDTH ||
      height < MIN_PLAYER_HEIGHT ||
      area < MIN_PLAYER_AREA
    ) {
      return false;
    }

    if (
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= window.innerHeight ||
      rect.left >= window.innerWidth
    ) {
      return false;
    }

    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0 ||
      video.closest('[hidden], [aria-hidden="true"], [inert]')
    ) {
      return false;
    }

    if (visibleRatio < MIN_PLAYER_VISIBLE_RATIO) {
      return false;
    }

    return aspectRatio >= MIN_PLAYER_ASPECT_RATIO && aspectRatio <= MAX_PLAYER_ASPECT_RATIO;
  }

  function scoreVideoCandidate(video, metrics) {
    let score = metrics.visibleArea;

    if (!video.paused && !video.ended) {
      score += metrics.visibleArea * 0.25;
    }

    if (video.currentTime > 0) {
      score += 50000;
    }

    if (!video.muted) {
      score += 10000;
    }

    return score;
  }

  function getTargetVideo() {
    const videos = Array.from(document.querySelectorAll('video')).filter((video) => video.isConnected);

    if (!videos.length) {
      return null;
    }

    const fullscreenElement = document.fullscreenElement;

    if (fullscreenElement) {
      const fullscreenVideo = fullscreenElement.matches?.('video')
        ? fullscreenElement
        : fullscreenElement.querySelector?.('video');

      if (fullscreenVideo?.isConnected && isEligibleVideoPlayer(fullscreenVideo)) {
        return fullscreenVideo;
      }
    }

    const eligibleVideos = videos
      .map((video) => ({ video, metrics: getVideoMetrics(video) }))
      .filter(({ video, metrics }) => isEligibleVideoPlayer(video, metrics))
      .sort((firstCandidate, secondCandidate) => {
        return scoreVideoCandidate(secondCandidate.video, secondCandidate.metrics) -
          scoreVideoCandidate(firstCandidate.video, firstCandidate.metrics);
      });

    return eligibleVideos[0]?.video || null;
  }

  function attachActiveVideo(video) {
    detachActiveVideo();

    activeVideo = video;

    const syncButtonState = () => updatePlayPauseButton(video);
    const refreshState = () => scheduleRefresh('video-change');
    const syncSpeedState = () => updateSpeedDisplay(video);

    const listeners = [
      ['play', syncButtonState],
      ['pause', syncButtonState],
      ['loadedmetadata', syncButtonState],
      ['durationchange', syncButtonState],
      ['emptied', refreshState],
      ['ended', syncButtonState],
      ['ratechange', syncSpeedState],
    ];

    for (const [eventName, listener] of listeners) {
      video.addEventListener(eventName, listener);
    }

    releaseActiveVideo = () => {
      for (const [eventName, listener] of listeners) {
        video.removeEventListener(eventName, listener);
      }
    };
  }

  function detachActiveVideo() {
    if (releaseActiveVideo) {
      releaseActiveVideo();
      releaseActiveVideo = null;
    }

    activeVideo = null;
  }

  function ensureControlPanel() {
    if (root?.isConnected) {
      syncPanelMountTarget();
      return;
    }

    createControlPanel();
    syncPanelMountTarget();
    applyCollapsedState(panelLayout.collapsed, { persist: false });
    syncFullscreenPanelState({ reveal: Boolean(document.fullscreenElement) });
    updateQuickSkipLabels();
    updatePlayPauseButton();
    updateSpeedDisplay();
    scheduleLayoutApply();
  }

  function removeControlPanel() {
    if (!root) {
      return;
    }

    if (layoutHandle) {
      window.cancelAnimationFrame(layoutHandle);
      layoutHandle = 0;
    }

    if (settleLayoutTimeout) {
      window.clearTimeout(settleLayoutTimeout);
      settleLayoutTimeout = 0;
    }

    clearFullscreenHideTimeout();
    root.remove();
    root = null;
    statusEl = null;
  }

  function handleFullscreenChange() {
    syncPanelMountTarget();
    syncFullscreenPanelState({ reveal: Boolean(document.fullscreenElement) });
    updatePlayPauseButton();
    scheduleLayoutApply();
  }

  function handleFullscreenMouseMove() {
    if (!document.fullscreenElement || !root) {
      return;
    }

    showFullscreenPanel();
  }

  function getPanelMountTarget() {
    return document.fullscreenElement || document.documentElement;
  }

  function syncPanelMountTarget() {
    if (!root) {
      return;
    }

    const mountTarget = getPanelMountTarget();

    if (mountTarget && root.parentNode !== mountTarget) {
      mountTarget.appendChild(root);
    }
  }

  function syncFullscreenPanelState({ reveal = false } = {}) {
    if (!root) {
      return;
    }

    const isFullscreen = Boolean(document.fullscreenElement);
    root.classList.toggle('vc-fullscreen-mode', isFullscreen);

    if (!isFullscreen) {
      root.classList.remove('vc-fullscreen-visible');
      clearFullscreenHideTimeout();
      return;
    }

    if (reveal) {
      showFullscreenPanel();
    }
  }

  function showFullscreenPanel() {
    if (!root || !document.fullscreenElement) {
      return;
    }

    root.classList.add('vc-fullscreen-visible');
    scheduleFullscreenAutoHide();
  }

  function scheduleFullscreenAutoHide() {
    clearFullscreenHideTimeout();

    if (!root || !document.fullscreenElement) {
      return;
    }

    fullscreenHideTimeout = window.setTimeout(() => {
      fullscreenHideTimeout = 0;

      if (!root || !document.fullscreenElement) {
        return;
      }

      if (root.classList.contains('vc-dragging') || root.matches(':hover') || root.contains(document.activeElement)) {
        scheduleFullscreenAutoHide();
        return;
      }

      root.classList.remove('vc-fullscreen-visible');
    }, FULLSCREEN_AUTO_HIDE_MS);
  }

  function clearFullscreenHideTimeout() {
    if (!fullscreenHideTimeout) {
      return;
    }

    window.clearTimeout(fullscreenHideTimeout);
    fullscreenHideTimeout = 0;
  }

  function clampToVideo(video, time) {
    const maximumTime = Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER;
    return Math.min(Math.max(time, 0), maximumTime);
  }

  function changeSpeed(delta) {
    const video = getTargetVideo();
    if (!video) return;
    
    let newRate = video.playbackRate + delta;
    newRate = Math.max(0.25, Math.min(newRate, 16.0));
    video.playbackRate = newRate;
    setStatus(`Playback speed: ${newRate.toFixed(2)}x`);
  }

  function shiftVideo(seconds) {
    const video = getTargetVideo();

    if (!video) {
      return;
    }

    const nextTime = clampToVideo(video, video.currentTime + seconds);
    video.currentTime = nextTime;

    const direction = seconds >= 0 ? '+' : '';
    setStatus(`Moved ${direction}${seconds}s | ${Math.floor(video.currentTime)}s / ${formatDuration(video.duration)}`);
    updatePlayPauseButton(video);
  }

  function togglePlayPause() {
    const video = getTargetVideo();

    if (!video) {
      return;
    }

    if (video.paused) {
      const playbackPromise = video.play();

      if (playbackPromise && typeof playbackPromise.catch === 'function') {
        playbackPromise.catch(() => {
          setStatus('Could not start playback.');
        });
      }

      setStatus('Playing video.');
    } else {
      video.pause();
      setStatus('Paused video.');
    }

    updatePlayPauseButton(video);
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) {
      return '--:--';
    }

    const displaySeconds = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    const displayMinutes = Math.floor((seconds / 60) % 60)
      .toString()
      .padStart(2, '0');
    const displayHours = Math.floor(seconds / 3600);

    return displayHours > 0
      ? `${displayHours}:${displayMinutes}:${displaySeconds}`
      : `${displayMinutes}:${displaySeconds}`;
  }

  function createControlPanel() {
    root = document.createElement('section');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'VeoPanel video controls');

    root.innerHTML = `
      <button class="vc-fab" id="vc-fab" type="button" aria-label="Open VeoPanel controls" title="Open VeoPanel controls">
        <span class="vc-fab-icon">${ICONS.logo}</span>
      </button>

      <div class="vc-panel">
        <div class="vc-header" id="vc-drag-handle" title="Drag to move. Double-click to collapse.">
          <div class="vc-header-brand">
            <span class="vc-header-icon">${ICONS.logo}</span>
            <div class="vc-header-copy">
              <span class="vc-title">VeoPanel</span>
              <span class="vc-subtitle">by Bloc-Verse</span>
            </div>
          </div>

          <button class="vc-icon-btn" id="vc-collapse" type="button" aria-label="Collapse panel" title="Collapse panel">
            <span class="vc-icon">${ICONS.collapse}</span>
          </button>
        </div>

        <div class="vc-body">
          <div class="vc-row vc-row-split">
            <button class="vc-btn vc-btn-ghost" id="vc-back" type="button">
              <span class="vc-icon">${ICONS.back}</span>
              <span class="vc-btn-label" id="vc-back-label">Back ${quickSkipSeconds}s</span>
            </button>

            <button class="vc-btn vc-btn-ghost" id="vc-forward" type="button">
              <span class="vc-icon">${ICONS.forward}</span>
              <span class="vc-btn-label" id="vc-forward-label">Forward ${quickSkipSeconds}s</span>
            </button>
          </div>

          <button class="vc-btn vc-btn-primary" id="vc-toggle-play" type="button">
            <span class="vc-icon" id="vc-toggle-icon">${ICONS.pause}</span>
            <span class="vc-btn-label" id="vc-toggle-label">Pause</span>
          </button>

          <div class="vc-jump">
            <label class="vc-field" for="vc-seconds">
              <span class="vc-field-label">Custom jump</span>
              <input class="vc-input" id="vc-seconds" value="${DEFAULT_DELTA_SECONDS}" />
            </label>

            <div class="vc-row vc-row-split">
              <button class="vc-btn vc-btn-soft" id="vc-minus" type="button">
                <span class="vc-icon">${ICONS.minus}</span>
                <span class="vc-btn-label">Back</span>
              </button>

              <button class="vc-btn vc-btn-soft" id="vc-plus" type="button">
                <span class="vc-icon">${ICONS.plus}</span>
                <span class="vc-btn-label">Forward</span>
              </button>
            </div>
          </div>

          <div class="vc-jump">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span class="vc-field-label">Playback Speed</span>
              <button class="vc-status" id="vc-speed-reset" type="button" style="border: 1px solid rgba(108, 92, 231, 0.4); cursor: pointer; background: transparent; padding: 4px 8px; transition: background 0.18s ease; outline: none;" onmouseover="this.style.background='rgba(108,92,231,0.2)'" onmouseout="this.style.background='transparent'" title="Reset to 1.0x">1.0x</button>
            </div>

            <div class="vc-row vc-row-split">
              <button class="vc-btn vc-btn-soft" id="vc-speed-down" type="button" title="Slower (-0.25x)">
                <span class="vc-icon">${ICONS.minus}</span>
                <span class="vc-btn-label">Slower</span>
              </button>

              <button class="vc-btn vc-btn-soft" id="vc-speed-up" type="button" title="Faster (+0.25x)">
                <span class="vc-icon">${ICONS.plus}</span>
                <span class="vc-btn-label">Faster</span>
              </button>
            </div>
          </div>

          <div class="vc-meta">
            <span class="vc-status" id="vc-status">Ready</span>
            <span class="vc-hint">Hotkeys: Left, Right, Space, &lt;, &gt;</span>
          </div>

          <div class="vc-signoff">&trade; Bloc-Verse</div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(root);

    statusEl = root.querySelector('#vc-status');

    root.querySelector('#vc-fab').addEventListener('click', handleFabClick);
    root.querySelector('#vc-back').addEventListener('click', () => shiftVideo(-quickSkipSeconds));
    root.querySelector('#vc-forward').addEventListener('click', () => shiftVideo(quickSkipSeconds));
    root.querySelector('#vc-toggle-play').addEventListener('click', () => togglePlayPause());

    root.querySelector('#vc-minus').addEventListener('click', () => {
      shiftVideo(-readDeltaSeconds());
    });

    root.querySelector('#vc-plus').addEventListener('click', () => {
      shiftVideo(readDeltaSeconds());
    });

    root.querySelector('#vc-speed-down').addEventListener('click', () => changeSpeed(-0.25));
    root.querySelector('#vc-speed-up').addEventListener('click', () => changeSpeed(0.25));
    root.querySelector('#vc-speed-reset').addEventListener('click', () => {
      const video = getTargetVideo();
      if (video) {
        video.playbackRate = 1.0;
        setStatus('Playback speed reset to 1.0x');
      }
    });

    root.querySelector('#vc-collapse').addEventListener('click', () => {
      applyCollapsedState(true);
    });

    root.querySelector('#vc-drag-handle').addEventListener('dblclick', (event) => {
      if (event.target.closest('button, input, label')) {
        return;
      }

      applyCollapsedState(true);
    });

    enableDragging(root, [root.querySelector('#vc-drag-handle'), root.querySelector('#vc-fab')]);
  }

  function handleFabClick() {
    if (performance.now() - lastDragEndedAt < 220) {
      return;
    }

    applyCollapsedState(false);
  }

  function applyCollapsedState(collapsed, { persist = true } = {}) {
    if (!root) {
      return;
    }

    panelLayout.collapsed = collapsed;
    root.classList.toggle('vc-collapsed', collapsed);
    root.classList.toggle('vc-expanded', !collapsed);

    const fab = root.querySelector('#vc-fab');

    if (fab) {
      fab.setAttribute('aria-label', collapsed ? 'Open VeoPanel controls' : 'VeoPanel controls open');
      fab.title = collapsed ? 'Open VeoPanel controls' : 'VeoPanel controls open';
    }

    if (persist) {
      savePanelLayout();
    }

    scheduleLayoutApply();

    if (settleLayoutTimeout) {
      window.clearTimeout(settleLayoutTimeout);
    }

    settleLayoutTimeout = window.setTimeout(() => {
      settleLayoutTimeout = 0;
      applyPanelLayout();
    }, 240);
  }

  function setStatus(message) {
    if (!statusEl) {
      return;
    }

    statusEl.textContent = message;
  }

  function readDeltaSeconds() {
    const input = root?.querySelector('#vc-seconds');
    const value = Number(input?.value);

    if (!Number.isFinite(value) || value <= 0) {
      if (input) {
        input.value = String(DEFAULT_DELTA_SECONDS);
      }

      return DEFAULT_DELTA_SECONDS;
    }

    return Math.floor(value);
  }

  function updateQuickSkipLabels() {
    if (!root) {
      return;
    }

    const backLabel = root.querySelector('#vc-back-label');
    const forwardLabel = root.querySelector('#vc-forward-label');

    if (backLabel) {
      backLabel.textContent = `Back ${quickSkipSeconds}s`;
    }

    if (forwardLabel) {
      forwardLabel.textContent = `Forward ${quickSkipSeconds}s`;
    }
  }

  function updatePlayPauseButton(video = getTargetVideo()) {
    if (!root) {
      return;
    }

    const label = root.querySelector('#vc-toggle-label');
    const icon = root.querySelector('#vc-toggle-icon');
    const button = root.querySelector('#vc-toggle-play');

    if (!label || !icon || !button) {
      return;
    }

    const isPaused = !video || video.paused;
    label.textContent = isPaused ? 'Play' : 'Pause';
    icon.innerHTML = isPaused ? ICONS.play : ICONS.pause;
    button.dataset.state = isPaused ? 'play' : 'pause';
  }

  function updateSpeedDisplay(video = getTargetVideo()) {
    if (!root) {
      return;
    }

    const speedResetBtn = root.querySelector('#vc-speed-reset');
    if (!speedResetBtn) {
      return;
    }

    const rate = video && Number.isFinite(video.playbackRate) ? video.playbackRate : 1.0;
    speedResetBtn.textContent = `${rate}x`;
  }

  function applyPanelLayout() {
    if (!root) {
      return;
    }

    const rect = root.getBoundingClientRect();
    const width = Math.max(Math.round(rect.width), panelLayout.collapsed ? 60 : 260);
    const height = Math.max(Math.round(rect.height), panelLayout.collapsed ? 60 : 200);
    const maxOffsetX = Math.max(DRAG_MARGIN, window.innerWidth - width - DRAG_MARGIN);
    const maxOffsetY = Math.max(DRAG_MARGIN, window.innerHeight - height - DRAG_MARGIN);

    panelLayout.offsetX = clamp(panelLayout.offsetX, DRAG_MARGIN, maxOffsetX);
    panelLayout.offsetY = clamp(panelLayout.offsetY, DRAG_MARGIN, maxOffsetY);

    root.style.left = 'auto';
    root.style.right = 'auto';
    root.style.top = 'auto';
    root.style.bottom = 'auto';

    if (panelLayout.anchorX === 'left') {
      root.style.left = `${panelLayout.offsetX}px`;
    } else {
      root.style.right = `${panelLayout.offsetX}px`;
    }

    if (panelLayout.anchorY === 'top') {
      root.style.top = `${panelLayout.offsetY}px`;
    } else {
      root.style.bottom = `${panelLayout.offsetY}px`;
    }
  }

  function enableDragging(panel, handles) {
    let dragState = null;

    for (const dragHandleElement of handles) {
      dragHandleElement.addEventListener('pointerdown', onPointerDown);
    }

    function onPointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      if (event.currentTarget.id !== 'vc-fab' && event.target.closest('button, input')) {
        return;
      }

      const rect = panel.getBoundingClientRect();

      dragState = {
        pointerId: event.pointerId,
        pointerTarget: event.currentTarget,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: rect.left,
        originTop: rect.top,
        width: rect.width,
        height: rect.height,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        nextLeft: rect.left,
        nextTop: rect.top,
        moved: false,
        frameHandle: 0,
      };

      panel.classList.add('vc-dragging');
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.setProperty('--vc-drag-x', '0px');
      panel.style.setProperty('--vc-drag-y', '0px');

      const pointerTarget = dragState.pointerTarget;

      if (pointerTarget && typeof pointerTarget.setPointerCapture === 'function') {
        pointerTarget.setPointerCapture(event.pointerId);
      }

      document.addEventListener('pointermove', onPointerMove, true);
      document.addEventListener('pointerup', onPointerUp, true);
      document.addEventListener('pointercancel', onPointerUp, true);
      event.preventDefault();
    }

    function onPointerMove(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      const nextLeft = clamp(event.clientX - dragState.offsetX, DRAG_MARGIN, window.innerWidth - dragState.width - DRAG_MARGIN);
      const nextTop = clamp(event.clientY - dragState.offsetY, DRAG_MARGIN, window.innerHeight - dragState.height - DRAG_MARGIN);

      dragState.moved =
        dragState.moved ||
        Math.abs(event.clientX - dragState.startX) > 3 ||
        Math.abs(event.clientY - dragState.startY) > 3;

      dragState.nextLeft = nextLeft;
      dragState.nextTop = nextTop;
      scheduleDragFrame();
    }

    function onPointerUp(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      const currentDragState = dragState;
      const moved = dragState.moved;
      const finalLeft = dragState.nextLeft;
      const finalTop = dragState.nextTop;
      dragState = null;

      if (currentDragState.frameHandle) {
        window.cancelAnimationFrame(currentDragState.frameHandle);
      }

      const pointerTarget = currentDragState.pointerTarget;

      if (pointerTarget && typeof pointerTarget.releasePointerCapture === 'function') {
        try {
          pointerTarget.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Ignore release errors when the pointer capture has already been cleared.
        }
      }

      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);

      if (!moved) {
        panel.style.setProperty('--vc-drag-x', '0px');
        panel.style.setProperty('--vc-drag-y', '0px');
        panel.classList.remove('vc-dragging');
        applyPanelLayout();
        return;
      }

      panel.style.left = `${finalLeft}px`;
      panel.style.top = `${finalTop}px`;
      panel.style.setProperty('--vc-drag-x', '0px');
      panel.style.setProperty('--vc-drag-y', '0px');
      panel.classList.remove('vc-dragging');
      lastDragEndedAt = performance.now();
      persistDraggedPosition();
    }

    function scheduleDragFrame() {
      if (!dragState || dragState.frameHandle) {
        return;
      }

      dragState.frameHandle = window.requestAnimationFrame(() => {
        if (!dragState) {
          return;
        }

        dragState.frameHandle = 0;
        panel.style.setProperty('--vc-drag-x', `${dragState.nextLeft - dragState.originLeft}px`);
        panel.style.setProperty('--vc-drag-y', `${dragState.nextTop - dragState.originTop}px`);
      });
    }
  }

  function persistDraggedPosition() {
    if (!root) {
      return;
    }

    const rect = root.getBoundingClientRect();
    const leftDistance = rect.left;
    const rightDistance = window.innerWidth - rect.right;
    const topDistance = rect.top;
    const bottomDistance = window.innerHeight - rect.bottom;

    panelLayout.anchorX = leftDistance <= rightDistance ? 'left' : 'right';
    panelLayout.offsetX = Math.round(panelLayout.anchorX === 'left' ? leftDistance : rightDistance);
    panelLayout.anchorY = topDistance <= bottomDistance ? 'top' : 'bottom';
    panelLayout.offsetY = Math.round(panelLayout.anchorY === 'top' ? topDistance : bottomDistance);

    applyPanelLayout();
    savePanelLayout();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function isTypingTarget(target) {
    if (!target) {
      return false;
    }

    const tagName = target.tagName?.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
  }

  function hasPlainHotkeyModifiers(event) {
    return !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
  }

  function consumeHotkeyEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function handleHotkeys(event) {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (!getTargetVideo()) {
      return;
    }

    if (hasPlainHotkeyModifiers(event) && event.code === 'Space') {
      consumeHotkeyEvent(event);
      togglePlayPause();
      return;
    }

    if (hasPlainHotkeyModifiers(event) && event.key === 'ArrowRight') {
      consumeHotkeyEvent(event);
      shiftVideo(quickSkipSeconds);
      return;
    }

    if (hasPlainHotkeyModifiers(event) && event.key === 'ArrowLeft') {
      consumeHotkeyEvent(event);
      shiftVideo(-quickSkipSeconds);
      return;
    }

    if (event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && event.key === '>') {
      consumeHotkeyEvent(event);
      changeSpeed(0.25);
      return;
    }

    if (event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && event.key === '<') {
      consumeHotkeyEvent(event);
      changeSpeed(-0.25);
      return;
    }
  }

  function handleHotkeyKeyup(event) {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (!getTargetVideo()) {
      return;
    }

    if (hasPlainHotkeyModifiers(event) && event.code === 'Space') {
      consumeHotkeyEvent(event);
    }
  }
})();
