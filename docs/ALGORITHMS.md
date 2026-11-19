# Algorithms — input, output, complexity, purpose

All code lives in `backend/app/algorithms/` (pure functions: no database, no web framework) except the
simulator (`app/simulation/engine.py`) and the ML pipeline (`app/ml/`).

| # | Algorithm | File | Input | Output | Time complexity | Practical purpose |
|---|---|---|---|---|---|---|
| 1 | **Dijkstra** | `algorithms/graph.py::dijkstra` | `RoadGraph`, source, target, objective (`time`/`distance`), optional penalties | `RouteResult` (nodes, roads, distance, time) or `None` | O((V+E) log V) with a binary heap | Guaranteed-optimal emergency route; reference implementation |
| 2 | **A\*** | `graph.py::a_star` | same | same (identical cost to Dijkstra) | worst case = Dijkstra; far fewer expansions in practice | Faster search using a straight-line heuristic |
| 3 | **Penalty alternative route** | `graph.py::alternative_route` | graph, primary route | a second route using different roads, or `None` | up to 3 extra searches | "Alternative route" display |
| 4 | **Bounded green allocation** | `signal.py::allocate_green` | queue pressure per phase, limits | green seconds per phase | O(p²), p = 2 phases | Adaptive signal timing that always respects min/max green |
| 5 | **Intersection micro-simulation** | `signal.py::simulate_intersection` | approaches, strategy, seed, scenario | wait time, throughput, queue, queue time-series | O(T · a) for T seconds, a approaches | *Measured* fixed-vs-adaptive comparison |
| 6 | **DBSCAN (haversine)** | `hotspots.py::find_hotspots` | accident coordinates, eps (m), min samples | ranked clusters with statistics | O(n log n) average (ball tree) | Historical accident hotspots |
| 7 | **Store-and-forward simulation** | `simulation/engine.py` | network, demand, signals, incidents | per-road vehicles, speed, density | O(R) per tick, R = roads | Produces traffic data and live updates |
| 8 | **Random Forest regression** | `ml/train.py` | 19 engineered features | density and speed 30 min ahead | training O(T · n log n); prediction O(T · depth) | Congestion prediction |

## 1–2. Dijkstra and A*

* **Edge weight:** `time` = road length ÷ effective speed, where effective speed =
  `min(speed limit, latest measured speed × emergency factor)` (ambulance 1.35, fire service 1.25, minimum 5 km/h);
  `distance` = road length. Closed roads are removed from the graph.
* **Fastest ≠ shortest.** Every route request computes *both* and reports them side by side
  (`comparison` in the API). The selected `objective` decides which one is the primary route.
* **A\* heuristic.** `h(n) = straight_line(n, target) / v_max` for time (`v_max` = fastest effective speed on any open road),
  `h(n) = straight_line(n, target)` for distance. Every road is at least as long as the straight line between its ends
  (verified by construction: lengths come from the geometry polyline), so `h` never overestimates: A\* stays optimal.
* **Tests:** hand-checked graphs, closures, unreachable targets, 20 random queries on a grid where Dijkstra and A\* must give the same cost.

## 3. Alternative route (penalty method)

Multiply the weight of every road on the primary route by 1.5 (then 2.5, then 4.0) and search again. Accept the first
result that uses a different set of roads and costs at most 1.6× the primary. Simple, explainable, and good enough for a
dashboard; it is *not* a k-shortest-paths algorithm and can return `None` where one road is the only way in.

## 4. Bounded green allocation

Pressure of a phase = estimated queued vehicles on its approaches (+1 smoothing). Green is split proportionally from
`cycle − lost time` (default 90 − 8 = 82 s). If a phase would fall outside `[10 s, 60 s]`, the worst offender is clamped,
removed, and the remaining time is re-split among the others. For two phases the result always lies inside the limits and
sums to 82 s (property-tested on 500 random inputs).

## 5. Intersection micro-simulation (how improvements are *measured*)

* One-second time steps, Poisson arrivals drawn **before** the strategy runs, so *fixed* and *adaptive* receive exactly the
  same vehicles (same seed ⇒ same `vehicles_arrived`; tested).
