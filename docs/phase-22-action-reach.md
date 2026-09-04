# Phase 22 — reachable actions and focused mobile sheets

## Changes

- Route selection/results, bulk assignment, visits, field/contact editing, photos and communication tags use the same fixed action area.
- The sheet header and close control stay visible. Only the content scrolls; route and assignment lists no longer create nested scroll areas. Short sheets remain content-sized.
- Actions retain native form ownership with unique `form` IDs. Existing server validation, permissions, atomic writes and revisions are unchanged.
- Native modal dialogs preserve the workspace theme while making background content inert. Tab boundaries, connected-opener focus restoration, keyboard viewport sizing and reduced-motion preferences are respected.
- Owned sheet history is consumed on successful save and reused for StrictMode/lazy replacement. Busy sheets preserve their Back entry; repeated closing cannot pop the underlying page twice.
- The underlying school detail resets scroll only when its school ID changes, not when history restores an equivalent object.
- Assignment submission has a synchronous duplicate-request guard; failed submissions retain selections and show an in-sheet error. Bulk selection waits for deferred search to catch up.
- Field/contact and photo failures appear inside the fixed footer, not behind the modal in a toast. Normal failures retain drafts; revision conflicts keep existing refresh semantics and explain the refresh.
- Visit and communication-save errors also remain beside the retry action. Communication tags cannot change mid-save, and repeated save events are guarded synchronously.
- Missing-phone actions open the contact editor directly for an eligible employee; read-only or still-loading detail cannot open a blank editor.
- Administrator employee creation cannot be dismissed while saving, preserving the issued PIN result. Activity-tag editing and duplicate saves are locked during the pending request.
- Compact headers, smaller empty photo areas, 44px removal targets and single-column metric content at narrow widths improve density without changing the established palette.
- PWA cache generation is `phase22`; explicit icon precache entries now match the current v4 manifest icons.

## Verification

`npm run test:e2e:ux` builds production assets against isolated Firebase emulators and then runs the focused browser suite. Unlike the development runner, it is not subject to hot-reload chunk/manifest churn.

Focused suite: **10 passed** (Chromium, production build).

Final local gates passed: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:pwa:build`. Total browser coverage across the three runs: **20 passed**. Production-build login smoke rendered correctly with no browser errors. No live school data was written by these checks.

Existing sales regression suite: **7 passed**, including real callable responses, assignment claim/release, default route selection, 16-school recovery and permission checks. Tests wait for successful server responses before checking completion feedback; the owned claim fixture is cleaned up even when an assertion fails.

Existing visit regression suite: **3 passed**, including new visit persistence, editing with the original values, follow-up data, revisions and authorization. Full unit suite: **248 passed, 3 skipped** (the skipped cases require their separate NEIS emulator suite).

- 16 schools: calculate/apply visible at top, middle and end; final row not covered; result/selection focus reset.
- 300-school assignment: single content scroller; fully visible action at 390px and 320px widths, including 320×420; Tab/Shift+Tab loop; no serious/critical axe findings in the picker.
- Duplicate submission sends one request; busy Back is retained; explicit failure is readable; selection survives retry.
- Three successful contact saves followed by one Back return to the school list, without duplicate history steps.
- Visit native submit association, required validation and draft retention across scrolling.
- Full field editor native submit, real emulator persistence, then restoration through the UI without rewinding revisions.
- Contact and photo failure feedback, photo optimization readiness and selected file/caption retention.
- Communication selection/cancel behavior; existing brand/navigation smoke.

Retained unit checks include six owned-history lifecycle cases and three school-scroll dependency cases. UI screenshots are generated under `output/playwright/phase22-form-actions/` (ignored local test artifacts).

Additional unit checks cover four administrator pending-save cases, three communication save/retry cases and four missing-phone/permissions states.
Five picker regressions cover actionable error forwarding, generic fallback, retained selection, retry and close/remount boundaries.

## Verification boundaries

- Viewport resizing verifies available-space behavior, not every physical keyboard or Android/iOS PWA host. Physical-device keyboard, system Back and OS-level screen-reader checks remain release QA follow-ups.
- Browser failure responses are deliberately injected for deterministic recovery tests. Field persistence and route calculation also exercise real emulator handlers; no test writes to production school data.
- This change unifies the operational bottom sheets. School search, photo viewing and the administrator's separate dialog layouts were reviewed but are not replaced wholesale by this component.
- No database schema, security rules or production assignments are changed.
- Deployment is preview-only at the user's request. The project's existing preview configuration uses the production Firebase project; viewing the preview does not change the live UI, but a user saving there will change real data. Automated write verification uses emulators only.

## References

- [MDN: dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
- [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [MDN: VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
- [MDN: native form association](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/form)
