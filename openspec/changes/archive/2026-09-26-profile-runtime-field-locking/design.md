## Context

See `proposal.md` for the user-facing problem. The renderer receives persisted profile status and transient operation status in `appState.profileStatuses`. The main process already rejects runtime configuration changes for active environments, while HTML form serialization omits disabled controls.

## Goals / Non-Goals

**Goals:** Keep the form state aligned with profile status changes and preserve locked values when saving allowed metadata edits.

**Non-Goals:** Change the main-process save contract or profile data model.

## Decisions

- Centralize the protected-field lock in the renderer and refresh it when the form is filled and whenever the UI renders. This covers opening the editor and status changes while it remains open.
- Disable the three protected controls and place an accessible, full-field button above each one. Disabled controls prevent keyboard edits; the button keeps the locked surface clickable and displays the lock affordance.
- Read protected values from their DOM controls when saving. Disabled controls are omitted from `FormData`, so reading them directly preserves the existing configuration during name or URL edits.
- Keep the main-process validation unchanged as the authoritative guard for races or crafted requests.

## Risks / Trade-offs

- Disabled form fields are not serialized → Read their current values directly before calling the existing save API.
- A runtime transition can race with a save → Keep the existing main-process rejection and error feedback.

## Migration Plan

No data migration is needed. The behavior is limited to the manager form and takes effect with the application update.
