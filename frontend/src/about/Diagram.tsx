import clsx from "clsx";
import { useEffect, useId, useRef } from "react";

import { about, type EdgeId, type NodeId } from "./content";
import { anchor, EDGES, GROUPS, LANE_LABELS, LANE_LINES, NODES, VIEW } from "./layout";
import { reducedMotion } from "./links";

const { diagram } = about;
const TRANSITION = "transition-[fill,stroke,stroke-width] duration-200 ease-out";

type Props = { nodes: NodeId[]; edges: EdgeId[] };

/**
 * The architecture diagram (docs/12-about-page.md, Diagram): lanes, groups, nodes and edges from layout.ts, with the
 * current step's nodes and edges active. Below 768 px it keeps its 680 px width and scrolls inside its own box,
 * bringing the step's first active node into view when the step changes.
 */
export default function Diagram({ nodes, edges }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const markers = useId();
  const active = new Set<string>(nodes);
  const activeEdges = new Set<string>(edges);
  const first = nodes[0];

  useEffect(() => {
    const box = scroller.current!;
    if (!first || box.scrollWidth <= box.clientWidth) return;
    const scale = box.scrollWidth / VIEW.width;
    const { x, w } = NODES[first];
    const left = (x + w / 2) * scale - box.clientWidth / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? "auto" : "smooth" });
  }, [first, nodes]);

  return (
    <div ref={scroller} data-diagram-scroller className="overflow-x-auto rounded-xl border border-line bg-surface">
      <svg
        role="img"
        aria-label={diagram.label}
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        className="block h-auto w-[680px] max-w-none font-sans md:w-full"
      >
        <defs>
          {(["idle", "active"] as const).map((state) => (
            <marker
              key={state}
              id={`${markers}-${state}`}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="8"
              markerHeight="8"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M1,1 L7,4 L1,7" fill="none" strokeWidth="1.5" className={state === "active" ? "stroke-accent" : "stroke-line-strong"} />
            </marker>
          ))}
        </defs>

        {LANE_LINES.map((x) => (
          <line key={x} x1={x} x2={x} y1={8} y2={VIEW.height - 8} strokeDasharray="3 5" className="stroke-line-strong" />
        ))}
        {Object.entries(LANE_LABELS).map(([lane, x]) => (
          <text key={lane} x={x} y={14} textAnchor="middle" fontSize={11} className="fill-fg-muted">
            {diagram.lanes[lane as keyof typeof LANE_LABELS]}
          </text>
        ))}

        {Object.entries(GROUPS).map(([group, { x, y, w, h }]) => (
          <g key={group}>
            <rect x={x} y={y} width={w} height={h} rx={10} fill="none" strokeDasharray="4 4" className="stroke-line-strong" />
            {/* The agent loop's label sits at the right, clear of the edge that drops from the API into the model. */}
            <text x={group === "agentLoop" ? x + w - 10 : x + 10} y={y + 14} textAnchor={group === "agentLoop" ? "end" : "start"} fontSize={11} className="fill-fg-muted">
              {diagram.groups[group as keyof typeof GROUPS]}
            </text>
          </g>
        ))}

        {(Object.entries(EDGES) as [EdgeId, (typeof EDGES)[EdgeId]][]).map(([id, [from, to]]) => {
          const on = activeEdges.has(id);
          const [x1, y1] = anchor(from);
          const [x2, y2] = anchor(to);
          return (
            <line
              key={id}
              data-edge={id}
              data-active={on || undefined}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={on ? 2.5 : 1.5}
              markerEnd={`url(#${markers}-${on ? "active" : "idle"})`}
              className={clsx(
                TRANSITION,
                on ? "animate-[edge-flow_0.7s_linear_infinite] stroke-accent [stroke-dasharray:8_6] motion-reduce:[stroke-dasharray:none]" : "stroke-line-strong",
              )}
            />
          );
        })}

        {(Object.entries(NODES) as [NodeId, (typeof NODES)[NodeId]][]).map(([id, { kind, x, y, w, h }]) => {
          const on = active.has(id);
          const [label, detail] = diagram.nodes[id];
          const cx = x + w / 2;
          const cy = y + h / 2;
          return (
            <g key={id} data-node={id} data-active={on || undefined}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={kind === "chip" ? h / 2 : 8}
                strokeWidth={1}
                className={clsx(TRANSITION, on ? "fill-accent stroke-accent" : "fill-surface stroke-line-strong")}
              />
              <text
                x={cx}
                y={detail ? cy - 3 : cy + 4}
                textAnchor="middle"
                fontSize={kind === "chip" ? 11 : 12}
                fontWeight={500}
                className={clsx(TRANSITION, on ? "fill-accent-fg" : "fill-fg")}
              >
                {label}
              </text>
              {detail && (
                <text x={cx} y={cy + 12} textAnchor="middle" fontSize={11} className={clsx(TRANSITION, on ? "fill-accent-fg" : "fill-fg-muted")}>
                  {detail}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
