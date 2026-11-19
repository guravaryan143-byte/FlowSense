/** Leaflet needs real layout, which jsdom does not have. Page tests swap the map for this stub that exposes its props. */
import type { TrafficMapProps } from "../maps/TrafficMap";

export const TrafficMap = (p: TrafficMapProps) => (
  <div data-testid="traffic-map" data-roads={p.roads.length} data-incidents={p.incidents?.length ?? 0} data-hotspots={p.hotspots?.length ?? 0}
       data-route-points={p.route?.primary?.length ?? 0} data-alt-points={p.route?.alternative?.length ?? 0} data-selected={p.selectedRoadId ?? ""}>
    {p.roads.slice(0, 3).map((r) => <button key={r.id} onClick={() => p.onSelectRoad?.(r.id)}>map-road-{r.id}</button>)}
  </div>
);
export const MapLegend = () => <div data-testid="map-legend" />;
export const LayerToggles = () => null;
