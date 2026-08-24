import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "coverage/**",
    "functions/lib/**",
    "node_modules/**",
    "output/**",
    "playwright-report/**",
    "public/sw.js",
    "public/sw.js.map",
    "public/swe-worker-*.js",
    "next-env.d.ts",
  ]),
]);
