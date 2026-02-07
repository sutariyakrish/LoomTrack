export function formatWorkerLabel(workerName, ranges = []) {
  if (!ranges.length) return workerName;

  const parts = ranges.map(r => {
    return r.from === r.to
      ? `${r.from}`
      : `${r.from}-${r.to}`;
  });

  return `${workerName} ${parts.join(" ")}`;
}
