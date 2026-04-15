const SETTINGS_KEY = 'defaultSkipSeconds';
const DEFAULT_SKIP_SECONDS = 10;

const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('saveBtn');
const defaultSkipInput = document.getElementById('defaultSkipSeconds');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#ff9d9d' : '#93a0c7';
}

function sanitizeSeconds(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return DEFAULT_SKIP_SECONDS;
  }

  return Math.min(Math.floor(numericValue), 600);
}

function loadSettings() {
  chrome.storage.sync.get({ [SETTINGS_KEY]: DEFAULT_SKIP_SECONDS }, (result) => {
    defaultSkipInput.value = String(sanitizeSeconds(result?.[SETTINGS_KEY]));
    setStatus('Large player detection is enabled.');
  });
}

function saveSettings() {
  const defaultSkipSeconds = sanitizeSeconds(defaultSkipInput.value);
  defaultSkipInput.value = String(defaultSkipSeconds);

  chrome.storage.sync.set({ [SETTINGS_KEY]: defaultSkipSeconds }, () => {
    setStatus(`Saved. Quick skip is now ${defaultSkipSeconds}s.`);
  });
}

saveBtn.addEventListener('click', saveSettings);
loadSettings();
