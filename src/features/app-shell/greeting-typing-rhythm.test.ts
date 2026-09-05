import { describe, expect, it } from "vitest";
import { buildGreetingTypingSchedule, MAX_GREETING_TYPING_MS } from "./greeting-typing-rhythm";

describe("human-paced greeting rhythm", () => {
  it("uses slower varied beats inside a word with a brief preparation", () => {
    const beats = buildGreetingTypingSchedule(Array.from("가나다라마바사아자차카타파하"))!;
    expect(beats[0]).toBe(280);
    expect(new Set(beats.slice(1)).size).toBe(8);
    for (const beat of beats.slice(1)) {
      expect(beat).toBeGreaterThanOrEqual(105);
      expect(beat).toBeLessThanOrEqual(145);
    }
  });

  it("takes a longer breath at a name comma and a sentence boundary", () => {
    const comma = buildGreetingTypingSchedule(Array.from("부장님, 오늘"))!;
    const sentence = buildGreetingTypingSchedule(Array.from("반가워요. 오늘"))!;
    expect(comma[4]).toBe(390);
    expect(sentence[5]).toBe(540);
    expect(sentence[5]).toBeGreaterThan(comma[4]!);
    expect(comma[5]).toBeGreaterThan(145); // First letter after the space.
  });

  it("uses the same small rhythm on every entry rather than random stalls", () => {
    const text = Array.from("김대인 부장님, 오늘도 수고 많았어요.");
    expect(buildGreetingTypingSchedule(text)).toEqual(buildGreetingTypingSchedule([...text]));
  });

  it("lets the user's example breathe for about four seconds", () => {
    const text = Array.from("김대인 부장님, 오늘 하루도 수고가 많으셨습니다.");
    const beats = buildGreetingTypingSchedule(text)!;
    const total = beats.reduce((sum, beat) => sum + beat, 0);
    expect(beats).toHaveLength(text.length);
    expect(total).toBeGreaterThan(3_500);
    expect(total).toBeLessThan(4_500);
    // The final character completes the greeting; no separate final hold is appended.
    expect(beats.at(-1)).toBeLessThan(220);
  });

  it("never accelerates unusually long copy to squeeze it into a short animation", () => {
    expect(buildGreetingTypingSchedule(Array.from("긴 안내 문장입니다. ".repeat(15)))).toBeNull();
    expect(MAX_GREETING_TYPING_MS).toBe(8_000);
    expect(buildGreetingTypingSchedule([])).toEqual([]);
  });

  it("handles alternate punctuation and grapheme strings without splitting them", () => {
    const beats = buildGreetingTypingSchedule(["👩‍💻", "，", " ", "김", "！", "네"]);
    expect(beats).toHaveLength(6);
    expect(beats?.[2]).toBe(390);
    expect(beats?.[5]).toBe(540);
  });
});
