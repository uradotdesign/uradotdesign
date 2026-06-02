/**
 * Single source of truth for the page-builder (M2A) block types.
 *
 * Adding a block previously meant editing several places (the deep field list,
 * the block sorter, the renderer map, and the provisioning allow-lists). This
 * registry centralizes the data-shape concerns so the deep-fetch field list and
 * the sort key set are derived from one array.
 */
export interface BlockDefinition {
  /** Directus collection name, e.g. "block_hero". */
  collection: string;
  /** Whether the block has a native `translations` junction. */
  translations?: boolean;
  /**
   * Extra deep-fetch field paths appended under `blocks.item:<collection>`,
   * e.g. "images.image", "options.translations.*".
   */
  children?: string[];
  /** Nested O2M array props on the item that should be sorted by `sort`. */
  sortKeys?: string[];
  /** Two-level nested arrays to sort, e.g. tabs -> lotties. */
  nestedSort?: Array<{ parent: string; child: string }>;
}

export const BLOCK_REGISTRY: BlockDefinition[] = [
  { collection: "block_hero", translations: true },
  { collection: "block_richtext", translations: true },
  { collection: "block_image", translations: true },
  { collection: "block_two_column", translations: true },
  {
    collection: "block_gallery",
    translations: true,
    children: ["images.image", "images.sort", "images.translations.*"],
    sortKeys: ["images"],
  },
  { collection: "block_cta", translations: true },
  { collection: "block_stats", translations: true },
  { collection: "block_quote", translations: true },
  { collection: "block_faq", translations: true },
  {
    collection: "block_logos",
    translations: true,
    children: ["logos.image", "logos.sort"],
    sortKeys: ["logos"],
  },
  { collection: "block_embed", translations: true },
  { collection: "block_custom_code" },
  { collection: "block_before_after", translations: true },
  {
    collection: "block_lottie_grid",
    translations: true,
    children: ["items.*"],
    sortKeys: ["items"],
  },
  {
    collection: "block_character_system",
    translations: true,
    children: ["options.*", "options.translations.*"],
    sortKeys: ["options"],
  },
  {
    collection: "block_interactive_showcase",
    translations: true,
    children: ["tabs.*", "tabs.translations.*", "tabs.lotties.*"],
    sortKeys: ["tabs"],
    nestedSort: [{ parent: "tabs", child: "lotties" }],
  },
];

/** Every block collection name (e.g. for M2A allow-lists / renderer guards). */
export const BLOCK_COLLECTIONS = BLOCK_REGISTRY.map((b) => b.collection);

/**
 * Builds the deep M2A field selection for a hosting collection's `blocks`
 * relation: one `item:<collection>.*` per block (plus translations + declared
 * child paths). Field order is irrelevant to Directus.
 */
export function buildPageBlockFields(): string[] {
  const fields = ["blocks.id", "blocks.collection", "blocks.sort"];
  for (const block of BLOCK_REGISTRY) {
    const base = `blocks.item:${block.collection}`;
    fields.push(`${base}.*`);
    if (block.translations) fields.push(`${base}.translations.*`);
    for (const child of block.children ?? []) fields.push(`${base}.${child}`);
  }
  return fields;
}

/** Top-level nested O2M array props that any block may carry, for sorting. */
export const BLOCK_SORT_KEYS = Array.from(
  new Set(BLOCK_REGISTRY.flatMap((b) => b.sortKeys ?? []))
);

/** Two-level nested arrays to sort (e.g. each tab's `lotties`). */
export const BLOCK_NESTED_SORT = BLOCK_REGISTRY.flatMap((b) => b.nestedSort ?? []);
