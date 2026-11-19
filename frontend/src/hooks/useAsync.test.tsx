import { act, renderHook, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAsync } from "./useAsync";

afterEach(() => vi.useRealTimers());

describe("useAsync", () => {
  it("starts loading, then provides data", async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve("hello"), []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("hello"); expect(result.current.error).toBeNull();
  });

  it("turns failures into a readable error message", async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject(new AxiosError("Network Error", "ERR_NETWORK")), []));
    await waitFor(() => expect(result.current.error).toMatch(/cannot reach/i));
    expect(result.current.data).toBeNull(); expect(result.current.loading).toBe(false);
  });

  it("refetch() calls the function again and recovers from an error", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("first fails")).mockResolvedValueOnce("second works");
    const { result } = renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.error).toBe("first fails"));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toBe("second works"));
    expect(result.current.error).toBeNull(); expect(fn).toHaveBeenCalledTimes(2);
  });

  it("ignores a slow response that arrives after a newer request (no stale data)", async () => {
    let resolveSlow!: (v: string) => void;
    const slow = new Promise<string>((r) => { resolveSlow = r; });
    const { result, rerender } = renderHook(({ id }) => useAsync(() => (id === 1 ? slow : Promise.resolve("fast")), [id]), { initialProps: { id: 1 } });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.data).toBe("fast"));
    await act(async () => { resolveSlow("slow-and-stale"); await slow; });
    expect(result.current.data).toBe("fast");
  });

  it("does nothing while disabled", async () => {
    const fn = vi.fn().mockResolvedValue(1);
    const { result } = renderHook(() => useAsync(fn, [], { enabled: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fn).not.toHaveBeenCalled();
  });

  it("polls quietly: refreshes data without flipping back to loading", async () => {
    vi.useFakeTimers();
    let n = 0;
    const { result } = renderHook(() => useAsync(() => Promise.resolve(++n), [], { intervalMs: 1000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.data).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.data).toBe(2); expect(result.current.loading).toBe(false);
  });

  it("stops polling after unmount", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue(1);
    const { unmount } = renderHook(() => useAsync(fn, [], { intervalMs: 1000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
