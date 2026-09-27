## 1. Recognition Rules

- [x] 1.1 Add pure helpers to canonicalize eligible website origins, normalize bounded profile visit records, increment visits, and rank recommendations.
- [x] 1.2 Add focused tests for URL filtering, visit thresholds, 90-day expiry, ranking, record limits, and configured-host deduplication.

## 2. Profile Persistence and IPC

- [x] 2.1 Preserve normalized visit summaries on profile saves without exposing them in public profile snapshots or treating them as profile launch settings.
- [x] 2.2 Add profile-scoped IPC to read ranked recommendations and record a committed site visit.
- [x] 2.3 Clear only the current profile's visit summaries when its browsing data is cleared.

## 3. New Tab Integration

- [x] 3.1 Expose the narrow read/record methods through the shell preload.
- [x] 3.2 Record committed main-frame navigations and refresh open new-tab pages with the returned recommendations.
- [x] 3.3 Render automatic entries before manual entries, suppress duplicate hosts, and retain the existing add/settings flows.
- [x] 3.4 Add browser-shell regression checks for preload wiring, navigation tracking, ordering, and unchanged manual controls.

## 4. Specification and Verification

- [x] 4.1 Validate the OpenSpec change and keep its behavior requirements aligned with implementation.
- [x] 4.2 Run focused and project-wide tests plus JavaScript syntax checks.
- [x] 4.3 Archive the completed change and update the main OpenSpec specification.
