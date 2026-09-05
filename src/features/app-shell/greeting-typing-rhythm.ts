// Presentation tuning, not a measurement of Korean typing speed. Small,
// repeatable bursts keep the rhythm natural without random stalls or flicker.
const LETTER_BEATS = [128, 112, 142, 119, 105, 136, 116, 145] as const;
const PHRASE_BOUNDARY = /[,，、;；:：]/u;
const SENTENCE_BOUNDARY = /[.!?…。！？]/u;
const WHITESPACE = /\s/u;
export const MAX_GREETING_TYPING_MS = 8_000;

/** Delay before each complete grapheme. null means show unusually long copy
 * immediately instead of racing through it to meet an artificial time limit. */
export function buildGreetingTypingSchedule(characters: readonly string[]): number[] | null {
  const delays = characters.map((character, index) => {
    if (index === 0) return 280;
    const previous = characters[index - 1]!;
    const beat = LETTER_BEATS[index % LETTER_BEATS.length]!;
    if (SENTENCE_BOUNDARY.test(previous)) return 540;
    if (PHRASE_BOUNDARY.test(previous)) return 390;
    if (WHITESPACE.test(character)) return 65;
    if (WHITESPACE.test(previous)) return beat + 60;
    if (PHRASE_BOUNDARY.test(character) || SENTENCE_BOUNDARY.test(character)) return beat + 45;
    return beat;
  });
  return delays.reduce((total, delay) => total + delay, 0) > MAX_GREETING_TYPING_MS ? null : delays;
}
