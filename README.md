# Fullscreen Video Controls (Chrome Extension)

Adds a draggable floating control panel for HTML5 videos in the active tab.

## Features

- Skip forward/backward by 10 seconds
- Custom jump by user-defined seconds
- Play/Pause toggle
- Keyboard shortcuts:
  - Left Arrow: back 10s
  - Right Arrow: forward 10s
  - Space: play/pause
- Draggable panel with quick hide button

## Permissions (publish-ready)

- `activeTab`: Runs only when user clicks the extension.
- `scripting`: Injects content script/style only on demand.

No broad host permissions are used.

## Local test

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder
5. Open a website with an HTML5 video
6. Click the extension icon, then click **Toggle Control Panel**

## Chrome Web Store publish checklist

1. Confirm version in `manifest.json` is updated.
2. Verify all icons exist (16, 32, 48, 128).
3. Zip the extension contents (not parent folder):
   - `manifest.json`
   - `popup.html`, `popup.js`, `popup.css`
   - `content.js`, `content.css`
   - `icons/`
   - `PRIVACY.md`
4. In Developer Dashboard:
   - Upload zip
   - Add description and screenshots
   - Add privacy policy URL/content based on `PRIVACY.md`
   - Fill "Data usage" as no collection/no sale/no transfer (if still true)
5. Submit for review.

## Notes

- Works on pages that expose a standard `<video>` element.
- Browser internal pages (for example `chrome://`) are not supported.
