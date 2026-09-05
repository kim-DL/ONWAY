# Phase 23 — compact, identifiable school cards

## Scope and design decisions

- Keep the current white/blue application theme. Color is limited to a 36px school-type mark: elementary book/blue, middle building/teal, high graduation cap/slate violet. Special and other schools have separate neutral glyphs and accessible labels; school type comes from catalog data, not the name suffix.
- Assigned cards: school name first, district once, primary/joint assignees inline, two delivery states plus visit state. Remove the large avatar panel, repeated school-level subtitle and empty-state footer. Keep the full name wrapping, route order, recent visit, and protected assignment-release behavior.
- Activity rows: school mark and name, then concise address plus visit state in one row. Preserve road numbers and district, fall back to lot address, retain original address in the title. The detailed school page remains unchanged.
- Correct existing presentation defects: `notDelivered` now says 미전달 instead of 미확인; recent-visit dates use Asia/Seoul explicitly.
- Fixed heights are not used. At 200% text, cards grow to preserve school names. Pointer targets, native button/checkbox behavior, focus outlines and reduced-motion preferences are retained.
- PWA runtime cache version advances to phase23. No database, permissions, authentication, assignment eligibility or route algorithm changes.

## Reference principles

- [W3C Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html): shape and accessible text accompany color, never color alone.
- [W3C Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): compaction must not shrink the actionable surface. Cards remain whole-surface targets and the manage checkbox hit area is 44px.
- [Material list overview](https://m3.material.io/components/lists/overview): consulted for list anatomy; implementation follows this app's existing typography, surfaces and interaction conventions.

## Verification — 2026-09-05

- Unit suite: 311 passed, 3 existing NEIS tests skipped. Includes 8 school-mark cases and 29 presentation-helper cases (3 delivery states, all districts, address fallbacks, Seoul date boundaries).
- ESLint and frontend/functions TypeScript checks passed.
- Production-build Firebase-emulator E2E: 12 passed. School scope, claim/release, route calculation, visit save/edit, own-school activity and access scoping retained.
- Actual React component browser suite: 12 passed across mobile/desktop Chromium. 320/390px layout, full long names, callbacks, managed selection, disabled protection, 200% text, reduced motion, keyboard and axe checks.
- Measured at 320px and 390px: ordinary assignment 108.39px, assignment with recent visit 136.39px, ordinary activity row 78px. Long names and larger text may increase these heights deliberately.
- Production service-worker/manifest/icon build verification passed. The initial checker still expected phase22; its expected version was updated alongside the phase23 cache constant and rerun successfully.
- Test data writes were confined to demo Firebase emulators. Real-device touch behavior is not claimed as tested.

## Release

User has requested direct production delivery, not preview. Deploy to the existing onnuriway Vercel project after final checks, retain the previous deployment as rollback. Production read-only smoke check and deployment identity are recorded after deployment.
