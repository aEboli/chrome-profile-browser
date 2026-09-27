## Context

See proposal.md - Why. The renderer currently records only a short, in-memory address suggestion list. Browser profile records are persisted by the main process, and the shell preload exposes profile-scoped IPC through `shellHandle`.

## Goals / Non-Goals

**Goals:** Persist minimal visit counts per profile, return a bounded ranked list to that profile's shell, and keep the existing settings-backed manual shortcuts intact.

**Non-Goals:** Importing Chromium/system history, retaining full navigation URLs or page titles, changing how the manual add dialog works, or synchronizing visit data between profiles.

## Decisions

- Store visit summaries on the existing profile record and normalize them in a small main-process module. This follows the existing profile-scoped bookmark ownership and lets profile deletion remove the data with the profile; renderer `localStorage` would require a separate cleanup path and would be cleared under a different storage lifecycle.
- Record only committed main-frame navigations reported by the browser shell. Ignore in-page route changes so one single-page application session does not inflate its count. The main process canonicalizes to the website origin and rejects unsupported or local addresses; page paths, queries, fragments, titles, and credentials never enter persistent state.
- Require two visits while a host record is active, expire it after 90 days without a visit, retain at most 100 host records, and return the top six by visit count and recency. The threshold prevents one-off navigation from appearing; bounded age and size keep profile state small.
- Return only generated shortcut records over a profile-scoped IPC method. Place them before configured shortcuts and suppress host duplicates in the renderer, so settings remain the single source of truth for manually maintained entries.
- Clear the current profile's visit summaries together with its browsing data. This matches user expectations that private browsing activity cleanup also resets the automatic suggestions.

## Risks / Trade-offs

- [A site may use several subdomains for one product] → Count by normalized hostname while collapsing only the conventional `www.` prefix; avoid an unmaintained public-suffix database.
- [A navigation may be submitted without a successful page commit] → Record only the guest's main-frame `did-navigate` event, not address-form submissions or in-page URL changes.
- [The main state file gains browsing-derived metadata] → Store only host-level counters and timestamps, enforce per-profile bounds, exclude the field from the public profile snapshot, and clear it with profile browsing data.

## Migration Plan

No migration is needed. Existing profiles without visit summaries behave as before and continue showing configured shortcuts. New records are created as qualifying navigations occur. Rollback can ignore the optional profile field; removing a profile or clearing its browsing data removes it.
