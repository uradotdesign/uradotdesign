# CMS Edit-Form Unification — Design

Status: approved (design)
Date: 2026-06-02
Owner: ura.design

## Goal

Make every Directus collection's **edit form** look and behave the same way, so
editing a case study, a settings singleton, or a page-builder block all feel like
one product. Today the forms are inconsistent page-to-page: some singletons have
collapsible accordion groups, every regular collection is a flat field dump, and
the native-translations migration left duplicated `_en`/`_de` fields sitting next
to the new Translations tab.

This is a **form-layout (app-layer) change only**. No schema columns, no API
shape, no Astro frontend behavior changes.

## Context

- Prior art, applied only partway:
  - `scripts/group-singleton-fields.mjs` turned flat dividers into collapsible
    `group-detail` accordions — but only for 7 singletons.
  - `scripts/uniform-cms-views.mjs` standardized **list views** (tabular columns,
    sort, archive) — its columns still reference legacy `_en` fields.
  - `scripts/inspect-cms-structure.mjs` is a read-only inventory of nav/meta.
- After the native-translations migration (32 collections), localized copy now
  lives inside the `translations` interface. The legacy `_en`/`_de` fields are
  **still present** on the parent (kept for dual-read until the deferred Phase-3
  cleanup), so editors currently see duplicated fields.
- Directus form-layout primitives: `group-detail` (collapsible accordion),
  `group-raw` (inline box), `presentation-divider` (labeled line), and per-field
  `meta.width` (`half`/`full`/`fill`), `meta.sort`, `meta.group`, `meta.hidden`.
  Group/divider fields are `alias` + `no-data`: never stored, never read by the
  API or the frontend.

## Approach

**Selected: one idempotent classifier script** (`scripts/unify-cms-forms.mjs`)
that generalizes `group-singleton-fields.mjs`. For each target collection it:

1. Reads the field list (sorted by current `meta.sort`).
2. Classifies each data field into a canonical **section** by name/type/interface.
3. Ensures one `group-detail` accordion per needed section with a standard label,
   icon, and neutral color.
4. Sets `meta.group`, `meta.sort` (section order + intra-section order), and
   `meta.width` on each field.
5. Hides leftover legacy `_en`/`_de` fields that have a migrated translation.
6. Clears the Directus cache.

A small per-collection **override map** handles fields the classifier can't place
by name alone.

Alternatives rejected:

- **Fully hand-written per-collection mapping** — explicit but verbose (~25
  collections) and brittle as the schema evolves.
- **Manual layout in the Directus UI** — not reproducible, not idempotent, not
  reviewable in git.

## Canonical sections

Accordion (`group-detail`), neutral color (no per-section colors), consistent
Material icons, content-first order:

| # | Section | Icon | Default | Holds |
|---|---------|------|---------|-------|
| 1 | Publishing | `flag` | open, pinned top | `status`, `slug`, `sort`/`sort_order`, date fields, `enabled`, `featured` (slim, half-width) |
| 2 | Content | `subject` | open | primary copy (see Translations note) |
| 3 | Media | `perm_media` | closed | images, video, logo, files, `alt`, focal points |
| 4 | Links & Actions | `link` | closed | `url`, `link`, `cta_button_text`/`link`, `target` |
| 5 | Display options | `tune` | closed | `show_*`/`is_*`/`has_*` toggles, `layout`/`variant`/`columns`/`theme` |
| 6 | SEO & Social | `travel_explore` | closed | `seo_image` + any non-localized meta |

`id` stays ungrouped at the very top (Directus convention).

### Translations as the primary Content section

Because localized copy now lives in the `translations` interface, that field **is**
the Content section for migrated collections:

- The `translations` alias field is placed in slot **#2 (Content)**, open by
  default, full width.
- Non-localized collections (`clients`, `certifications`, `social_links`, and any
  collection without a `translations` field) get a plain Content section built
  from their own text fields instead.

### Hiding legacy `_en`/`_de`

For every migrated collection, set `meta.hidden = true` on each `<base>_en` /
`<base>_de` field **only when** the collection's `translations` junction actually
has a `<base>` column. This:

- Removes the current duplicated-field clutter.
- Makes the Translations interface the single place to edit copy.
- Previews the post-Phase-3 form without dropping any data — dual-read still
  works, the columns still exist, and the change is reversible.

