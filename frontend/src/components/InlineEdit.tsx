import { useState, type KeyboardEvent } from "react";

/**
 * Text that turns into a field when clicked (a list or board name). Enter or
 * leaving the field saves; Escape cancels; an empty name puts the old one
 * back without asking the API (D4 in the build plan).
 */
export function InlineEdit({
  value,
  label,
  className,
  inputClassName,
  editable,
  onSave,
}: {
  value: string;
  /** What the text is, for screen readers: "List name", "Board title". */
  label: string;
  className: string;
  inputClassName: string;
  editable: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (!editable) {
    return <span className={className}>{value}</span>;
  }
  if (draft === null) {
    return (
      <button
        type="button"
        className={className}
        // Named by its text, so a heading holding it reads as the name itself.
        title="Click to rename"
        onClick={() => setDraft(value)}
      >
        {value}
      </button>
    );
  }

  function finish(save: boolean) {
    const name = (draft ?? "").trim();
    setDraft(null);
    if (save && name && name !== value) onSave(name);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      // Stop here: Escape means "stop renaming", not "close what's beneath".
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      finish(false);
    }
  }

  return (
    <input
      className={inputClassName}
      aria-label={label}
      value={draft}
      maxLength={100}
      autoFocus
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
    />
  );
}
