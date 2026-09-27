## Context

See proposal.md - Why. `profile:save` currently rejects every update to a running profile. Electron window title and shell identity are initialized at launch, while external Chromium receives its startup URL only as a process argument.

## Goals / Non-Goals

**Goals:** Allow only name and startup URL changes while a profile is running or transitioning through launch/stop. Keep the current page stable and ensure a launch already in progress picks up the latest metadata.

**Non-Goals:** Change the active tab URL, restart an external process, or allow connection, authorization, or other profile settings to change live.

## Decisions

- Compare normalized configuration fields before accepting a save during runtime. Name and startup URL are excluded; connection, note, color, bookmarks, and test identity remain protected.
- Send a narrow profile-details event to the matching Electron shell and update its native window title in the main process. Keep renderer access to this event read-only through the existing preload pattern.
- Re-read the stored name and startup URL before the Electron shell is created so edits made during asynchronous launch setup are not lost. External Chromium consumes the latest saved URL when its process arguments are constructed.
- Do not navigate an existing tab on save; a startup URL describes the next launch.

## Risks / Trade-offs

- A profile save can race with launch setup. Treat pending launch/stop operations as active for protected-field validation and re-read metadata immediately before creating the Electron shell.
- An external Chromium title cannot be changed through its launch process interface; the manager state updates immediately and the new title is used on its next process launch.

## Migration Plan

No data migration is required. The existing profile fields remain unchanged; the new preload event is optional for older renderer code during application upgrades.
