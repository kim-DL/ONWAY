import { describe, expect, it } from "vitest";

import { dynamic, GET } from "./route";

describe("static Hosting connectivity compatibility", () => {
  it("exports a fixed successful resource for existing PWA HEAD probes", async () => {
    expect(dynamic).toBe("force-static");
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("online\n");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toContain("text/plain");
  });
});