* Saturation flow 1800 veh/h/lane; 4 s yellow/all-red after each green.
* *Fixed*: 41 s / 41 s every cycle. *Adaptive*: each cycle, pressure = arrivals in the previous cycle + vehicles left
  unserved by that phase's last green. (Reading the raw queue at cycle start was tried first and measured **worse** under
  balanced demand because it is biased toward the phase served last.)
* Reported metrics: average wait per vehicle (vehicles still queued at the end count their wait so far), throughput, mean
  and max queue, final queue.

Reproduce with `python -m app.simulation.benchmark_signals` (10 seeds, 1 simulated hour, 4 single-lane approaches, 500 veh/h each):

| scenario | fixed wait | adaptive wait | change | throughput fixed → adaptive |
|---|---|---|---|---|
| balanced | 21.2 s | 21.6 s | +1.9 % (no real difference) | 1970 → 1970 |
| ns_heavy | 48.6 s | 18.8 s | −61.4 % | 2166 → 2192 |
| shifting | 44.6 s | 18.3 s | −59.1 % | 2069 → 2084 |

Interpretation: adaptive control helps when demand is unbalanced or changes during the hour, and has nothing to gain when
demand is balanced. These are results from a simplified two-phase model, not field measurements.

## 6. DBSCAN hotspots

DBSCAN with the haversine metric on (lat, lon) in radians; `eps` = 150 m, `min_samples` = 8 by default (query parameters).
Points that belong to no cluster are *noise* and are reported as such. Clusters are ranked by a severity-weighted score
(low 1, medium 2, high 4, critical 8). A hotspot says where accidents **were** concentrated; it is **not** a prediction and
not proof of cause (the API response carries this disclaimer).

## 7. Store-and-forward traffic simulator

State = vehicles on each road. Each 5-minute tick: (1) external demand enters following a time-of-day profile
(two weekday peaks, flatter weekend); (2) each road can discharge `saturation flow × lanes × green share × incident factor ×
jam penalty`; (3) departing vehicles exit the network (25 %) or move to connected roads, limited by free space there
(blocked vehicles stay ⇒ queues spill back); (4) speed follows Greenshields: `v = v_free · (1 − k/k_jam)`.
Congestion level = occupancy (`vehicles / jam capacity`): `<0.25` free flow, `<0.50` moderate, `<0.75` heavy, else severe.
Demand levels were calibrated so a weekday shows ≈ 0.08 mean occupancy at night and ≈ 0.45–0.55 at the peaks; network
recovery overnight is verified.

## 8. Random Forest

* **Task:** from the state at time *t* (vehicle count, speed, density, occupancy, lags at 15 and 60 min, rolling mean, trend,
  road characteristics, and hour/day of the *target* time) predict density and speed at *t + 30 min* (multi-output regression).
* **Cleaning:** negatives → missing; forward-fill ≤ 30 min; then the road's expanding median of *earlier* readings; then
  domain priors. Uses only past data.
* **Split:** chronological, last 20 % of time = test; training rows whose target time reaches into the test period are dropped.
* **Baselines:** persistence ("nothing changes") and historical mean per (road, weekday, hour) computed on training data only.

| model (test set, 15,064 rows) | density MAE | density RMSE | density R² | speed MAE | speed RMSE | speed R² |
|---|---|---|---|---|---|---|
| **Random Forest** | **0.972** | **2.714** | **0.983** | **1.206** | **2.233** | **0.969** |
| Persistence | 3.457 | 7.343 | 0.878 | 2.152 | 3.480 | 0.924 |
| Historical mean | 3.023 | 8.591 | 0.833 | 1.893 | 3.634 | 0.917 |

(density in vehicles/km/lane, speed in km/h.) **Read this carefully:** the data comes from the project's own simulator,
whose demand follows a smooth daily curve with only ≈ 8 % noise, so a 30-minute-ahead forecast is *easy*. These numbers show the
pipeline is correct and beats naive baselines on this data; they say little about how it would perform on real city traffic.
A second caveat: random disruptions (breakdowns) are invisible to the model, as they would be in reality.
