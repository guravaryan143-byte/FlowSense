import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button, Card, Field, Input } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { errorMessage } from "../services/api";

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === "signin") await login(email, password); else await register(name, email, password);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-md">
      <Card title={mode === "signin" ? "Sign in to FlowSense" : "Create an account"}
            subtitle="Browsing is open to everyone. Signing in lets you report incidents, run simulations and, with the right role, manage the network.">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-ink-900 p-1" role="tablist">
          {(["signin", "signup"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }}
              className={`rounded-md py-1.5 text-sm ${mode === m ? "bg-ink-700 text-slate-50" : "text-slate-400 hover:text-slate-200"}`}>
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {mode === "signup" && (
            <Field label="Name" htmlFor="name"><Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
          )}
          <Field label="Email" htmlFor="email"><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
          <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters. New accounts start as viewers." : undefined}>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} required />
          </Field>
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
          <Button type="submit" loading={busy} className="w-full">{mode === "signin" ? "Sign in" : "Create account"}</Button>
        </form>
        <p className="mt-4 text-xs text-slate-500">Demo accounts (viewer / operator / admin) are created by <code className="text-slate-300">python -m app.seed</code>.</p>
      </Card>
    </div>
  );
}
