import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

export const REPLAY_ID = "replay";

/** An explicit scroll behavior overrides the CSS reduced-motion rule, so scripts ask before scrolling smoothly or autoplaying. */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Brings the replay to the top of the view, smoothly unless the visitor prefers reduced motion (docs/12, Links). */
export function scrollToReplay(event: MouseEvent) {
  event.preventDefault();
  document.getElementById(REPLAY_ID)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
}

/** A link that opens in a new tab, with the arrow that says so. */
export function NewTabLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className={clsx("inline-flex items-center gap-1", className)}>
      {children}
      <ArrowUpRight aria-hidden className="size-4 shrink-0" />
    </a>
  );
}
