import React from 'react';

/**
 * Decorative two-sided tournament bracket used in the home hero.
 * Left half is one corner, right half the other; a gold path traces one
 * entry's run to the final.
 */
const W = 560;
const LEAF_W = 96;
const LEAF_H = 24;
const R2_X = 136;
const R2_W = 80;
const FINAL_W = 64;
const FINAL_X = (W - FINAL_W) / 2;
const leafYs = [36, 96, 204, 264];
const r2Ys = [66, 234];
const finalY = 150;

// Widths for the placeholder "name" bars inside each slot
const barWidths = [62, 48, 70, 54, 58, 66, 44, 60];

const mirror = (x: number, w = 0) => W - x - w;

const Slot: React.FC<{
  x: number;
  y: number;
  w: number;
  stroke: string;
  bar: number;
  highlight?: boolean;
}> = ({ x, y, w, stroke, bar, highlight }) => (
  <g>
    <rect
      x={x}
      y={y - LEAF_H / 2}
      width={w}
      height={LEAF_H}
      rx={4}
      fill="var(--bg-secondary)"
      stroke={highlight ? 'var(--accent-primary)' : stroke}
      strokeWidth={highlight ? 2 : 1.5}
    />
    <rect x={x + 8} y={y - 3} width={Math.min(bar, w - 16)} height={6} rx={3} fill="var(--border-secondary)" />
  </g>
);

const connector = (x1: number, yA: number, yB: number, x2: number) => {
  const mid = x1 + (x2 - x1) / 2;
  const yMid = (yA + yB) / 2;
  return `M${x1} ${yA} H${mid} V${yB} M${x1} ${yB} H${mid} M${mid} ${yMid} H${x2}`;
};

const mirrorPath = (d: string) =>
  d.replace(/([MH])(\d+(?:\.\d+)?)/g, (_, cmd, x) => `${cmd}${W - parseFloat(x)}`);

const BracketDiagram: React.FC<{ className?: string }> = ({ className }) => {
  const leftConnectors = [
    connector(LEAF_W, leafYs[0], leafYs[1], R2_X),
    connector(LEAF_W, leafYs[2], leafYs[3], R2_X),
    connector(R2_X + R2_W, r2Ys[0], r2Ys[1], FINAL_X),
  ];
  const rightConnectors = leftConnectors.map(mirrorPath);

  const midA = LEAF_W + (R2_X - LEAF_W) / 2;
  const midB = R2_X + R2_W + (FINAL_X - R2_X - R2_W) / 2;
  const winnerPath = `M${LEAF_W} ${leafYs[1]} H${midA} V${r2Ys[0]} H${R2_X + R2_W} H${midB} V${finalY} H${FINAL_X}`;

  return (
    <svg
      viewBox={`0 0 ${W} 300`}
      className={className}
      role="img"
      aria-label="A tournament bracket: eight entries meet head to head until one reaches the final"
    >
      <g fill="none" stroke="var(--border-secondary)" strokeWidth={1.5}>
        {leftConnectors.map((d) => <path key={d} d={d} />)}
        {rightConnectors.map((d) => <path key={d} d={d} />)}
      </g>

      <path
        d={winnerPath}
        pathLength={1}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth={3}
        strokeLinejoin="round"
        className="bracket-path"
      />

      {leafYs.map((y, i) => (
        <Slot key={`l${y}`} x={0} y={y} w={LEAF_W} stroke="var(--side-a)" bar={barWidths[i]} highlight={i === 1} />
      ))}
      {leafYs.map((y, i) => (
        <Slot key={`r${y}`} x={mirror(0, LEAF_W)} y={y} w={LEAF_W} stroke="var(--side-b)" bar={barWidths[i + 4]} />
      ))}
      {r2Ys.map((y, i) => (
        <Slot key={`l2${y}`} x={R2_X} y={y} w={R2_W} stroke="var(--side-a)" bar={barWidths[i + 2]} highlight={i === 0} />
      ))}
      {r2Ys.map((y, i) => (
        <Slot key={`r2${y}`} x={mirror(R2_X, R2_W)} y={y} w={R2_W} stroke="var(--side-b)" bar={barWidths[i + 5]} />
      ))}

      {/* Final slot */}
      <rect
        x={FINAL_X}
        y={finalY - 22}
        width={FINAL_W}
        height={44}
        rx={6}
        fill="var(--bg-secondary)"
        stroke="var(--border-secondary)"
        strokeWidth={1.5}
      />
      <g className="bracket-trophy">
        <rect x={FINAL_X} y={finalY - 22} width={FINAL_W} height={44} rx={6} fill="var(--accent-primary)" />
        {/* Trophy */}
        <path
          transform={`translate(${W / 2 - 12} ${finalY - 13})`}
          d="M6 1h12v4h4v2a5 5 0 01-5 5h-.4A6 6 0 0113 15.9V19h4v3H7v-3h4v-3.1A6 6 0 017.4 12H7a5 5 0 01-5-5V5h4V1zm0 6H4a3 3 0 002.3 2.9A6 6 0 016 8V7zm12 0v1a6 6 0 01-.3 1.9A3 3 0 0020 7h-2z"
          fill="var(--accent-primary-text)"
        />
      </g>
    </svg>
  );
};

export default BracketDiagram;
