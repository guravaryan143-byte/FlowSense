import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { useAsync } from "../hooks/useAsync";
import { useTrafficStream } from "../hooks/useTrafficStream";
import { errorMessage } from "../services/api";
import { getSimStatus, startSim, stopSim } from "../services/endpoints";
import { fmtDateTime } from "../utils/format";
import { Button, Field, Pill, RoleGate, Select } from "./ui";

/** Start / stop the live simulation (operators only). Status is shared with the WebSocket stream. */
export function SimulationControls() {
  const status = useAsync(getSimStatus, [], { intervalMs: 5000 });
  const stream = useTrafficStream();
  const [mode, setMode] = useState<"fixed" | "adaptive">("fixed");
  const [demand, setDemand] = useState("1.0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = stream.running || status.data?.running === true;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); status.refetch(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone={running ? "green" : "neutral"}>{running ? "Simulation running" : "Simulation stopped"}</Pill>
        {(stream.simTime ?? status.data?.sim_time) && <span className="text-xs text-slate-400">Simulated clock: {fmtDateTime(stream.simTime ?? status.data?.sim_time)}</span>}
      </div>
      <RoleGate min="operator" action="start or stop the simulation">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Signal control" htmlFor="sim-mode">
            <Select id="sim-mode" value={mode} disabled={running} onChange={(e) => setMode(e.target.value as "fixed" | "adaptive")}>
              <option value="fixed">Fixed-time</option>
              <option value="adaptive">Adaptive</option>
            </Select>
          </Field>
          <Field label="Demand level" htmlFor="sim-demand">
            <Select id="sim-demand" value={demand} disabled={running} onChange={(e) => setDemand(e.target.value)}>
              <option value="0.7">Light (×0.7)</option><option value="1.0">Normal (×1.0)</option><option value="1.3">Heavy (×1.3)</option>
            </Select>
          </Field>
          {running
            ? <Button variant="secondary" loading={busy} onClick={() => act(stopSim)}><Pause className="h-4 w-4" />Stop</Button>
            : <Button loading={busy} onClick={() => act(() => startSim({ signal_mode: mode, demand_multiplier: Number(demand), seed: 42 }))}><Play className="h-4 w-4" />Start simulation</Button>}
        </div>
      </RoleGate>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
