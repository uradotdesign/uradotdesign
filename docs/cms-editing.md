# Editing shared website content

Open **Content → Site Configuration** in Directus. These controls retain the current website design. Save the parent settings page after editing a nested item. Changes apply to English and German pages without a website rebuild.

| Area | Where to edit | Controls |
| --- | --- | --- |
| Footer links | Footer Settings → Footer links | Add links, choose Company or Bottom / legal, translate labels, change destinations, drag to reorder, toggle Show link |
| Footer columns | Footer Settings → Display options → Footer columns | Reorder Company, Socials and Contact; open a row to toggle Show section; remove unused columns |
| Footer call to action | Footer Settings → Content → Translations; Call to action | Heading, button text, destination, new tab; visibility under Display options |
| Newsletter | Footer Settings → Content → Translations; Newsletter integration | Description, email label, consent copy, button and sending text, Brevo form action URL; visibility under Display options |
| Footer branding | Footer Settings → Media | Logo, light/dark background images and colors |
| Footer section titles / copyright | Footer Settings → Content → Translations | Company, Socials, Contact and copyright text |
| Social links | Social Links | Platform, destination, translated accessible label, order and publishing status |
| Header navigation | Navigation Links | Translated labels, destinations, ordering, new tabs and Enabled |
| Header button | Header Settings → Content and Translations | Button text and destination; visibility/new tab under Display options |
| Header options | Header Settings → Display options | Services menu, contact button, theme switcher, weather and existing appearance controls |
| Services dropdown label | Header Settings → Content → Translations | Label above the existing services list |
| Homepage order | Site Settings → Homepage sections | Reorder or hide Clients, Services, Selected work, Testimonials and Latest posts |
| Contact popup | Site Settings → Content → Translations | Eyebrow, heading, response time and submit button; team visibility under Display options |
| Contact details | Site Settings → Content | Email, phone, postal address and legal company name |

## Links and languages

- Enter `/about`, `/works` or `/blog` for internal pages. The website adds the visitor's language. An existing `/en/` or `/de/` prefix is replaced when appropriate.
- Enter `#contact-modal` to open the shared contact form. This ignores the new-tab setting.
- Use full `https://…` addresses for external destinations, `mailto:hello@ura.design` for email, and `tel:+49…` for telephone links. Full web URLs stay exactly in their chosen language.
- Use **Translations** to switch between `en` and `de`. Text is plain text unless its existing field explicitly offers rich text. A missing German value falls back to English.
- A link needs a label and a valid destination. Disabled, empty or invalid links do not render.

## Showing and hiding content

Turn off **Show link**, **Show section**, **Show call to action** or **Show newsletter** to hide content while keeping it available for later. An empty footer link list stays empty. Removing every homepage row hides everything below the hero; the hero remains first. Duplicate section types appear only once.

Homepage section content still comes from its existing collections: Clients, Services, Case Studies, Testimonials and Blog Posts. The existing featured/published selections and card limits continue to apply. Social links must be published to appear.

The newsletter form retains the current Brevo integration (`EMAIL`, `OPT_IN`, `locale` and the spam honeypot). Its action URL must use HTTPS. Change the confirmation/redirect settings in Brevo. Changing the URL to a different provider also requires adapting the integration's field names in code.

Directus clears the website content cache after edits, including nested footer links and translations. Reload an already open page to see a saved change; an intermediate CDN cache can take up to a minute to refresh. Changes to shared settings go live when saved and do not have a separate draft publishing step.

## Deployment and recovery

The additive migration is `scripts/setup-global-controls.mjs`:

```sh
node --env-file=.env scripts/setup-global-controls.mjs
```

It requires the existing native translations schema and the Website, Preview and Editor policies. It adds the footer link collections, relations, editor metadata, server-only read permissions and cache triggers. It initializes the existing content once; reruns preserve edits, disabled items and deleted lists. `--schema-only` installs controls without seeding content. Production must receive the migration **before** deploying the frontend, which requests the new footer relationship.

Back up the database before running it and rehearse on a separate database. The previous frontend can still run with the additive schema. Code rollback should retain that schema and editor content; restoring a database backup would discard subsequent CMS edits. No anonymous permissions are added.
