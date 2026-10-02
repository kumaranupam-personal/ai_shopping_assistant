import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type Theme } from "../theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System theme", Icon: Monitor },
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "dark", label: "Dark theme", Icon: Moon },
];

export default function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div role="group" aria-label="Theme" className="flex rounded-full border border-line bg-surface-muted p-1">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={theme === value}
          title={label}
          onClick={() => setTheme(value)}
          className={clsx(
            "grid size-7 place-items-center rounded-full transition-colors duration-150 ease-out",
            theme === value ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          <Icon aria-hidden className="size-4" />
        </button>
      ))}
    </div>
  );
}
