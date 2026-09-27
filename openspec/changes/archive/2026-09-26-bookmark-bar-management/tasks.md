## 1. Data and IPC

- [x] 1.1 Extend bookmark normalization to preserve root-level legacy links, folder records, parent IDs, and safe favicon URLs.
- [x] 1.2 Add main-process create, update, and recursive delete operations for folders and links with profile and URL validation.
- [x] 1.3 Add focused persistence and validation tests for folder hierarchy, duplicate URLs, invalid parents, recursive deletion, and legacy records.
- [x] 1.4 Expose only the required bookmark operations through the preload bridge.

## 2. Browser Shell

- [x] 2.1 Render saved website icons with `/favicon.ico` and default-icon fallbacks, and persist icons reported by loaded pages.
- [x] 2.2 Render folders and nested links; open folder contents from the toolbar.
- [x] 2.3 Add themed right-click menus for blank toolbar space, links, and folders, including open, create, edit, rename, and delete actions.
- [x] 2.4 Verify menu dismissal, keyboard escape behavior, accessible names, and narrow viewport placement.
- [x] 2.5 Add renderer regression coverage for favicon, folder, and context-menu behavior.

## 3. Specification and Verification

- [x] 3.1 Update the legacy bookmark-bar requirement in `openspec/spec.md` and retain the capability spec during archive.
- [x] 3.2 Run OpenSpec validation, focused tests, the project test/check commands available, and JavaScript syntax checks.
- [x] 3.3 Archive the completed OpenSpec change.
