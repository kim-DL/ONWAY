import { describe, expect, it } from "vitest";
import { mergePhotoRegistration, photoRegistrationMessage, registrationDelta } from "../src/delivery-planning/photo-registration-summary.js";

describe("photo registration counts", () => {
  it("counts unique destination IDs against the pre-merge day, including photo-protected stops", () => {
    expect(registrationDelta(["existing", "photo"], ["new", "existing", "new", "photo"]))
      .toEqual({ addedIds: ["new"], existingIds: ["existing", "photo"] });
  });
  it("reports an exact first mixed registration through the existing message field", () => {
    const value = mergePhotoRegistration(undefined, [], { addedIds: ["a"], existingIds: ["b"] });
    expect(photoRegistrationMessage(value)).toBe("새로 추가 1곳 · 이미 등록 1곳");
  });
  it("accumulates partial confirmations without reclassifying a newly added destination", () => {
    const first = mergePhotoRegistration(undefined, [], { addedIds: ["a"], existingIds: ["b"] });
    const next = mergePhotoRegistration(first, ["a", "b", "a"], { addedIds: ["c"], existingIds: ["a", "b"] });
    expect(next).toEqual({ addedIds: ["a", "c"], existingIds: ["b"], complete: true });
    expect(photoRegistrationMessage(next)).toBe("새로 추가 2곳 · 이미 등록 1곳");
    expect(mergePhotoRegistration(next, ["a", "b", "c"], { addedIds: [], existingIds: [] })).toEqual(next);
  });
  it("counts a repeated destination as already registered in a separate photograph", () => {
    expect(photoRegistrationMessage(mergePhotoRegistration(undefined, [], registrationDelta(["a"], ["a", "a"]))))
      .toBe("새로 추가 0곳 · 이미 등록 1곳");
  });
  it("does not display zero success when every row still needs confirmation", () => {
    expect(photoRegistrationMessage(mergePhotoRegistration(undefined, [], { addedIds: [], existingIds: [] }))).toBe("");
  });
  it("cannot invent historical counts for a legacy scan with saved destinations", () => {
    const value = mergePhotoRegistration(undefined, ["old"], { addedIds: ["new"], existingIds: [] });
    expect(value.complete).toBe(false); expect(photoRegistrationMessage(value)).toBe("");
    expect(photoRegistrationMessage(mergePhotoRegistration(value, ["old", "new"], { addedIds: [], existingIds: ["old"] }))).toBe("");
  });
  it("can count a legacy scan whose first saved destination is confirmed after the upgrade", () => {
    expect(photoRegistrationMessage(mergePhotoRegistration(undefined, [], { addedIds: ["new"], existingIds: [] })))
      .toBe("새로 추가 1곳 · 이미 등록 0곳");
  });
  it.each([
    { addedIds: [], existingIds: [], complete: true },
    { addedIds: ["a"], existingIds: [], complete: true },
    { addedIds: ["a", "unrelated"], existingIds: ["b"], complete: true },
    { addedIds: "invalid", existingIds: [], complete: true },
  ])("hides exact counts if stored metadata is malformed or misses saved coverage: %j", (previous) => {
    const value = mergePhotoRegistration(previous, ["a", "b"], { addedIds: ["c"], existingIds: [] });
    expect(value.complete).toBe(false); expect(photoRegistrationMessage(value)).toBe("");
  });
});
