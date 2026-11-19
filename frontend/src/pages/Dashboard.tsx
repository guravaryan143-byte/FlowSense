import { Activity, AlertTriangle, Gauge, Layers, Route, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { HourlyComparisonChart, LevelDonut, TrendChart } from "../charts/charts";
import { Card, DataBoundary, KpiCard, PageHeader, SimBanner } from "../components/ui";
import { ActivityList, IncidentFeed, PredictionSummary, RoutingSummary, SignalSummary } from "../dashboard/widgets";
import { useAsync } from "../hooks/useAsync";
import { useLiveTraffic } from "../hooks/useLiveTraffic";
import { LayerToggles, MapLegend, TrafficMap, type LayerKey } from "../maps/TrafficMap";
import { getIncidents, getIntersections, getOverview, getPredictionOverview, getRoads, getTrends } from "../services/endpoints";
import type { RoadTraffic } from "../types";
import { fmtDateTime, fmtDec, fmtInt } from "../utils/format";

export default function Dashboard() {
  const live = useLiveTraffic();
  const overview = useAsync(getOverview, [], { intervalMs: 15000 });
  const trends = useAsync(() => getTrends(24), [], { intervalMs: 60000 });
  const prediction = useAsync(getPredictionOverview, [], { intervalMs: 30000 });
  const incidents = useAsync(() => getIncidents({ active_only: true, limit: 6 }), [], { intervalMs: 15000 });
  const roads = useAsync(getRoads, []);
  const intersections = useAsync(getIntersections, []);
  const [layers, setLayers] = useState<Partial<Record<LayerKey, boolean>>>({});

  const trafficById = useMemo(() => Object.fromEntries((live.data?.roads ?? []).map((r) => [r.road_id, r])) as Record<number, RoadTraffic>, [live.data]);
  const s = live.data?.summary;

  return (
    <>
      <PageHeader title="City overview" description="Real-time picture of the simulated city: traffic, forecasts, incidents, emergency routing and signal performance." />
      <SimBanner asOf={s?.as_of ? fmtDateTime(s.as_of) : null} />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {live.error && !s ? <div className="col-span-full"><DataBoundary loading={false} error={live.error} data={null} onRetry={live.refetch}>{() => null}</DataBoundary></div> : <>
          <KpiCard label="Vehicles monitored" value={fmtInt(s?.total_vehicles)} icon={<Users className="h-4 w-4" />} hint={live.streaming ? "Updating live" : "Refreshes every 10 s"} />
          <KpiCard label="Roads" value={s ? `${s.open_roads}/${s.road_count}` : "—"} icon={<Route className="h-4 w-4" />} hint="open / total" />
          <KpiCard label="Congested roads" value={fmtInt(s?.congested_roads)} icon={<Layers className="h-4 w-4" />} tone={s && s.congested_roads > 0 ? "bad" : "good"} hint="heavy or severe" />
          <KpiCard label="Average speed" value={fmtDec(s?.average_speed)} unit="km/h" icon={<Gauge className="h-4 w-4" />} />
          <KpiCard label="Average density" value={fmtDec(s?.average_density)} unit="veh/km/lane" icon={<Activity className="h-4 w-4" />} />
          <KpiCard label="Active incidents" value={fmtInt(overview.data?.active_incidents)} icon={<AlertTriangle className="h-4 w-4" />} tone={overview.data && overview.data.active_incidents > 0 ? "warn" : "good"} />
        </>}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Live traffic map" subtitle="Road colour shows congestion. Click a road for details on the Traffic Monitoring page."
              actions={<LayerToggles value={layers} onChange={setLayers} available={["roads", "intersections", "incidents"]} />}>
          <DataBoundary loading={roads.loading || live.loading} error={roads.error ?? live.error} data={roads.data} onRetry={() => { roads.refetch(); live.refetch(); }} height={360}>
            {(r) => (
              <div className="space-y-3">
                <TrafficMap roads={r} intersections={intersections.data ?? []} traffic={trafficById} incidents={incidents.data?.items ?? []} layers={layers} height={400} />
                <MapLegend items={["traffic", "incident"]} />
              </div>
            )}
          </DataBoundary>
        </Card>

        <div className="space-y-4">
          <Card title="Congestion distribution">
            <DataBoundary loading={live.loading} error={live.error} data={live.data} onRetry={live.refetch}>{(d) => <LevelDonut counts={d.summary.level_counts} />}</DataBoundary>
          </Card>
          <Card title="Congestion forecast" subtitle="AI model, simulated data">
            <DataBoundary loading={prediction.loading} error={prediction.error} data={prediction.data} onRetry={prediction.refetch}>{(d) => <PredictionSummary data={d} />}</DataBoundary>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Traffic trend, last 24 h" subtitle="City-wide averages">
          <DataBoundary loading={trends.loading} error={trends.error} data={trends.data} onRetry={trends.refetch} isEmpty={(d) => d.series.length === 0} emptyTitle="No traffic history yet" emptyHint="Seed the database or start the simulation.">
            {(d) => <TrendChart series={d.series} />}
          </DataBoundary>
        </Card>
        <Card title="Hourly pattern vs last week" subtitle="Average density by hour of day">
          <DataBoundary loading={trends.loading} error={trends.error} data={trends.data} onRetry={trends.refetch} isEmpty={(d) => d.series.length === 0}>
            {(d) => <HourlyComparisonChart current={d.comparison.current ?? []} previous={d.comparison.previous_week ?? []} />}
          </DataBoundary>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Incident notifications">
          <DataBoundary loading={incidents.loading} error={incidents.error} data={incidents.data} onRetry={incidents.refetch}>{(d) => <IncidentFeed incidents={d.items} />}</DataBoundary>
        </Card>
        <Card title="Recent traffic activity" subtitle="Busiest roads right now">
          <DataBoundary loading={live.loading} error={live.error} data={live.data} onRetry={live.refetch}>{(d) => <ActivityList roads={d.roads} />}</DataBoundary>
        </Card>
        <Card title="Emergency routing">
          <DataBoundary loading={overview.loading} error={overview.error} data={overview.data} onRetry={overview.refetch}>{(d) => <RoutingSummary data={d.emergency} />}</DataBoundary>
        </Card>
        <Card title="Signal optimisation" subtitle="Measured in simulation">
          <DataBoundary loading={overview.loading} error={overview.error} data={overview.data} onRetry={overview.refetch}>{(d) => <SignalSummary data={d.signal_performance} />}</DataBoundary>
        </Card>
      </div>
    </>
  );
}
