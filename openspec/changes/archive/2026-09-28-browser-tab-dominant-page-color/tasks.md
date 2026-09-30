## 1. OpenSpec and state model

- [x] 1.1 Record the page dominant color capability, fallback behavior, and affected tab highlighter contract.
- [x] 1.2 Add per-tab page color state and a navigation/load generation guard.

## 2. Renderer implementation

- [x] 2.1 Capture loaded webview pages and calculate a quantized dominant color from the screenshot.
- [x] 2.2 Ignore stale or failed asynchronous results and keep favicon/theme fallback colors.
- [x] 2.3 Apply the dominant color and contrast-aware text color to the active tab surface.

## 3. Verification

- [x] 3.1 Extend browser shell regression checks for capture, generation reset, and CSS mappings.
- [x] 3.2 Run targeted tests, full test suite, syntax checks, and strict OpenSpec validation.
