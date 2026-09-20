# Firebase Hosting migration — updated 2026-09-12

## Released September 12, 23:34 KST

- **Inventory is enabled in production.** Ignored `.env.production.local` now persists `NEXT_PUBLIC_ENABLE_INVENTORY=true`; the final build passed acceptance and was deployed with `--project onnuriway --only hosting`. Firebase Console shows release suffix `fe2ce6` at 23:34 KST.
- Final worker SHA-256: `d4e49b03a79722c8a24d8e0a2be29fdaba3efa0c41071fdc142a3b1ccdbeb3d0`. Remote worker-hash and all 25 public-resource checks passed on **both** `https://onnuriway.com` and `https://onnuriway.web.app`.
- `https://www.onnuriway.com/` now returns **301 → https://onnuriway.com/** with valid HTTPS. Firebase Console shows www connected. The earlier edge 404 no longer reproduces after the release.
- The existing apex PWA showed the update notice, applied the new release on selection, retained the administrator session, and loaded live inventory context and its empty catalog. Default Friday / seven-day expiry settings, calculator `2*8+3 = 19`, product editor, and return/focus behavior were verified without saving production products or settings.
- Existing customer data, private photo (1070×1274), and all 12 Kakao map images decoded on the final release. The editor was cancelled without saving. Captured warning/error logs were empty.
- Final static production-mode E2E: **5/5 pass**, including full inventory movements/photos, permissions, offline drafts, and 1,000 active / 100 deleted items. Geometry checks cover 360/768/1280px and sticky-action clearance. These tests ran only against isolated demo emulators; original production build artifacts were verified unchanged by the harness.
- Final unit tests: **1,153 pass / 7 environment-specific skips**; actual Firestore tests **4/4 pass** separately. TypeScript, ESLint, PWA, bundle performance, Hosting and verifier self-tests passed. Inventory adds a lazy-loaded 17,880-byte gzip JS chunk and 2,678-byte gzip stylesheet.
- Read-only live audit confirms Firestore and Storage rules match local files; necessary inventory single-field indexes are READY. No additional rules/index deployment was needed.
- Remaining: Firebase's apex DNS status still reflects its 23:00 KST check of old A records despite correct authoritative DNS and successful live HTTPS/hash checks. Do not edit correct records again or claim global propagation is complete. Phone camera/album/keyboard/installed-PWA behavior still requires physical-device verification.

## September 12 continuation

- Both apex and www certificates reached `CERT_ACTIVE` with no certificate issues before DNS changes.
- HostingKR web records were switched: `A @ 199.36.158.100`, `CNAME www onnuriway.web.app`, TTL 180. Removed the obsolete second Vercel A record `64.29.17.1`; the previous values below remain the rollback reference. Nameservers and all three TXT verification records are unchanged.
- HostingKR UI confirms five total records; all four authoritative nameservers return the new A/CNAME at SOA serial 10. Recursive resolvers may still cache the old A records. Google Public DNS cache flush requests for the apex A and www CNAME completed successfully; this does not establish global propagation.
- Apex passed all 25 HTTPS/public asset/worker-hash checks against Firebase release `a40b90a0dc405f96`. Existing PWA displayed an update notice and applied the release on explicit selection.
- Google administrator login succeeded at `https://onnuriway.com`; existing customer list, private photo (1070×1274), and 12 Kakao map images loaded successfully. Customer editor was cancelled without saving data.
- `www` initially returned HTTPS 404 while Firebase awaited CNAME ownership reconciliation. At 23:13 KST its host, ownership, and certificate were all ACTIVE and Google DNS returned the new CNAME. Final post-release validation at 23:34 KST returned the expected 301 redirect.
- All 14 inventory Functions were redeployed successfully with the corrected location-specific `stockChangedSinceCount` contract. Four actual Firestore emulator tests passed, including concurrent stock edits, count freshness, unit-change conflicts, and direct-client access denial.
- Inventory was kept OFF until the full browser flow passed; the 23:34 KST release above enabled it separately from the Functions deployment.

## September 10 baseline (historical)

- Existing project/site: `onnuriway`, project number `347044588399`.
- Firebase Hosting release: `a40b90a0dc405f96` (final Hosting-only release after the initial `07be0654e73d6af2`).
- Default HTTPS origin: `https://onnuriway.web.app`.
- Static Next export, build, PWA build gate and performance gate passed.
- Remote public-resource gate passed: 25 GET/HEAD checks, including uncached connectivity, worker/manifest MIME, hashed assets and private/missing-resource 404s.
- `npm start` now serves the static export on loopback using Firebase's installed Superstatic engine. The production-mode Phase 9/16/17 test runners use this helper instead of unsupported `next start`; all 25 resource checks also passed locally on port 3146. These checks do not claim the full historical browser suites were rerun.
- Worker SHA-256: `e333c136f7b8f7113a11c40e04ad3ecd6bf7451956f52ef7f2c55c091d2cad39`.
- Final export has 97 shipped public files and 68 precached assets. Remote public-resource/hash checks passed again on this release.
- Google administrator sign-in succeeded on the Firebase origin; existing admin dashboard loaded real server data.
- On the continuation turn, the user verified existing employee PIN sign-in on their phone at `https://onnuriway.web.app` and reported `로그인됩니다`. This is user-verified live PIN login, not an automated native-device test.
- Full reload retained the approved Google administrator session and refreshed the dashboard from the server. Captured browser warning/error logs were empty during the verified session.
- Desktop PWA update flow passed on the final release: the existing session displayed the update notice, selecting `업데이트` reloaded safely, administrator data returned, and the document loaded the final `webpack-92abf47da8f80eef.js` bundle without warning/error logs. This is not a phone installation/camera/keyboard test.
- Existing customer editor loaded its private foreground photo (decoded 1070×1274) and all nine Kakao map tiles. Opened read-only and cancelled without saving customer data.
- Inventory feature flag remains OFF on this Hosting release. On the continuation turn, 14 inventory Functions were deployed separately and their ACTIVE state was verified; employee UI remains gated until end-to-end acceptance passes.
- Existing public Kakao JavaScript configuration recovered from the currently served app bundle into ignored `.env.production.local`. No new key was created. Existing Firebase configuration/authDomain remains unchanged.
- Kakao JS SDK domains retain apex/Vercel and add `https://onnuriway.web.app` for validation. Firebase Auth/App Check already allow the Firebase default origin and apex.

