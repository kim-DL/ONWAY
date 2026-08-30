import { describe, expect, it } from "vitest";

import { updateActivityTagsInputSchema } from "../src/admin/admin-contract.js";

const request = {
  tags: [
    { tagId: "ACT-FIRST", label: "첫 방문", active: true },
    { tagId: null, label: "견적 요청", active: true },
  ],
  requestId: "553dfe93-6b62-4ed7-8395-e3246397eaa5",
  appVersion: "activity-tag-test",
};

describe("admin activity tag contract", () => {
  it("accepts existing and newly requested activity tags", () => {
    expect(updateActivityTagsInputSchema.safeParse(request).success).toBe(true);
  });

  it("rejects duplicate labels and an empty tag collection", () => {
    expect(updateActivityTagsInputSchema.safeParse({
      ...request,
      tags: [
        request.tags[0],
        { tagId: null, label: "첫 방문", active: true },
      ],
    }).success).toBe(false);
    expect(updateActivityTagsInputSchema.safeParse({ ...request, tags: [] }).success).toBe(false);
  });
});
