/** Shared control classes for forms: inputs, selects, textareas. */
export const fieldClass =
  "w-full rounded-lg border border-hairline bg-paper px-4 py-3 text-ink placeholder:text-muted-ink/60 focus:border-spectral focus:outline-none focus:ring-2 focus:ring-spectral/20 transition-colors";

/** Select variant: hides the native arrow so the page can overlay a chevron. */
export const selectFieldClass = `appearance-none ${fieldClass}`;
