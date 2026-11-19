import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Accident, Hotspot, Incident, Intersection, Road, RoadTraffic } from "../types";
import { LEVEL_COLOR, LEVEL_LABEL, SEVERITY_COLOR, levelColor } from "../utils/congestion";
import { fmtDec, fmtInt } from "../utils/format";

export type LayerKey = "roads" | "intersections" | "incidents" | "hotspots" | "accidents" | "routes";
export type LatLng = [number, number];

export interface TrafficMapProps {
  roads: Road[];
  intersections?: Intersection[];
  traffic?: Record<number, RoadTraffic>;
  selectedRoadId?: number | null;
  onSelectRoad?: (id: number) => void;
  incidents?: Incident[];
  hotspots?: Hotspot[];
  accidents?: Accident[];
  route?: { primary?: LatLng[]; alternative?: LatLng[]; originId?: number; destinationId?: number };
  layers?: Partial<Record<LayerKey, boolean>>;
  height?: number | string;
}

const DEFAULT_LAYERS: Record<LayerKey, boolean> = { roads: true, intersections: true, incidents: true, hotspots: true, accidents: false, routes: true };
const WIDTH: Record<string, number> = { arterial: 6, collector: 4, local: 3 };

/** Fit the view to a set of points whenever their identity (count + first/last) changes. */
function FitTo({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.length ? `${points.length}:${points[0]}:${points[points.length - 1]}` : "";
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export function TrafficMap({ roads, intersections = [], traffic = {}, selectedRoadId, onSelectRoad, incidents = [], hotspots = [],
  accidents = [], route, layers, height = 420 }: TrafficMapProps) {
  const on = { ...DEFAULT_LAYERS, ...layers };
  const fitPoints: LatLng[] = route?.primary?.length ? route.primary : roads.flatMap((r) => r.geometry as LatLng[]);

  return (
    <div className="overflow-hidden rounded-xl border border-line" style={{ height }} data-testid="traffic-map">
      <MapContainer center={[18.53, 73.855]} zoom={14} preferCanvas style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        <FitTo points={fitPoints} />

        {on.roads && roads.map((road) => {
          const t = traffic[road.id];
          const closed = road.is_closed || t?.congestion_level === "closed";
          const color = closed ? LEVEL_COLOR.closed : t ? levelColor(t.congestion_level) : "#475569";
          const selected = road.id === selectedRoadId;
          return (
            <Polyline key={road.id} positions={road.geometry as LatLng[]}
              pathOptions={{ color: selected ? "#ffffff" : color, weight: (WIDTH[road.road_type] ?? 4) + (selected ? 3 : 0), opacity: closed ? 0.8 : 0.95, dashArray: closed ? "6 8" : undefined }}
              eventHandlers={{ click: () => onSelectRoad?.(road.id) }}>
              <Tooltip sticky>
                <div className="text-xs">
                  <div className="font-semibold">{road.road_name}</div>
                  {t ? <div>{closed ? "Closed" : LEVEL_LABEL[t.congestion_level]} · {fmtInt(t.vehicle_count)} veh · {fmtDec(t.average_speed)} km/h</div> : <div>No data</div>}
                </div>
              </Tooltip>
            </Polyline>
          );
        })}

        {on.routes && route?.alternative && <Polyline positions={route.alternative} pathOptions={{ color: "#3b82f6", weight: 5, dashArray: "4 8", opacity: 0.9 }} />}
        {on.routes && route?.primary && <Polyline positions={route.primary} pathOptions={{ color: "#22d3ee", weight: 8, opacity: 0.95 }} />}

        {on.intersections && intersections.map((n) => {
          const isOrigin = n.id === route?.originId, isDest = n.id === route?.destinationId;
          return (
            <CircleMarker key={n.id} center={[n.latitude, n.longitude]} radius={isOrigin || isDest ? 9 : 4}
              pathOptions={{ color: isOrigin ? "#22c55e" : isDest ? "#ef4444" : "#94a3b8", fillColor: "#0b1220", fillOpacity: 1, weight: isOrigin || isDest ? 4 : 2 }}>
              <Tooltip direction="top" permanent={isOrigin || isDest}>{isOrigin ? "Start: " : isDest ? "Destination: " : ""}{n.name}</Tooltip>
            </CircleMarker>
          );
        })}

        {on.accidents && accidents.map((a) => (
          <CircleMarker key={a.id} center={[a.latitude, a.longitude]} radius={3} pathOptions={{ color: SEVERITY_COLOR[a.severity], fillColor: SEVERITY_COLOR[a.severity], fillOpacity: 0.55, weight: 0 }} />
        ))}

        {on.hotspots && hotspots.map((h) => (
          <Circle key={h.rank} center={[h.center_lat, h.center_lon]} radius={Math.max(h.radius_m, 90)}
            pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.18, weight: 2 }}>
            <Tooltip permanent direction="center" className="hotspot-label">{h.rank}</Tooltip>
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">Hotspot #{h.rank} · {h.nearest_road}</div>
                <div>{h.accident_count} accidents · severity score {h.severity_score}</div>
                <div className="mt-1 text-slate-400">Historical concentration, not a prediction.</div>
              </div>
            </Popup>
          </Circle>
        ))}

        {on.incidents && incidents.filter((i) => i.status !== "resolved").map((i) => (
          <CircleMarker key={i.id} center={[i.latitude, i.longitude]} radius={9}
            pathOptions={{ color: SEVERITY_COLOR[i.severity], fillColor: SEVERITY_COLOR[i.severity], fillOpacity: 0.35, weight: 3, dashArray: i.closes_road ? "3 3" : undefined }}>
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">{i.incident_type.replace("_", " ")} · {i.severity}</div>
                <div>{i.road_name ?? "Off-network location"}{i.closes_road ? " · road closed" : ""}</div>
                {i.description && <div className="mt-1 text-slate-300">{i.description}</div>}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

export function MapLegend({ items = ["traffic", "incident", "hotspot", "route"] }: { items?: ("traffic" | "incident" | "hotspot" | "route" | "accident")[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400" aria-label="Map legend">
      {items.includes("traffic") && (["free_flow", "moderate", "heavy", "severe", "closed"] as const).map((l) => (
        <span key={l} className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded" style={{ background: LEVEL_COLOR[l] }} />{LEVEL_LABEL[l]}</span>
      ))}
      {items.includes("incident") && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-orange-400 bg-orange-400/30" />Incident</span>}
      {items.includes("hotspot") && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-red-500 bg-red-500/20" />Accident hotspot</span>}
      {items.includes("accident") && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" />Accident</span>}
      {items.includes("route") && <><span className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded bg-accent" />Recommended route</span><span className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded border-t-2 border-dashed border-blue-500" />Alternative</span></>}
    </div>
  );
}

export function LayerToggles({ value, onChange, available }: { value: Partial<Record<LayerKey, boolean>>; onChange: (v: Partial<Record<LayerKey, boolean>>) => void; available: LayerKey[] }) {
  const label: Record<LayerKey, string> = { roads: "Roads", intersections: "Intersections", incidents: "Incidents", hotspots: "Hotspots", accidents: "Accidents", routes: "Routes" };
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Map layers">
      {available.map((k) => {
        const checked = value[k] ?? DEFAULT_LAYERS[k];
        return (
          <label key={k} className={`cursor-pointer select-none rounded-full border px-2.5 py-1 text-xs transition-colors ${checked ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-slate-400 hover:text-slate-200"}`}>
            <input type="checkbox" className="sr-only" checked={checked} onChange={() => onChange({ ...value, [k]: !checked })} />
            {label[k]}
          </label>
        );
      })}
    </div>
  );
}
