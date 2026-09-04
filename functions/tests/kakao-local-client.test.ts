import { afterEach, describe, expect, it, vi } from "vitest";

import { KakaoLocalClient, type KakaoFetcher } from "../src/sync/kakao-local-client.js";

afterEach(() => vi.useRealTimers());

describe("Kakao Local request deadlines", () => {
  it("aborts a stalled fetch and returns even if the transport ignores cancellation", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<KakaoFetcher>(() => new Promise(() => undefined));
    const client = new KakaoLocalClient({ restApiKey: "test", fetcher, requestTimeoutMs: 1_000 });
    const result = expect(client.searchAddress("대전 동구 백룡로 1")).rejects.toMatchObject({ kind: "TIMEOUT" });

    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the deadline active while reading a stalled response body", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<KakaoFetcher>(async () => ({
      ok: true,
      status: 200,
      json: () => new Promise(() => undefined),
    }));
    const client = new KakaoLocalClient({ restApiKey: "test", fetcher, requestTimeoutMs: 1_000 });
    const result = expect(client.searchKeyword({ query: "대전온누리초등학교" })).rejects.toMatchObject({ kind: "TIMEOUT" });

    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  });

  it("includes retry backoff in the same deadline and cancels pending retries", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<KakaoFetcher>(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const client = new KakaoLocalClient({
      restApiKey: "test", fetcher, requestTimeoutMs: 1_000, retryDelaysMs: [0, 2_000, 2_000],
    });
    const result = expect(client.searchAddress("대전 동구 백룡로 1")).rejects.toMatchObject({ kind: "TIMEOUT" });

    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("caps transient failure retries at three and does not retry authorization errors", async () => {
    const failure = (status: number) => ({ ok: false, status, json: async () => ({}) });
    const transient = vi.fn<KakaoFetcher>(async () => failure(503));
    const denied = vi.fn<KakaoFetcher>(async () => failure(403));
    const options = { restApiKey: "test", retryDelaysMs: [0, 0, 0, 0, 0] };

    await expect(new KakaoLocalClient({ ...options, fetcher: transient }).searchAddress("대전")).rejects.toMatchObject({ kind: "HTTP_ERROR" });
    await expect(new KakaoLocalClient({ ...options, fetcher: denied }).searchAddress("대전")).rejects.toMatchObject({ kind: "HTTP_ERROR" });
    expect(transient).toHaveBeenCalledTimes(3);
    expect(denied).toHaveBeenCalledTimes(1);
  });
});
