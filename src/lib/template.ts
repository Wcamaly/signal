/**
 * Minimal mustache-style renderer used for publication templates and prompts.
 *
 * `{{variable}}` is replaced by its value. A line that consists only of
 * placeholders that all resolve to empty is dropped, so an optional
 * `{{hashtags}}` line does not leave a hole in the output.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const lines = template.split("\n").map((line) => {
    const placeholders = [...line.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]);
    const rendered = line.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
    if (placeholders.length && !rendered.trim()) return null;
    return rendered;
  });

  return lines
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Placeholders found in a template, for validation and UI hints. */
export function templateVariables(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
}
