import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { EmployeeDirectory } from "../../src/employee/employee-directory.js";
import { newReadObservation, withReadObservation } from "../../src/shared/read-observation.js";

function fixture() {
  const names = new Map<string, unknown>([["e1", "합성 기록자"], ["inactive", "퇴직 합성 직원"], ["blank", "  "], ["invalid", 42]]);
  const getAll = vi.fn(async (...args: Array<{ id: string } | { fieldMask: string[] }>) => args.filter((arg) => "id" in arg).reverse().map((ref) => {
    const id = (ref as { id: string }).id;
    return { id, exists: names.has(id), get: (field: string) => { expect(field).toBe("displayName"); return names.get(id); } };
  }));
  const db = { doc: vi.fn((path: string) => ({ id: path.split("/")[1], path })), getAll } as unknown as Firestore;
  return { names, getAll, db, directory: new EmployeeDirectory(db) };
}
describe("minimal batched historical author lookup", () => {
  it("deduplicates authors in one masked read and joins by document ID, including inactive authors", async () => {
    const f = fixture(), observation = newReadObservation();
    const names = await withReadObservation(observation, () => f.directory.namesByIds(["e1", "inactive", "e1"]));
    expect([...names].sort()).toEqual([["e1", "합성 기록자"], ["inactive", "퇴직 합성 직원"]]);
    expect(f.getAll).toHaveBeenCalledExactlyOnceWith({ id: "e1", path: "employees/e1" }, { id: "inactive", path: "employees/inactive" }, { fieldMask: ["displayName"] });
    expect(observation.documentReads).toBe(2); expect(observation.operations.firestore).toBe(1);
    f.names.set("e1", "변경된 현재 이름");
    expect((await f.directory.namesByIds(["e1"])).get("e1")).toBe("변경된 현재 이름");
  });
  it("reports unavailable names without inventing an author and propagates database failures", async () => {
    const f = fixture();
    expect([...await f.directory.namesByIds(["missing", "blank", "invalid"])].every(([, name]) => name === null)).toBe(true);
    f.getAll.mockRejectedValueOnce(new Error("read failed"));
    await expect(f.directory.namesByIds(["e1"])).rejects.toThrow("read failed");
  });
  it("does not read for empty or unsafe/beyond-budget identifiers", async () => {
    const f = fixture(); expect(await f.directory.namesByIds([])).toEqual(new Map());
    for (const ids of [["x/other"], [".."], [""], Array(101).fill("e1")]) {
      await expect(f.directory.namesByIds(ids)).rejects.toMatchObject({ code: "invalid-argument" });
    }
    expect(f.getAll).not.toHaveBeenCalled(); expect(f.db.doc).not.toHaveBeenCalled();
  });
});
