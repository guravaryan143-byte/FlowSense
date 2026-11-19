import { Ban, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button, Card, DataBoundary, Field, PageHeader, Pill, RoleGate, Select, SimBanner, Table, Td, Th } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useAuth } from "../hooks/useAuth";
import { MapLegend, TrafficMap } from "../maps/TrafficMap";
import { errorMessage } from "../services/api";
import { closeRoad, createIncident, getIncidents, getIntersections, getLiveTraffic, getRoads, updateIncident } from "../services/endpoints";
import type { Incident, IncidentStatus, IncidentType, RoadTraffic, Severity } from "../types";
import { SEVERITIES, SEVERITY_COLOR } from "../utils/congestion";
import { fmtDateTime, titleCase } from "../utils/format";

const TYPES: IncidentType[] = ["accident", "breakdown", "road_work", "flooding", "event", "hazard", "other"];
const STATUSES: IncidentStatus[] = ["reported", "verified", "in_progress", "resolved"];
// mirrors the backend's allowed transitions (the server remains the authority)
const NEXT: Record<IncidentStatus, IncidentStatus[]> = { reported: ["verified", "in_progress", "resolved"], verified: ["in_progress", "resolved"], in_progress: ["resolved"], resolved: ["in_progress"] };
const sevTone = { low: "neutral", medium: "amber", high: "amber", critical: "red" } as const;
const PAGE = 10;
const MAX_DESC = 1000;

