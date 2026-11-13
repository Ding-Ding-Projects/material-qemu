export function chartPoints(history, metric) {
  const samples = history
    .map((sample) => ({
      time: Date.parse(sample.sampledAt),
      value:
        metric === "cpu"
          ? sample.cpuPercent
          : sample.memoryTotal > 0
            ? (100 * sample.memoryUsed) / sample.memoryTotal
            : null,
    }))
    .filter(
      (sample) => Number.isFinite(sample.time) && Number.isFinite(sample.value),
    );
  if (samples.length < 2) return null;
  const first = samples[0].time,
    last = samples.at(-1).time;
  if (last <= first) return null;
  return {
    count: samples.length,
    first,
    last,
    points: samples
      .map(
        (sample) =>
          `${((320 * (sample.time - first)) / (last - first)).toFixed(2)},${(84 - 0.78 * Math.max(0, Math.min(100, sample.value))).toFixed(2)}`,
      )
      .join(" "),
  };
}
export function historyChart(history, metric, label, escape) {
  const data = chartPoints(history, metric);
  if (!data) return "";
  return `<svg class="history-chart ${metric}" viewBox="0 0 320 90" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title><path d="M0 84H320" class="chart-axis"/><polyline points="${data.points}"/></svg><small>${data.count} ${escape(label)}</small>`;
}
