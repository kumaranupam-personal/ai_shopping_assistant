import { LoaderCircle } from "lucide-react";

/** The latest status while a turn runs (docs/06-frontend.md, Loading, empty and error states); hidden otherwise. */
export default function StatusLine({ running, status }: { running: boolean; status: string }) {
  if (!running) return null;
  return (
    <div className="flex items-center gap-2 px-4 pb-2 text-sm text-panel-muted">
      <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
      <span className="truncate">{status || "Thinking"}</span>
    </div>
  );
}
