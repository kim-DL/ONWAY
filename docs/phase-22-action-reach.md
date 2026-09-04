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
- The initial review used a preview deployment. On 2026-09-05 the user changed the release decision to direct production deployment after verification; further preview review is not required. Automated write verification still uses emulators only.

## Production follow-up — login diagnostics and control feedback

- Read-only inspection confirmed six preview login requests returned HTTP 401 before PIN handling: App Check was missing, while the preceding preflight requests returned 204. The preview hostname was not registered for the production reCAPTCHA Enterprise key; `onnuriway.vercel.app` is registered. App Check enforcement and domain restrictions remain unchanged.
- PIN submission now verifies App Check first, using the SDK cache rather than forcing new assessments. A stalled check is bounded to 12 seconds. Failed verification never sends a PIN to the login callable.
- PIN mismatch, rate limiting, connection failure, storage failure and custom-token exchange failure have separate safe messages. SDK messages and credentials are not exposed. PIN mismatch and disabled-account responses remain indistinguishable.
- The login form stays mounted during token exchange; failed administrator sign-in retains its message across the loading screen. Synchronous submission locking prevents overlapping PIN and Google sign-in.
- Shared controls retain the existing layout and Toss-blue palette, with stronger keyboard focus, distinguishable disabled/busy feedback, forced-color support and stationary controls when reduced motion is requested.
- `scripts/audit-preview-login-readonly.mjs` provides bounded domain/log diagnostics and rejects `--apply`. Its output is limited to status, timestamps, hostnames and verification enums; it never prints PINs, tokens, request bodies or raw log messages.
- Production configuration was read without modification: all required Firebase public values and the App Check key are present; emulator mode is off and no public debug token is configured. Production must be rebuilt using production environment variables, not promoted from the preview build.

Authentication browser checks run with `ONNURIWAY_E2E_UX_SUITE=auth npm run test:e2e:ux`. They cover persisted sign-in, logout, rejection/rate limiting, revoked access, accessibility, service failure and failed token-exchange recovery. App Check provider failures are unit tested; emulator tests do not prove real-browser attestation or staff PIN login on production.

Follow-up verification: **274 unit tests passed, 3 NEIS cases skipped**; **7 authentication browser cases passed**; **10 mobile-action/browser regressions passed**; **10 standalone shared-control browser cases passed**. Full typecheck and lint passed. The production-built emulator login page was also visually inspected using an independent browser: no blank screen, framework overlay or browser errors were observed.

Technical reference: [Firebase App Check for web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [cached App Check token API](https://firebase.google.com/docs/reference/js/app-check#gettoken).

## References

- [MDN: dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
- [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [MDN: VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
- [MDN: native form association](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/form)