Non-migrated localized fields (e.g. `block_stats`/`block_faq` JSON repeaters,
`expertise` groups) keep their `_en`/`_de` fields visible.

## Field classification rules

Applied in order; first match wins. Case-insensitive on field name.

1. `id` → ungrouped (skip).
2. `status`, `slug`, `sort`, `sort_order`, `*_date`, `date_*`, `published_*`,
   `enabled`, `featured`, `draft` → **Publishing**.
3. `translations` (alias, special `translations`) → **Content** (primary).
4. type `file`/`files` or M2O→`directus_files`, or name matching
   `image|photo|logo|avatar|icon|video|background|file|gallery|media`, plus
   `alt`, `focal_point_*` → **Media**.
5. name matching `url|link|href|cta_|button_|target` → **Links & Actions**.
6. type `boolean`, or name matching `^(show|is|has|enable|allow)_`, or
   `layout|variant|columns|theme|alignment|style` → **Display options**.
7. name matching `^seo_|^meta_|^og_|^twitter_` → **SEO & Social**.
8. everything else (text/string/wysiwyg/markdown/json not caught above) →
   **Content**.

Unmatched fields default to Content; the implementation plan must dump every
target collection's fields and confirm the classifier's output before applying.

## Width standard

- **half** — `status`, `slug`, `sort*`, date fields, booleans/toggles, short
  scalar strings (`*_text`, `target`, `author_*`, `year`, focal points), and URLs.
- **full** — rich-text/WYSIWYG/markdown, multiline textareas, single media,
  O2M/M2M repeaters, and the `translations` interface.

## Scope

**In scope** — editor-facing collections: the 7 settings singletons, `pages`,
`posts`, `case_studies`, `case_study_categories`, `services`, `approaches`,
`team_members`, `company_values`, `testimonials`, `clients`, `certifications`,
`navigation_links`, `social_links`.

**Skip accordions (tidy only)** — forms with ≤4 data fields, and drawer-edited
children: `service_steps`, `service_activities`, `service_subservices`,
`service_checklist_items`, the 12 `block_*` types, and the nested repeaters
`block_gallery_images` and `block_logos_items`. These get standardized widths and
keep `translations` as its own group, but no multi-section accordion (avoids
click-fatigue on tiny forms). Threshold is configurable per collection via the
override map. `contact_submissions` is a read-mostly inbox, so it is tidy-only as
well.

**Untouched** — `*_translations` junctions and `directus_*` system collections.

## Safety & reversibility

- **App-layer meta only.** Group/divider fields are `alias`/`no-data`. The public
  REST/GraphQL API and the Astro frontend never read them — confirmed by the
  existing `group-singleton-fields.mjs` header and the dual-read architecture.
- **Idempotent.** Re-running converges to the same layout. Existing group fields
  are updated in place, not duplicated.
- **Reversible.** An `--ungroup <collection>` (or `--ungroup-all`) flag clears
  `meta.group` from data fields and un-hides `_en`/`_de`, restoring the flat form.
- **Cache cleared** (`/utils/cache/clear`) after a run.
- **Backup.** Export the `directus_fields` rows for target collections (or a full
  prod DB snapshot) before the first apply, so layout can be restored wholesale.

## Verification

1. `node --env-file=.env scripts/unify-cms-forms.mjs --dry-run` prints the
   per-collection section plan; review classifier output for surprises.
2. Apply; clear cache.
3. In the Directus app, spot-check one of each shape: a singleton
   (`site_settings`), a big collection (`case_studies` and `pages`), a tiny one
   (`case_study_categories`), and a drawer block (`block_hero`). Confirm sections,
   order, open/closed defaults, hidden `_en`/`_de`, and the Translations tab.
4. Confirm an **anonymous REST read** of a published item
   (`case_studies`, `pages`) is byte-identical before/after (proves zero API/
   frontend impact).
5. Confirm the frontend `en`/`de` pages still render unchanged.

## Out of scope

- Dropping legacy `_en`/`_de` columns (deferred Phase-3 cleanup).
- Rewriting list-view presets / `uniform-cms-views.mjs` (handled with cleanup,
  when the `_en` columns go away).
- Nav-folder / collection-ordering changes (`organize-cms-nav.mjs` already owns
  that).
- Any change to the Astro frontend or the public API.
