import "server-only";
import React from "react";
import { Svg, Path, Circle, Rect, Text as PdfText, G, View, Text } from "@react-pdf/renderer";

// Hand-rolled SVG chart primitives for @react-pdf/renderer, which cannot
// rasterize an external charting library (Plotly, etc.) inside a
// serverless PDF render. These are deliberately simple — just enough to
// replicate the shape of v1's 4 real chart images in the Owner's Snapshot
// PDF (pies + a grouped bar chart), not a general charting library.

const PALETTE = [
  "#667eea",
  "#22d3ee",
  "#f472b6",
  "#facc15",
  "#4ade80",
  "#fb923c",
  "#60a5fa",
  "#c084fc",
  "#34d399",
  "#f87171",
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

// Draws the wedge from startAngle to endAngle, sweeping clockwise (the
// SVG sweep-flag=1 direction) — the point AT startAngle must be the arc's
// start point and the point AT endAngle its end point, in that order, or
// the arc bulges the wrong way for any slice over ~180°/half the circle
// (the previous version swapped these, producing the distorted/lopsided
// wedges seen in generated PDFs).
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

/** Simple pie chart with a legend, matching the look of v1's Plotly pies. */
export function PieChart({
  data,
  size = 150,
  title,
}: {
  data: { name: string; hours: number }[];
  size?: number;
  title?: string;
}) {
  const total = data.reduce((s, d) => s + d.hours, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  const nonZero = data.filter((d) => d.hours > 0);

  let angle = 0;
  const slices = nonZero.map((d, i) => {
    const sliceAngle = total > 0 ? (d.hours / total) * 360 : 0;
    // A single category holding 100% of the total would otherwise produce
    // a 360° arc whose start/end points coincide — SVG can't draw that as
    // a path (it collapses to nothing) — so cap it just under a full
    // circle; visually indistinguishable from a solid circle.
    const clampedAngle = Math.min(sliceAngle, 359.99);
    const path = arcPath(cx, cy, r, angle, angle + clampedAngle);
    angle += sliceAngle;
    return { path, color: PALETTE[i % PALETTE.length], ...d };
  });

  return (
    <View>
      {title && <Text style={{ fontSize: 8, fontWeight: 700, marginBottom: 3 }}>{title}</Text>}
      <Svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        {slices.length === 0 ? (
          <Circle cx={cx} cy={cy} r={r} fill="#e5e7eb" />
        ) : (
          slices.map((s, i) => <Path key={i} d={s.path} fill={s.color} stroke="#ffffff" strokeWidth={1} />)
        )}
      </Svg>
    </View>
  );
}

/**
 * Horizontal grouped bar chart — one bar-pair per row (e.g. billable vs
 * non-billable per employee), matching v1's stacked bar chart's data,
 * rendered as a grouped bar for simplicity/legibility within a PDF.
 */
export function GroupedBarChart({
  rows,
  width = 420,
  rowHeight = 14,
  seriesColors = ["#667eea", "#facc15"],
  seriesLabels = ["Billable", "Non-Billable"],
}: {
  rows: { label: string; values: number[] }[];
  width?: number;
  rowHeight?: number;
  seriesColors?: string[];
  seriesLabels?: string[];
}) {
  const labelWidth = 90;
  const chartWidth = width - labelWidth - 10;
  const maxVal = Math.max(1, ...rows.flatMap((r) => r.values));
  const barHeight = (rowHeight - 4) / seriesColors.length;
  const height = rows.length * rowHeight + 16;

  return (
    <Svg viewBox={`0 0 ${width} ${height}`} style={{ width, height }}>
      {/* Legend */}
      {seriesLabels.map((label, i) => (
        <G key={label}>
          <Rect x={labelWidth + i * 90} y={0} width={8} height={8} fill={seriesColors[i]} />
          <PdfText x={labelWidth + i * 90 + 11} y={7} style={{ fontSize: 6 }}>
            {label}
          </PdfText>
        </G>
      ))}
      {rows.map((row, ri) => {
        const y = 14 + ri * rowHeight;
        return (
          <G key={row.label}>
            <PdfText x={0} y={y + rowHeight / 2} style={{ fontSize: 6 }}>
              {row.label.length > 16 ? row.label.slice(0, 15) + "…" : row.label}
            </PdfText>
            {row.values.map((v, si) => {
              const barW = (v / maxVal) * chartWidth;
              return (
                <Rect
                  key={si}
                  x={labelWidth}
                  y={y + si * barHeight}
                  width={Math.max(0, barW)}
                  height={barHeight - 1}
                  fill={seriesColors[si % seriesColors.length]}
                />
              );
            })}
          </G>
        );
      })}
    </Svg>
  );
}

/** Simple horizontal single-series bar chart (Top 5 Projects). */
export function HorizontalBarChart({
  data,
  width = 420,
  rowHeight = 16,
  color = "#667eea",
}: {
  data: { name: string; hours: number }[];
  width?: number;
  rowHeight?: number;
  color?: string;
}) {
  const labelWidth = 110;
  const chartWidth = width - labelWidth - 40;
  const maxVal = Math.max(1, ...data.map((d) => d.hours));
  const height = data.length * rowHeight + 4;

  return (
    <Svg viewBox={`0 0 ${width} ${height}`} style={{ width, height }}>
      {data.map((d, i) => {
        const y = i * rowHeight;
        const barW = (d.hours / maxVal) * chartWidth;
        return (
          <G key={d.name}>
            <PdfText x={0} y={y + rowHeight / 2 + 2} style={{ fontSize: 6 }}>
              {d.name.length > 20 ? d.name.slice(0, 19) + "…" : d.name}
            </PdfText>
            <Rect x={labelWidth} y={y + 2} width={Math.max(0, barW)} height={rowHeight - 4} fill={color} />
            <PdfText x={labelWidth + barW + 3} y={y + rowHeight / 2 + 2} style={{ fontSize: 6 }}>
              {d.hours.toFixed(1)}
            </PdfText>
          </G>
        );
      })}
    </Svg>
  );
}

/** Plain (non-SVG) legend block to render alongside a PieChart. */
export function PieLegend({ data }: { data: { name: string; hours: number }[] }) {
  return (
    <View>
      {data
        .filter((d) => d.hours > 0)
        .map((d, i) => (
          <Text key={d.name} style={{ fontSize: 6, marginBottom: 1, color: PALETTE[i % PALETTE.length] }}>
            {"■ "}
            {d.name}: {d.hours.toFixed(1)}h
          </Text>
        ))}
    </View>
  );
}
