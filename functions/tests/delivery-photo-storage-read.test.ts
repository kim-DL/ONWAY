import { describe, expect, it, vi } from "vitest";
import { GoogleDeliveryPhotoStorage } from "../src/delivery-photo/delivery-photo-store.js";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const bytes = Buffer.from("RIFF0000WEBPfixture");
const object = { objectPath: "delivery-photos/2026-11-15/photo/attempts/token/evidence.webp", generation: "42",
  uploadAttemptToken: "token", contentType: "image/webp" as const, byteSize: bytes.length, width: 2400, height: 1800 };
const metadata = () => ({ generation: object.generation, contentType: "image/webp", metadata: { deliveryPhotoUploadAttempt: object.uploadAttemptToken } });

function fixture(generation = object.generation) {
  const first = deferred<[ReturnType<typeof metadata>]>(), media = deferred<[Buffer]>(), last = deferred<[ReturnType<typeof metadata>]>();
  const live = { getMetadata: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise), download: vi.fn().mockReturnValue(media.promise) };
  const pinned = { getMetadata: vi.fn(), download: vi.fn().mockReturnValue(media.promise) };
  const bucket = { file: vi.fn((_path: string, options?: { generation: string }) => options ? pinned : live) };
  const storage = new GoogleDeliveryPhotoStorage(bucket as never);
  return { first, media, last, live, pinned, bucket, storage, target: { ...object, generation } };
}

describe("generation-pinned delivery photo reads", () => {
  it("overlaps initial live metadata and pinned media, then waits for final live confirmation", async () => {
    const f = fixture();
    const read = f.storage.download(f.target);
    expect(f.live.getMetadata).toHaveBeenCalledOnce();
    expect(f.pinned.download).toHaveBeenCalledWith({ start: 0, end: bytes.length });
    expect(f.live.download).not.toHaveBeenCalled();
    expect(f.bucket.file).toHaveBeenNthCalledWith(2, object.objectPath, { generation: object.generation });
    f.media.resolve([bytes]); await Promise.resolve();
    expect(f.live.getMetadata).toHaveBeenCalledOnce();
    f.first.resolve([metadata()]);
    await vi.waitFor(() => expect(f.live.getMetadata).toHaveBeenCalledTimes(2));
    let returned = false; void read.then(() => { returned = true; });
    await Promise.resolve(); expect(returned).toBe(false);
    f.last.resolve([metadata()]);
    expect(await read).toEqual(bytes);
    expect(f.pinned.getMetadata).not.toHaveBeenCalled();
  });

  it.each(["generation", "contentType", "token"] as const)("rejects a changed %s before releasing concurrently read bytes", async (field) => {
    const f = fixture(), before = metadata();
    if (field === "generation") before.generation = "43";
    else if (field === "contentType") before.contentType = "image/png";
    else before.metadata.deliveryPhotoUploadAttempt = "other-token";
    const read = f.storage.download(f.target);
    const rejected = expect(read).rejects.toThrow("changed");
    f.media.resolve([bytes]); f.first.resolve([before]);
    await rejected;
    expect(f.live.getMetadata).toHaveBeenCalledOnce();
  });

  it.each(["generation", "contentType", "token"] as const)("rejects a live %s change during download even though the pinned object is valid", async (field) => {
    const f = fixture(), after = metadata();
    if (field === "generation") after.generation = "43";
    else if (field === "contentType") after.contentType = "image/png";
    else after.metadata.deliveryPhotoUploadAttempt = "other-token";
    const read = f.storage.download(f.target);
    const rejected = expect(read).rejects.toThrow("during download");
    f.first.resolve([metadata()]); f.media.resolve([bytes]); f.last.resolve([after]);
    await rejected;
    expect(f.live.getMetadata).toHaveBeenCalledTimes(2);
    expect(f.pinned.getMetadata).not.toHaveBeenCalled();
  });

  it.each(["9007199254740993", "0"])("keeps serial reads when generation %s cannot be pinned exactly", async (generation) => {
    const f = fixture(generation), current = { ...metadata(), generation };
    const read = f.storage.download(f.target);
    expect(f.bucket.file).toHaveBeenCalledOnce();
    expect(f.live.download).not.toHaveBeenCalled();
    f.first.resolve([current]);
    await vi.waitFor(() => expect(f.live.download).toHaveBeenCalledWith({ start: 0, end: bytes.length }));
    f.media.resolve([bytes]); f.last.resolve([current]);
    expect(await read).toEqual(bytes);
    expect(f.pinned.download).not.toHaveBeenCalled();
  });

  it("owns both promise rejections when live metadata fails before pinned media", async () => {
    const f = fixture(), read = f.storage.download(f.target);
    const rejected = expect(read).rejects.toThrow("metadata failed");
    f.first.reject(new Error("metadata failed")); await rejected;
    f.media.reject(new Error("media failed later")); await Promise.resolve();
    expect(f.live.getMetadata).toHaveBeenCalledOnce();
  });
});