function Actions({ inc, onDone, onMessage }: { inc: Incident; onDone: () => void; onMessage: (m: { ok: boolean; text: string }) => void }) {
  const [next, setNext] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try { onMessage({ ok: true, text: await fn() }); setNext(""); onDone(); } catch (e) { onMessage({ ok: false, text: errorMessage(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label={`New status for incident ${inc.id}`} className="w-32" value={next} onChange={(e) => setNext(e.target.value)}>
        <option value="">Status…</option>{NEXT[inc.status].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
      </Select>
      <Button variant="secondary" disabled={!next || busy} onClick={() => void run(async () => { await updateIncident(inc.id, { status: next as IncidentStatus }); return `Incident #${inc.id} is now ${titleCase(next)}.`; })}>Update</Button>
      {inc.road_id !== null && inc.status !== "resolved" && !inc.closes_road && (
        <Button variant="danger" disabled={busy} onClick={() => void run(async () => (await closeRoad(inc.id)).message)}><Ban className="h-3.5 w-3.5" />Close road</Button>
      )}
    </div>
  );
}

export default function Incidents() {
  const { hasRole } = useAuth();
  const [status, setStatus] = useState<"" | IncidentStatus>("");
  const [severity, setSeverity] = useState<"" | Severity>("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const list = useAsync(() => getIncidents({ ...(status ? { status } : {}), ...(severity ? { severity } : {}), active_only: activeOnly, limit: PAGE, offset }), [status, severity, activeOnly, offset], { intervalMs: 20000 });
  const roads = useAsync(getRoads, []);
  const intersections = useAsync(getIntersections, []);
  const live = useAsync(getLiveTraffic, [], { intervalMs: 15000 });
  const traffic = useMemo(() => Object.fromEntries((live.data?.roads ?? []).map((r) => [r.road_id, r])) as Record<number, RoadTraffic>, [live.data]);

  // report form
  const [roadId, setRoadId] = useState("");
  const [type, setType] = useState<IncidentType>("accident");
  const [sev, setSev] = useState<Severity>("medium");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!roadId) { setFormError("Choose the road where the incident happened."); return; }
    setCreating(true); setFormError(null);
    try {
      const created = await createIncident({ road_id: Number(roadId), incident_type: type, severity: sev, description: desc });
      setMessage({ ok: true, text: `Incident #${created.id} reported on ${created.road_name}.` });
      setDesc(""); setOffset(0); list.refetch();
    } catch (err) { setFormError(errorMessage(err)); } finally { setCreating(false); }
  };

  const total = list.data?.total ?? 0;
  return (
    <>
      <PageHeader title="Incident management" description="Report incidents, follow them through verification to resolution, and close roads. Closing a road re-plans every affected emergency route." />
      <SimBanner />
      {message && <p role={message.ok ? "status" : "alert"} className={`mb-4 rounded-lg border px-3 py-2 text-sm ${message.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>{message.text}</p>}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4">
          <Card title="Report an incident">
            <RoleGate min="viewer" action="report an incident">
              <form onSubmit={submit} className="space-y-3" noValidate>
                <Field label="Road" htmlFor="inc-road"><Select id="inc-road" value={roadId} onChange={(e) => setRoadId(e.target.value)}><option value="">Select a road…</option>{(roads.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.road_name}</option>)}</Select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type" htmlFor="inc-type"><Select id="inc-type" value={type} onChange={(e) => setType(e.target.value as IncidentType)}>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
                  <Field label="Severity" htmlFor="inc-sev"><Select id="inc-sev" value={sev} onChange={(e) => setSev(e.target.value as Severity)}>{SEVERITIES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
                </div>
                <Field label="Description" htmlFor="inc-desc" hint={`${desc.length}/${MAX_DESC}`}>
                  <textarea id="inc-desc" rows={3} maxLength={MAX_DESC} value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded-lg border border-line bg-ink-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500" placeholder="What happened? (optional)" />
                </Field>
                {formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}
                <Button type="submit" loading={creating} className="w-full"><Plus className="h-4 w-4" />Report incident</Button>
              </form>
            </RoleGate>
          </Card>
          <Card title="Filters">
            <div className="space-y-3">
              <Field label="Status" htmlFor="f-status"><Select id="f-status" value={status} onChange={(e) => { setStatus(e.target.value as "" | IncidentStatus); setOffset(0); }}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
              <Field label="Severity" htmlFor="f-sev"><Select id="f-sev" value={severity} onChange={(e) => { setSeverity(e.target.value as "" | Severity); setOffset(0); }}><option value="">Any severity</option>{SEVERITIES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={activeOnly} onChange={(e) => { setActiveOnly(e.target.checked); setOffset(0); }} />Hide resolved incidents</label>
            </div>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-2">
          <Card title="Incident map">
            <DataBoundary loading={roads.loading} error={roads.error} data={roads.data} onRetry={roads.refetch} height={300}>
              {(r) => <div className="space-y-3"><TrafficMap roads={r} intersections={intersections.data ?? []} traffic={traffic} incidents={list.data?.items ?? []} layers={{ intersections: false }} height={320} /><MapLegend items={["traffic", "incident"]} /></div>}
            </DataBoundary>
          </Card>
          <Card title={`Incidents (${total})`} padded={false}
                actions={<div className="flex items-center gap-2 text-xs text-slate-400"><Button variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>{total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)}<Button variant="ghost" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next</Button></div>}>
            <DataBoundary loading={list.loading} error={list.error} data={list.data} onRetry={list.refetch} isEmpty={(d) => d.items.length === 0} emptyTitle="No incidents match these filters">
              {(d) => (
                <Table>
                  <thead><tr><Th>#</Th><Th>Incident</Th><Th>Road</Th><Th>Status</Th><Th>Reported</Th>{hasRole("operator") && <Th>Actions</Th>}</tr></thead>
                  <tbody>{d.items.map((i) => (
                    <tr key={i.id}>
                      <Td className="tabular-nums text-slate-400">{i.id}</Td>
                      <Td><div className="flex flex-wrap items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[i.severity] }} aria-hidden /><span className="font-medium">{titleCase(i.incident_type)}</span><Pill tone={sevTone[i.severity]}>{i.severity}</Pill>{i.closes_road && <Pill tone="red">road closed</Pill>}</div>{i.description && <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{i.description}</div>}</Td>
                      <Td>{i.road_name ?? "—"}</Td>
                      <Td><Pill tone={i.status === "resolved" ? "green" : i.status === "reported" ? "amber" : "cyan"}>{titleCase(i.status)}</Pill></Td>
                      <Td className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(i.created_at)}</Td>
                      {hasRole("operator") && <Td><Actions inc={i} onDone={() => { list.refetch(); roads.refetch(); live.refetch(); }} onMessage={setMessage} /></Td>}
                    </tr>
                  ))}</tbody>
                </Table>
              )}
            </DataBoundary>
          </Card>
          {!hasRole("operator") && <p className="text-xs text-slate-500">Operators can change an incident's status and close roads.</p>}
        </div>
      </div>
    </>
  );
}
