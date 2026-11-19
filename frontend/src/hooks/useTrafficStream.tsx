import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { wsUrl } from "../services/api";
import type { StreamMessage, StreamRoad, StreamSignal } from "../types";

export interface StreamState {
  connected: boolean;
  /** true while the backend simulation is producing ticks */
  running: boolean;
  tick: number | null;
  simTime: string | null;
  roads: Record<number, StreamRoad>;
  signals: Record<number, StreamSignal>;
  lastTickAt: number | null;
  summary: { total_vehicles: number; average_speed: number; average_density: number; congested_roads: number } | null;
}

const INITIAL: StreamState = { connected: false, running: false, tick: null, simTime: null, roads: {}, signals: {}, lastTickAt: null, summary: null };
const StreamContext = createContext<StreamState>(INITIAL);

const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 15000;

/**
 * ONE WebSocket for the whole app. Reconnects with exponential backoff (1 s .. 15 s) and is fully
 * torn down on unmount: timers cleared, socket closed, no setState after unmount.
 */
export function TrafficStreamProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [state, setState] = useState<StreamState>(INITIAL);
  const attempts = useRef(0);

  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") return;
    let closed = false;
    let socket: WebSocket | null = null;
    let timer: number | undefined;

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(wsUrl());
      socket.onopen = () => { attempts.current = 0; setState((s) => ({ ...s, connected: true })); };
      socket.onmessage = (ev: MessageEvent) => {
        let msg: StreamMessage;
        try { msg = JSON.parse(String(ev.data)) as StreamMessage; } catch { return; }  // ignore malformed frames
        if (msg.type === "status") {
          setState((s) => ({ ...s, running: msg.running }));
        } else if (msg.type === "traffic_update") {
          setState((s) => ({
            ...s, running: true, tick: msg.tick, simTime: msg.sim_time, lastTickAt: Date.now(), summary: msg.summary,
            roads: Object.fromEntries(msg.roads.map((r) => [r.road_id, r])),
            signals: Object.fromEntries(msg.signals.map((g) => [g.intersection_id, g])),
          }));
        }
      };
      socket.onclose = () => {
        setState((s) => (closed ? s : { ...s, connected: false }));
        if (closed) return;
        const delay = Math.min(MAX_DELAY_MS, MIN_DELAY_MS * 2 ** attempts.current);
        attempts.current += 1;
        timer = window.setTimeout(connect, delay);
      };
      socket.onerror = () => socket?.close();
    };
    connect();

    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
      if (socket) { socket.onclose = null; socket.onmessage = null; socket.close(); }
    };
  }, [enabled]);

  const value = useMemo(() => state, [state]);
  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>;
}

export const useTrafficStream = (): StreamState => useContext(StreamContext);
