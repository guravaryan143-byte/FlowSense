import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { AppLayout } from "./layouts/AppLayout";

// Each page is loaded on demand so the map and chart libraries are not in the first download.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const TrafficMonitoring = lazy(() => import("./pages/TrafficMonitoring"));
const Predictions = lazy(() => import("./pages/Predictions"));
const Signals = lazy(() => import("./pages/Signals"));
const EmergencyRoutes = lazy(() => import("./pages/EmergencyRoutes"));
const Accidents = lazy(() => import("./pages/Accidents"));
const Incidents = lazy(() => import("./pages/Incidents"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const Landing = lazy(() => import("./pages/Landing"));

/** Same dark canvas as the page, so lazy-loading the landing never flashes white. */
const LandingFallback = () => <div className="min-h-[100dvh] bg-ink-950" role="status" aria-label="Loading FlowSense" />;

const PublicLanding = () => <Suspense fallback={<LandingFallback />}><Landing /></Suspense>;

/** "/" is the front door for visitors. People who are already signed in (and anyone returning from the sign-in form) go straight to the dashboard. */
function Home() {
  const { user, loading } = useAuth();
  if (loading) return <LandingFallback />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <PublicLanding />;
}

function NotFound() {
  return (
    <div className="grid place-items-center gap-3 py-24 text-center">
      <h1 className="text-2xl font-semibold text-slate-100">Page not found</h1>
      <Link to="/dashboard" className="text-accent hover:underline">Back to the dashboard</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/welcome" element={<PublicLanding />} />
      <Route element={<AppLayout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="traffic" element={<TrafficMonitoring />} />
        <Route path="predictions" element={<Predictions />} />
        <Route path="signals" element={<Signals />} />
        <Route path="emergency" element={<EmergencyRoutes />} />
        <Route path="accidents" element={<Accidents />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
