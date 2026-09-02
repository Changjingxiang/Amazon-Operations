export default function Sparkline({ values, color = '#27C7D9' }) {
  const width = 74;
  const height = 24;
  const valid = values.filter((value) => value != null && value > 0);
  if (valid.length < 2) return <span className="sparkline-empty">—</span>;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = Math.max(1, max - min);
  const xAt = (index) => (index / Math.max(1, values.length - 1)) * (width - 6) + 3;
  const yAt = (value) => 3 + ((value - min) / range) * (height - 6);
  const segments = [];
  let current = [];
  values.forEach((value, index) => {
    if (value == null || value <= 0) {
      if (current.length > 1) segments.push(current);
      current = [];
    } else {
      current.push([xAt(index), yAt(value)]);
    }
  });
  if (current.length > 1) segments.push(current);
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {segments.map((segment, index) => (
        <polyline
          key={index}
          points={segment.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
