import { LogOut } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, DataBoundary, PageHeader, Pill, RoleGate, Select, Table, Td, Th } from "../components/ui";
import { SimulationControls } from "../components/SimulationControls";
import { useAsync } from "../hooks/useAsync";
import { useAuth } from "../hooks/useAuth";
import { API_BASE, errorMessage } from "../services/api";
import { getHealth, getModelInfo, listUsers, setUserRole } from "../services/endpoints";
import type { Role } from "../types";
import { fmtDateTime } from "../utils/format";

function UsersTable() {
  const users = useAsync(listUsers, []);
  const [error, setError] = useState<string | null>(null);
  const change = async (id: number, role: Role) => {
    setError(null);
    try { await setUserRole(id, role); users.refetch(); } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <>
      {error && <p role="alert" className="mb-2 text-sm text-red-300">{error}</p>}
      <DataBoundary loading={users.loading} error={users.error} data={users.data} onRetry={users.refetch}>
        {(list) => (
          <Table>
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Joined</Th><Th>Role</Th></tr></thead>
            <tbody>{list.map((u) => (
              <tr key={u.id}><Td>{u.name}</Td><Td>{u.email}</Td><Td>{fmtDateTime(u.created_at)}</Td>
                <Td><Select aria-label={`Role for ${u.name}`} className="w-32" value={u.role} onChange={(e) => void change(u.id, e.target.value as Role)}><option value="viewer">viewer</option><option value="operator">operator</option><option value="admin">admin</option></Select></Td></tr>
            ))}</tbody>
          </Table>
        )}
      </DataBoundary>
    </>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const health = useAsync(getHealth, [], { intervalMs: 15000 });
  const model = useAsync(getModelInfo, []);
  return (
    <>
      <PageHeader title="Settings" description="Account, simulation control, system status and user management." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Account">
          {user ? (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-[110px_1fr] gap-y-1.5"><dt className="text-slate-400">Name</dt><dd>{user.name}</dd><dt className="text-slate-400">Email</dt><dd>{user.email}</dd><dt className="text-slate-400">Role</dt><dd><Pill tone="cyan">{user.role}</Pill></dd><dt className="text-slate-400">Member since</dt><dd>{fmtDateTime(user.created_at)}</dd></dl>
              <Button variant="secondary" onClick={logout}><LogOut className="h-4 w-4" />Sign out</Button>
            </div>
          ) : <p className="text-sm text-slate-300">You are browsing as a guest. <Link to="/login" className="text-accent hover:underline">Sign in</Link> to report incidents or run simulations.</p>}
        </Card>

        <Card title="Simulation"><SimulationControls /></Card>

        <Card title="System status">
          <DataBoundary loading={health.loading} error={health.error} data={health.data} onRetry={health.refetch}>
            {(h) => (
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between"><span className="text-slate-400">API</span><Pill tone={h.status === "ok" ? "green" : "red"}>{h.status}</Pill></li>
                <li className="flex justify-between"><span className="text-slate-400">Database</span><Pill tone={h.database === "ok" ? "green" : "red"}>{h.database}</Pill></li>
                <li className="flex justify-between"><span className="text-slate-400">Prediction model</span><Pill tone={h.model_available ? "green" : "amber"}>{h.model_available ? "trained" : "not trained"}</Pill></li>
                <li className="flex justify-between"><span className="text-slate-400">Simulation</span><Pill tone={h.simulation_running ? "green" : "neutral"}>{h.simulation_running ? "running" : "stopped"}</Pill></li>
              </ul>
            )}
          </DataBoundary>
        </Card>

        <Card title="About this data">
          <div className="space-y-2 text-sm leading-relaxed text-slate-300">
            <p><b>All traffic, accident and incident figures are simulated</b> on a fictional road network; nothing here is real-world live data.</p>
            <DataBoundary loading={model.loading} error={model.error} data={model.data}>
              {(m) => <p className="text-slate-400">{m.available && m.info ? `Prediction model ${m.info.version}, trained ${fmtDateTime(m.info.trained_at)} on ${m.info.data_source} data.` : "No prediction model has been trained yet."}</p>}
            </DataBoundary>
            <p className="text-xs text-slate-500">API: {API_BASE || "same origin (development proxy)"} · <a className="text-accent hover:underline" href={`${API_BASE}/docs`} target="_blank" rel="noreferrer">API documentation</a></p>
            <p className="text-xs text-slate-500">Your sign-in token is kept in this browser's local storage until you sign out or it expires.</p>
          </div>
        </Card>

        <Card className="lg:col-span-2" title="User management">
          <RoleGate min="admin" action="manage users"><UsersTable /></RoleGate>
        </Card>
      </div>
    </>
  );
}
