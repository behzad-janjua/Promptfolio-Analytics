import type { DailyClose } from "@/types";

interface Props {
  history: DailyClose[];
  current?: number;
  width?: number;
  height?: number;
}

export function Sparkline({ history, current, width = 76, height = 28 }: Props) {
  const closes = history.slice(-30).map((d) => d.close);
  if (current !== undefined) closes.push(current);
  if (closes.length < 2) return null;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const pad = height * 0.08;

  const toCoord = (v: number, i: number) => ({
    x: (i / (closes.length - 1)) * width,
    y: height - pad - ((v - min) / range) * (height - pad * 2),
  });

  const coords = closes.map(toCoord);
  const pts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  const last = coords[coords.length - 1];
  const isUp = closes[closes.length - 1] >= closes[0];
  const stroke = isUp ? "#10b981" : "#f43f5e";
  const fill   = isUp ? "rgba(16,185,129,0.07)" : "rgba(244,63,94,0.07)";

  const area = `M ${pts.split(" ")[0]} L ${pts} L ${width},${height} L 0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
    >
      <path d={area} fill={fill} />
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r="2.5" fill={stroke} />
    </svg>
  );
}
