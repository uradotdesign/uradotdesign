/**
 * Converts arbitrary text into a URL-safe slug: lowercase, accents stripped,
 * non-alphanumeric runs collapsed to single hyphens, no leading/trailing dash.
 */
export function slugify(input: string): string {
  return (input ?? '')
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
