(() => {
  if (window.__videoControlInjected) {
    return;
  }
  window.__videoControlInjected = true;

  const ROOT_ID = 'vc-root';
  const DEFAULT_SKIP_SECONDS = 10;

  let root;
  let statusEl;

  function getTargetVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;

    const fullscreenElement = document.fullscreenElement;

    if (fullscreenElement) {
      const fullVideo = fullscreenElement.matches?.('video')
        ? fullscreenElement
        : fullscreenElement.querySelector?.('video');
      if (fullVideo) return fullVideo;
    }

    const visible = videos
      .filter((video) => {
        const rect = video.getBoundingClientRect();
        return rect.width > 120 && rect.height > 70 && getComputedStyle(video).visibility !== 'hidden';
      })
      .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);

    return visible[0] || videos[0];
  }

  function clampToVideo(video, time) {
    const max = Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER;
    return Math.min(Math.max(time, 0), max);
  }

  function shiftVideo(seconds) {
    const video = getTargetVideo();
    if (!video) {
      setStatus('No video tag found on this page.');
      return;
    }

    const nextTime = clampToVideo(video, video.currentTime + seconds);
    video.currentTime = nextTime;

    const direction = seconds >= 0 ? '+' : '';
    setStatus(`Moved ${direction}${seconds}s • ${Math.floor(video.currentTime)}s / ${formatDuration(video.duration)}`);
    updatePlayPauseButton(video);
  }

  function togglePlayPause() {
    const video = getTargetVideo();
    if (!video) {
      setStatus('No video tag found on this page.');
      return;
    }

    if (video.paused) {
      const maybePromise = video.play();
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {
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
    if (!Number.isFinite(seconds)) return '--:--';

    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    const m = Math.floor((seconds / 60) % 60)
      .toString()
      .padStart(2, '0');
    const h = Math.floor(seconds / 3600);

    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  }

  function createControlPanel() {
    root = document.createElement('section');
    root.id = ROOT_ID;

    root.innerHTML = `
      <div class="vc-header" id="vc-drag-handle">
        <span class="vc-title">Video Control Panel</span>
        <button class="vc-close" id="vc-close" title="Hide panel">✕</button>
      </div>
      <div class="vc-body">
        <div class="vc-row">
          <button class="vc-btn" id="vc-back">⏪ Back 10s</button>
          <button class="vc-btn" id="vc-forward">Forward 10s ⏩</button>
        </div>

        <div class="vc-row">
          <button class="vc-btn" id="vc-toggle-play">⏸ Pause</button>
        </div>

        <div class="vc-input-wrap">
          <input class="vc-input" id="vc-seconds" type="number" min="1" step="1" value="50" />
          <button class="vc-input-btn" id="vc-minus">- Seconds</button>
          <button class="vc-input-btn" id="vc-plus">+ Seconds</button>
        </div>

        <div class="vc-meta">
          <span class="vc-badge" id="vc-status">Ready</span>
        </div>

        <div class="vc-meta">
          Hotkeys: <strong>←</strong> back 10s, <strong>→</strong> forward 10s, <strong>Space</strong> play/pause
        </div>
      </div>
    `;

    document.documentElement.appendChild(root);

    statusEl = root.querySelector('#vc-status');

    root.querySelector('#vc-back').addEventListener('click', () => shiftVideo(-DEFAULT_SKIP_SECONDS));
    root.querySelector('#vc-forward').addEventListener('click', () => shiftVideo(DEFAULT_SKIP_SECONDS));
    root.querySelector('#vc-toggle-play').addEventListener('click', () => togglePlayPause());

    root.querySelector('#vc-minus').addEventListener('click', () => {
      const delta = readDeltaSeconds();
      shiftVideo(-delta);
    });

    root.querySelector('#vc-plus').addEventListener('click', () => {
      const delta = readDeltaSeconds();
      shiftVideo(delta);
    });

    root.querySelector('#vc-close').addEventListener('click', () => {
      root.classList.add('vc-hidden');
    });

    enableDragging(root, root.querySelector('#vc-drag-handle'));
    updateFullscreenHint();
    updatePlayPauseButton();
  }

  function setStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message;
  }

  function readDeltaSeconds() {
    const input = root.querySelector('#vc-seconds');
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) {
      input.value = '50';
      return 50;
    }
    return Math.floor(value);
  }

  function updatePlayPauseButton(video = getTargetVideo()) {
    if (!root) return;

    const button = root.querySelector('#vc-toggle-play');
    if (!button) return;

    if (!video) {
      button.textContent = '⏸ Pause';
      return;
    }

    button.textContent = video.paused ? '▶ Play' : '⏸ Pause';
  }

  function togglePanel() {
    if (!root) {
      createControlPanel();
      setStatus('Panel opened.');
      return;
    }

    root.classList.toggle('vc-hidden');
    setStatus(root.classList.contains('vc-hidden') ? 'Panel hidden.' : 'Panel opened.');
    updateFullscreenHint();
  }

  function updateFullscreenHint() {
    if (!root || root.classList.contains('vc-hidden')) return;

    const full = Boolean(document.fullscreenElement);
    if (!full) {
      setStatus('Tip: Fullscreen a video, then use controls.');
    }
  }

  function enableDragging(panel, handle) {
    let startX = 0;
    let startY = 0;
    let dragging = false;

    handle.addEventListener('mousedown', (event) => {
      dragging = true;
      panel.classList.add('vc-dragging');

      const rect = panel.getBoundingClientRect();
      startX = event.clientX - rect.left;
      startY = event.clientY - rect.top;

      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp, { once: true });
    });

    function onMove(event) {
      if (!dragging) return;
      panel.style.left = `${event.clientX - startX}px`;
      panel.style.top = `${event.clientY - startY}px`;
    }

    function onUp() {
      dragging = false;
      panel.classList.remove('vc-dragging');
      document.removeEventListener('mousemove', onMove);
    }
  }

  function isTypingTarget(target) {
    if (!target) return false;

    const tag = target.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function handleHotkeys(event) {
    if (isTypingTarget(event.target)) return;

    if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && event.code === 'Space') {
      event.preventDefault();
      togglePlayPause();
      return;
    }

    if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && event.key === 'ArrowRight') {
      event.preventDefault();
      shiftVideo(DEFAULT_SKIP_SECONDS);
      return;
    }

    if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      shiftVideo(-DEFAULT_SKIP_SECONDS);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'VIDEO_CONTROL_TOGGLE') {
      togglePanel();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!root || root.classList.contains('vc-hidden')) return;
    updateFullscreenHint();
    updatePlayPauseButton();
  });

  document.addEventListener('keydown', handleHotkeys, true);
})();
