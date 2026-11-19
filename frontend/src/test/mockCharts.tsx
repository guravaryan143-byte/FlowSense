/** Chart stubs that expose the data they were given, so page tests can assert on values without SVG layout. */
export const TrendChart = ({ series }: { series: unknown[] }) => <div data-testid="trend-chart" data-points={series.length} />;
export const HistoryChart = ({ points }: { points: unknown[] }) => <div data-testid="history-chart" data-points={points.length} />;
export const HourlyComparisonChart = ({ current, previous }: { current: unknown[]; previous: unknown[] }) => <div data-testid="hourly-chart" data-current={current.length} data-previous={previous.length} />;
export const LevelDonut = ({ counts }: { counts: Record<string, number> }) => <ul data-testid="level-donut">{Object.entries(counts).map(([k, v]) => <li key={k}>{k}:{v}</li>)}</ul>;
export const BarsChart = ({ data, label }: { data: { label: string; value: number }[]; label: string }) => <div data-testid="bars-chart" aria-label={label} data-points={data.length}>{data.map((d) => `${d.label}=${d.value}`).join(",")}</div>;
export const QueueChart = ({ fixed, adaptive }: { fixed: unknown[]; adaptive: unknown[] }) => <div data-testid="queue-chart" data-fixed={fixed.length} data-adaptive={adaptive.length} />;
export const CompareBarsChart = ({ data }: { data: unknown[] }) => <div data-testid="compare-chart" data-points={data.length} />;
