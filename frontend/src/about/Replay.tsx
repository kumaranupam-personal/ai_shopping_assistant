import clsx from "clsx";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { about } from "./content";
import Diagram from "./Diagram";
import { NewTabLink, reducedMotion, REPLAY_ID } from "./links";
import { SectionHeading } from "./Section";

const { replay, turns } = about;
const AUTOPLAY_MS = 2500;

/**
 * The recorded conversation (docs/12-about-page.md, Replay): a turn index and a step index pick what the tabs, the
 * diagram and the step panel show. Autoplay walks the first turn once when the section comes into view.
 */
export default function Replay() {
  const [position, setPosition] = useState({ turn: 0, step: 0 });
  const turn = turns[position.turn];
  const step = turn.steps[position.step];
  const lastStep = position.step === turn.steps.length - 1;
  const lastTurn = position.turn === turns.length - 1;

  const advance = () =>
    setPosition(({ turn: t, step: s }) =>
      s < turns[t].steps.length - 1 ? { turn: t, step: s + 1 } : { turn: t < turns.length - 1 ? t + 1 : 0, step: 0 },
    );

  const section = useRef<HTMLElement>(null);
  const autoplay = useAutoplay(section, () => setPosition((p) => (p.turn === 0 && p.step < turns[0].steps.length - 1 ? { ...p, step: p.step + 1 } : p)));
  useEffect(() => {
    if (position.turn === 0 && position.step === turns[0].steps.length - 1) autoplay.finish(); // it stops on the first turn's last step
  }, [position, autoplay.finish]);

  return (
    <section
      id={REPLAY_ID}
      ref={section}
      aria-labelledby={`${REPLAY_ID}-heading`}
      onClickCapture={autoplay.stop}
      onKeyDownCapture={autoplay.stop}
      className="flex scroll-mt-4 flex-col gap-5"
    >
      <SectionHeading id={`${REPLAY_ID}-heading`} heading={replay.heading} line={replay.line} />
      <TurnTabs selected={position.turn} onSelect={(t) => setPosition({ turn: t, step: 0 })} />
      <div role="tabpanel" id={`${REPLAY_ID}-panel`} aria-labelledby={`${REPLAY_ID}-tab-${position.turn}`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="max-w-full rounded-2xl rounded-bl-md bg-accent-soft px-4 py-2 text-accent-soft-fg [overflow-wrap:anywhere]">{turn.message}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
            <span className="tabular-nums">{turn.summary}</span>
            {turn.traceUrl && (
              <NewTabLink href={turn.traceUrl} className="font-medium text-accent underline-offset-2 hover:underline">
                {replay.traceLink}
              </NewTabLink>
            )}
          </p>
        </div>
        <Diagram nodes={step.nodes} edges={step.edges} />
        <div className="flex min-h-[168px] flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
          <div aria-live="polite" className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">{step.title}</h3>
              <span className="shrink-0 text-xs text-fg-muted tabular-nums">{replay.stepOf(position.step + 1, turn.steps.length)}</span>
            </div>
            <p className="text-sm text-fg-muted">{step.description}</p>
          </div>
          <CodeBlock code={step.code} />
        </div>
        <div className="flex items-center justify-between gap-3">
          {position.step > 0 ? (
            <button
              type="button"
              onClick={() => setPosition((p) => ({ ...p, step: p.step - 1 }))}
              className="h-9 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium transition-colors duration-150 ease-out hover:bg-tile"
            >
              {replay.back}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={advance}
            className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-opacity duration-150 ease-out hover:opacity-90"
          >
            {!lastStep ? replay.nextStep : lastTurn ? replay.startOver : replay.nextTurn}
          </button>
        </div>
      </div>
    </section>
  );
}

/** One tab per turn; the arrow keys move between them and select as they go. */
function TurnTabs({ selected, onSelect }: { selected: number; onSelect: (turn: number) => void }) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const target = step ? (selected + step + turns.length) % turns.length : event.key === "Home" ? 0 : event.key === "End" ? turns.length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    onSelect(target);
    tabs.current[target]?.focus();
  };
  return (
    <div role="tablist" aria-label={replay.tabsLabel} onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
      {turns.map((turn, i) => (
        <button
          key={turn.tab}
          ref={(el) => {
            tabs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${REPLAY_ID}-tab-${i}`}
          aria-selected={i === selected}
          aria-controls={`${REPLAY_ID}-panel`}
          tabIndex={i === selected ? 0 : -1}
          onClick={() => onSelect(i)}
          className={clsx(
            "rounded-full border px-4 py-1.5 text-sm transition-colors duration-150 ease-out",
            i === selected ? "border-accent bg-accent font-medium text-accent-fg" : "border-line-strong bg-surface hover:bg-tile",
          )}
        >
          {turn.tab}
        </button>
      ))}
    </div>
  );
}

/** Recorded tool input or output, line breaks kept; a line starting with "+" is what a turn added. */
function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="rounded-lg bg-panel p-3 font-mono text-[13px] leading-5 text-panel-fg">
      <code className="block whitespace-pre-wrap [overflow-wrap:anywhere]">
        {code.split("\n").map((line, i) => (
          <span key={i} data-added={line.startsWith("+") || undefined} className={clsx("block min-h-5", line.startsWith("+") && "-mx-1 rounded px-1 bg-panel-accent text-panel-accent-fg")}>
            {line}
          </span>
        ))}
      </code>
    </pre>
  );
}

/**
 * Advances every 2.5 seconds once at least half of the section is in view, the first time only. A click or key press
 * inside the section stops it for good, and it never starts under reduced motion.
 */
function useAutoplay(section: RefObject<HTMLElement | null>, tick: () => void) {
  const [state, setState] = useState<"waiting" | "playing" | "done">("waiting");
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (state !== "waiting") return;
    if (reducedMotion()) return setState("done");
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setState("playing"), { threshold: 0.5 });
    observer.observe(section.current!);
    return () => observer.disconnect();
  }, [state, section]);

  useEffect(() => {
    if (state !== "playing") return;
    const timer = setInterval(() => tickRef.current(), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [state]);

  const stop = useRef(() => setState("done")).current;
  return { stop, finish: stop };
}
