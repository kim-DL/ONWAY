import type { InputHTMLAttributes } from "react";

/** Search terms are not account, payment or address autofill fields.
 * Native browser/keyboard toolbars remain under the user's browser control.
 */
export const searchInputProps = {
  type: "search",
  inputMode: "search",
  enterKeyHint: "search",
  autoComplete: "off",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
} as const satisfies InputHTMLAttributes<HTMLInputElement>;
