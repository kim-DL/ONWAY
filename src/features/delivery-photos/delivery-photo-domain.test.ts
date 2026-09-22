import { describe, expect, it } from "vitest";

import {
  addDeliveryPhotoCustomer,
  moveDeliveryPhotoCustomer,
  projectDeliveryPhotoCompletion,
  removeDeliveryPhotoCustomer,
  resolveDeliveryPhotoDayCustomerIds,
} from "./delivery-photo-domain";

const known = new Set(["a", "b", "c", "d"]);

describe("delivery photo route/day domain", () => {
  it("uses the default route unless a day override exists", () => {
    expect(resolveDeliveryPhotoDayCustomerIds(["a", "b"], null, known)).toEqual(["a", "b"]);
    expect(resolveDeliveryPhotoDayCustomerIds(["a", "b"], ["c", "a"], known)).toEqual(["c", "a"]);
  });

  it("adds, removes, reorders and filters duplicate or missing IDs", () => {
    expect(addDeliveryPhotoCustomer(["a", "a", "missing"], "b", known)).toEqual(["a", "b"]);
    expect(addDeliveryPhotoCustomer(["a", "b"], "b", known)).toEqual(["a", "b"]);
    expect(addDeliveryPhotoCustomer(["a"], "missing", known)).toEqual(["a"]);
    expect(removeDeliveryPhotoCustomer(["a", "b"], "a")).toEqual(["b"]);
    expect(moveDeliveryPhotoCustomer(["a", "b", "c"], "c", 0, known)).toEqual(["c", "a", "b"]);
    expect(moveDeliveryPhotoCustomer(["a", "b", "c"], "a", 99, known)).toEqual(["b", "c", "a"]);
  });

  it("projects completion from active photo counts instead of persisting completion", () => {
    expect(projectDeliveryPhotoCompletion(["a", "b", "c"], new Map([["b", 2]]))).toEqual({ remainingCustomerIds: ["a", "c"], completedCustomerIds: ["b"] });
    expect(projectDeliveryPhotoCompletion(["a", "b", "c"], new Map([["b", 0]]))).toEqual({ remainingCustomerIds: ["a", "b", "c"], completedCustomerIds: [] });
  });
});
