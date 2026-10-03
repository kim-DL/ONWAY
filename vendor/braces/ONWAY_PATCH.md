# ONWAY patch for `braces`

This directory is based on upstream `braces` 3.0.3 (MIT license). It adds a maximum curly-brace nesting depth of 100 in `lib/parse.js` to prevent recursive AST walkers from exhausting the JavaScript call stack. The public API remains the same for patterns at or below that depth.

The root package overrides upstream `braces` with this local copy until upstream releases a fix for GHSA-vfj7-8cjw-p6xm. The behavior is covered by `src/lib/braces-security.test.ts`. When upstream ships a patched release, remove this override and local copy after verifying the replacement.
