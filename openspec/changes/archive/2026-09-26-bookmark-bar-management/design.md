## Context

See proposal.md - Why. The browser shell currently stores a flat per-profile list of HTTP(S) bookmarks. The main process owns persistence and URL normalization; the renderer owns the toolbar and themed input/confirmation dialogs.

## Goals / Non-Goals

**Goals:** Keep the existing bookmark list compatible while adding a folder hierarchy, saved favicon addresses, and browser-shell context menus.

**Non-Goals:** Importing/exporting bookmarks, drag-and-drop ordering, browser synchronization, and managing the Chromium bookmark database.

## Decisions

- Store folders and links as typed records in the existing per-profile bookmark array. Use parent IDs for hierarchy; records without a parent remain at the root, preserving existing data.
- Validate every write in the main process. Link records require unique IDs and valid HTTP(S) URLs; folder parents must refer to an existing folder. Folder deletion removes descendants in the same state update.
- Fetch icon resources through the current profile's Electron `Session.fetch` API, cap their size, and persist bounded image data URLs. Try the link origin's `/favicon.ico` when the page icon is unavailable; this keeps icon requests on the profile's proxy session instead of the shell window's default session.
- Render toolbar menus in the browser shell so they match the app theme and can open the existing app dialogs. Suppress the native context menu only for toolbar items and blank toolbar areas.
- Expose narrow create/update/delete IPC methods through the existing preload bridge rather than allowing the renderer to mutate profile state directly.

## Risks / Trade-offs

- A site may remove or block an icon URL → keep a default icon visible and retain the saved bookmark.
- A malformed legacy record may refer to a missing folder → normalize it to the root during reads and writes.
- Recursive folder deletion can remove many links → require an explicit confirmation when the folder is non-empty.

## Migration Plan

No destructive migration is required. The normalizer treats existing bookmark records as root-level links; new fields are written only when users create or edit entries. The prior representation remains readable after rollback.
