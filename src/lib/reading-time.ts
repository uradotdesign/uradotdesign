/**
 * Reading-time estimation shared by the blog listing and post detail pages.
 */

const WORDS_PER_MINUTE = 200;

/**
 * Estimates reading time in whole minutes for a block of text or HTML.
 *
 * HTML tags are stripped before counting so markup never inflates the word
 * count. Returns 0 for empty input and a floor of 1 minute for any real text.
 *
 * @param text Plain text or HTML content.
 * @returns Estimated reading time in minutes.
 */
export function calculateReadingTime(text: string | null | undefined): number {
  if (!text) return 0;
  const plain = text.replace(/<[^>]*>/g, " ");
  const words = plain.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