## September 10 DNS preparation (historical, before cutover)

HostingKR nameservers remain `ns1.hosting.co.kr` through `ns4.hosting.co.kr`. No mail records were present, and no unrelated records/settings were altered.

Added DNS verification records, TTL 180:

| Type | Host | Purpose |
| --- | --- | --- |
| TXT | @ | `hosting-site=onnuriway`, retained for ownership/renewal |
| TXT | _acme-challenge | Certificate challenge supplied by Firebase |
| TXT | _acme-challenge.www | Certificate challenge supplied by Firebase |

Certificate challenges are public DNS records; their current exact values/status are available through `node scripts/audit-firebase-hosting-readonly.mjs`.

All three authoritative IPv4 servers resolve these new records at SOA serial 7. Google public DNS has intermittently returned absent apex/challenge records with older serials 4/5; Firebase certificate state is still being verified. Google's official public DNS cache flush was successfully submitted for all three TXT names, but negative responses still occur. Do not repoint traffic before the certificate is active and the default site checks pass.

At 2026-09-10 16:51 KST both certificates were still `CERT_VALIDATING`. Firebase alternately discovered and missed the TXT challenges; its fallback HTTP challenge correctly returned 404 from the unchanged Vercel origin. A direct TLS check against the Firebase IP rejected the apex certificate, confirming it was not safe to cut over yet. Both public origins still returned HTTPS 200; apex remained Vercel. No certificate checks were bypassed.

At 17:27 KST both certificates were `CERT_PROPAGATING`. The apex passed a normal certificate-verifying TLS request directed to Firebase's target IP and returned HTTP 200; `www` passed TLS but returned 404 before its ownership/CNAME cutover. A single edge succeeding does not establish completed global certificate coverage: wait for `CERT_ACTIVE` before switching the original Vercel web records. Google and Cloudflare DNS now resolve both challenge TXT records; no CAA restriction exists on the apex.

## Web records for cutover / rollback

| Type | Host | Previous Vercel value (rollback) | Current Firebase value |
| --- | --- | --- | --- |
| A | @ | 216.198.79.1 | 199.36.158.100 |
| A | @ | 64.29.17.1 | Remove after replacing first A |
| CNAME | www | ee4db8abff11f1db.vercel-dns-017.com | onnuriway.web.app |

Firebase `www.onnuriway.com` is configured to redirect to `onnuriway.com`. Vercel project and its existing deployment/aliases are retained as rollback. DNS is the only traffic switch; authentication, database and stored photos are not migrated or reset.

## Remaining gates after September 12 DNS cutover

- Certificates ACTIVE, DNS cutover, and apex remote worker-hash gate are complete.
- Apex DNS is correct at all four authoritative servers, but Firebase/Google still observe the previous apex A records. www ownership and its final edge HTTPS redirect are verified.
- Employee PIN on a real phone at the Firebase origin is user-verified. Existing installed phone PWA update/back/offline/camera still require separately identified verification.
- Inventory passed its own acceptance gate and is enabled in the final release. Do not confuse emulator business-data tests with production test writes; no production inventory fixtures were created.

## September 12 read-only operating-cost audit

- Inventory has no recurring full-catalog polling. Initial entry, explicit refresh, and reconnection load 100-row server pages; searches and mutations do not reread the full catalog. Calendar rollover refreshes context only.
- Function instance caps are six for ordinary inventory operations, four for one-at-a-time photo processing, and one for scheduled cleanup. No minimum always-on instance setting is configured. These are not a hard monthly spending cap.
- The photo bucket is in Seoul, with object versioning disabled and seven-day soft delete. Inventory keeps compressed images only, limits employee uploads, and expires abandoned/replaced photos on the daily cleanup job.
- The Seoul `gcf-artifacts` repository contains about 528 MiB and currently has no artifact cleanup policy. No stored deployment artifacts were deleted or cleanup settings changed during this audit.
- Project-scoped budget lookup returned `403 SERVICE_DISABLED` because the Budget API is disabled. Existing budget alerts are unverified, not confirmed absent. No billing service, budget, or account permission was changed.

## Local verification / future releases

1. `npm run build` creates the static `out` export. Production now uses `NEXT_PUBLIC_ENABLE_INVENTORY=true`; setting it false and redeploying Hosting is the UI-only feature rollback and does not delete inventory data.
2. `npm run verify:pwa:build`, `npm run verify:performance:build`, `npm run verify:hosting:build` must pass.
3. `npm start -- --port 3000` serves only on `127.0.0.1`; it does not deploy or authenticate. The built app retains whichever Firebase settings were used at build time. For data-mutating local testing, build explicitly against the isolated emulator configuration.
4. Deploy **Hosting only** with explicit project `onnuriway`; never use an unscoped deploy command while inventory server work is unreleased.
5. `node scripts/verify-firebase-hosting-build.mjs --url https://onnuriway.web.app` checks the deployed build hash and public responses. After domain cutover, repeat against `https://onnuriway.com`.
