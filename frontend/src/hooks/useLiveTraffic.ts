import { useMemo } from "react";
import { getLiveTraffic } from "../services/endpoints";
import type { LiveTraffic } from "../types";
import { mergeStream } from "../utils/traffic";
import { useAsync } from "./useAsync";
import { useTrafficStream } from "./useTrafficStream";

/**
 * Live traffic = REST snapshot (refreshed every 10 s) with WebSocket ticks laid on top while the
 * simulation is running. If the socket is down, polling alone keeps the page current.
 */
export function useLiveTraffic() {
  const rest = useAsync<LiveTraffic>(getLiveTraffic, [], { intervalMs: 10000 });
  const stream = useTrafficStream();
  const data = useMemo(
    () => (rest.data ? (stream.connected && stream.running ? mergeStream(rest.data, stream.roads, stream.simTime) : rest.data) : null),
    [rest.data, stream.connected, stream.running, stream.roads, stream.simTime],
  );
  return { ...rest, data, streaming: stream.connected && stream.running };
}
