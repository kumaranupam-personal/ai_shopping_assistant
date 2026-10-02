type Props = { suggestions: string[]; onPick: (text: string) => void; disabled: boolean };

/** Refinements from the agent; picking one sends it as the next message. */
export default function SuggestionChips({ suggestions, onPick, disabled }: Props) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          disabled={disabled}
          onClick={() => onPick(suggestion)}
          className="rounded-full border border-line bg-surface px-3 py-1 text-sm transition-colors duration-150 ease-out hover:border-accent hover:text-accent disabled:opacity-50 disabled:hover:border-line disabled:hover:text-fg"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
