## 1. Runtime Save Behavior

- [x] 1.1 Permit only name and startup URL changes while the profile runtime is active; keep other profile configuration protected.
- [x] 1.2 Treat launch and stop transitions as active when validating protected fields.
- [x] 1.3 Refresh metadata before creating the Electron shell so launch-time edits are applied.

## 2. Live Synchronization

- [x] 2.1 Update the Electron native window title and broadcast profile metadata after save.
- [x] 2.2 Update shell identity and its saved startup URL without navigating the active page.
- [x] 2.3 Keep external Chromium running and use the new startup URL on its next launch.

## 3. Specification and Verification

- [x] 3.1 Add focused lifecycle regression coverage for allowed and protected edits.
- [x] 3.2 Update `openspec/spec.md` and validate the change and specs with OpenSpec.
- [x] 3.3 Run focused tests and JavaScript syntax checks.
