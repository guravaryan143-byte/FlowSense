import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../services/api";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

interface Options { intervalMs?: number; enabled?: boolean }

/**
 * Load data with loading / error state.
 * - Re-runs when `deps` change; `refetch()` re-runs on demand.
 * - Optional polling (`intervalMs`) refreshes quietly: `loading` is only true for the first load of a dependency set.
 * - Responses that arrive after a newer request started (or after unmount) are ignored.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], { intervalMs, enabled = true }: Options = {}): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const requestId = useRef(0);
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let cancelled = false;
    const run = async (quiet: boolean) => {
      const id = ++requestId.current;
      if (!quiet) setLoading(true);
      try {
        const result = await fnRef.current();
        if (cancelled || id !== requestId.current) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (cancelled || id !== requestId.current) return;
        setError(errorMessage(e));
      } finally {
        if (!cancelled && id === requestId.current) setLoading(false);
      }
    };
    void run(false);
    const timer = intervalMs ? window.setInterval(() => void run(true), intervalMs) : undefined;
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled, intervalMs]);

  return { data, error, loading, refetch };
}
