# ONWAY patch for `braces`

This directory is based on upstream `braces` 3.0.3 (MIT license). It adds a maximum curly-brace nesting depth of 100 in `lib/parse.js` to prevent recursive AST walkers from exhausting the JavaScript call stack. The public API remains the same for patterns at or below that depth.

The root package overrides upstream `braces` with this local copy until upstream releases a fix for GHSA-vfj7-8cjw-p6xm. The behavior is covered by `src/lib/braces-security.test.ts`. When upstream ships a patched release, remove this override and local copy after verifying the replacement.

The root also declares this copy as a development dependency so the security test resolves it after a clean install. The test checks that both its own import and micromatch resolve to this patch. Upstream development-only dependencies and scripts are omitted from this runtime copy; the repository's Vitest suite verifies it.
