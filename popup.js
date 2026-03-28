const statusEl = document.getElementById('status');
const togglePanelBtn = document.getElementById('togglePanelBtn');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#ff9d9d' : '#93a0c7';
}

function isSupportedTab(tab) {
  if (!tab?.url) return false;
  return /^https?:\/\//i.test(tab.url);
}

async function injectIntoTab(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['content.css'],
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
}

async function sendToggleMessage(tabId) {
  await chrome.tabs.sendMessage(tabId, { type: 'VIDEO_CONTROL_TOGGLE' });
}

async function togglePanel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      setStatus('No active tab found.', true);
      return;
    }

    if (!isSupportedTab(tab)) {
      setStatus('This page is not supported. Open a normal website tab.', true);
      return;
    }

    try {
      await sendToggleMessage(tab.id);
      setStatus('Toggled panel on active page.');
    } catch {
      await injectIntoTab(tab.id);
      await sendToggleMessage(tab.id);
      setStatus('Controls are ready on this tab.');
    }
  } catch (error) {
    setStatus('Could not enable controls on this page.', true);
  }
}

togglePanelBtn.addEventListener('click', togglePanel);
