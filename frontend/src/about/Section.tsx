import clsx from "clsx";
import type { ReactNode } from "react";

/** A section's Fraunces heading at 30 px (24 px below 640 px) and its optional muted line (docs/12-about-page.md, Structure). */
export function SectionHeading({ id, heading, line }: { id?: string; heading: string; line?: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 id={id} className="font-serif text-2xl leading-tight font-medium text-balance sm:text-[30px]">
        {heading}
      </h2>
      {line && <p className="max-w-[640px] text-fg-muted">{line}</p>}
    </div>
  );
}

/** A centered column at most 1040 px wide, 24 px in from the sides (16 px below 640 px). */
export function Column({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mx-auto w-full max-w-[1040px] px-4 sm:px-6", className)}>{children}</div>;
}
