# Editing the Ura website in Directus

## Access and daily workflow

| Role | Intended work |
| --- | --- |
| Editor | Website copy, English/German translations, media, links, visibility and ordering |
| Trusted Designer | Editor controls plus custom HTML, CSS, JavaScript, embeds and integration destinations |
| Inquiries Manager | Private contact submissions; read sender details and update their follow-up status |
| Administrator | Accounts, permissions, data model, flows, installation and integrations |

Administrators assign these roles deliberately. Provisioning does not move existing users between roles. Editors cannot read inquiries or create share links. Hiding a field is not the access boundary: the API also rejects restricted writes, including through saved content versions.

Each role can update its own profile, password and Studio preferences, without changing its role or anyone else's profile. Sign out and back in after an administrator changes your access.

Open **Insights → Content Overview** for published content counts, **Publishing Pipeline** for hidden records, **SEO Health** for optional metadata suggestions, **Media Library** for uploads and **Translations / i18n** for language coverage. The **Leads** dashboard is for inquiries managers and administrators. Personal views and bookmarks are preserved; repository-managed shared views use the same columns and naming.

## Drafts, website visibility and schedules

Pages, Blog Posts and Case Studies use Directus 12 content versions. The **Published** selector and **Publish** action in the top bar describe the saved Studio version. The form’s **Website visibility** field controls whether that record appears on the public website.

1. Create an item, enter its shared slug and write the copy under **Translations**. Directus autosaves this as a Studio draft.
2. Set **Website visibility → Draft** while preparing content. Use **Publish** in the top bar to commit a hidden record. This does not make it public while Website visibility is Draft.
3. Use the preview control to review the selected version. To release it immediately, set Website visibility to Published and use the top-bar Publish action.
4. To schedule a hidden record, set Website visibility to Draft and choose **Publish At**, then use the top-bar Publish action to commit it. The scheduler checks every minute. An autosaved Studio version alone is not a scheduled record.

After scheduled publication the date clears. Manually hiding that record will therefore keep it hidden. Set a new date explicitly if it should publish again. Scheduling a future revision of an already public item is not implemented by this field; use a hidden record or publish the revision manually.

Singleton settings and collections without versioning save directly. Shared settings changes affect both language versions when saved; they have no independent draft stage.

## Translations, page builders and media

**Translations** defaults to **English**; select **Deutsch** to edit German. Creating English copy does not create German automatically. The website falls back to English for ordinary missing content; German SEO overrides instead fall back to the page’s visible German copy. Legacy duplicate fields are hidden, and existing English fallbacks have been copied into empty native translation fields without overwriting authored translations.

Edit related items inside their parent drawer. Save the drawer, then save or publish the parent. Page blocks render in list order. Drag the handle to reorder; the builder shows up to 100 rows together so an ordinary page can be sorted. **Add Existing** reuses the same content: later edits affect every page using that block. Use **Create New** for independent content. Custom code and embed blocks require Trusted Designer access.

**Create New** shows only block types your role may create. Trusted Designers also see the code and embed types. Existing trusted blocks remain visible for context; ordinary Editors cannot modify their executable content. The API enforces this restriction, including through saved versions. Reload an already open Studio tab after the picker update.

Upload or choose assets through the file picker. Give files descriptive titles and fill the content field’s image description/alt text where available. Light and dark media are separate choices. Check both themes when replacing an image or video. Reduced-motion visitors get still hero media by default and can choose to play it.

Directus 12 uses a new rich-text editor. Some older HTML opens read-only because converting it would change its markup. Click that field to review the comparison: **Keep Readonly** leaves it untouched, **Edit Raw HTML** preserves its structure, and **Edit Anyway** converts it when saved. Review the preview before accepting conversion. The migration does not bulk-normalize existing HTML. [Directus 12 breaking changes](https://directus.com/docs/releases/breaking-changes/version-12).

## Search and social previews

English and German SEO title/description overrides live inside Translations. The 60/160 character counters are guidance, not required fields. Empty overrides use the page’s title/copy, and the Ura Design suffix is added once. Image counters on SEO Health identify missing custom images; they are suggestions because the website supplies a branded fallback. A custom social image should be 1200 × 630 pixels. Existing blog and case-study image generators remain available.

Turning off a service’s **Show in homepage and service menu** hides its promotion while retaining its published URL and sitemap entry. Set its publication status to Draft to hide the route itself.

## Shared website content

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
- Use **Translations** to switch between English and Deutsch. Text is plain text unless its field offers rich text. A missing German value falls back to English.
- A link needs a label and a valid destination. Disabled, empty or invalid links do not render.

## Showing and hiding content

Turn off **Show link**, **Show section**, **Show call to action** or **Show newsletter** to hide content while keeping it available for later. An empty footer link list stays empty. Removing every homepage row hides everything below the hero; the hero remains first. Duplicate section types appear only once.

Homepage section content still comes from its existing collections: Clients, Services, Case Studies, Testimonials and Blog Posts. The existing featured/published selections and card limits continue to apply. Social links must be published to appear.

The newsletter form retains the current Brevo integration (`EMAIL`, `OPT_IN`, `locale` and the spam honeypot). A Trusted Designer or administrator manages its HTTPS action URL. Change the confirmation/redirect settings in Brevo. Changing providers also requires adapting the integration's field names in code.

Directus clears the website content cache after edits, including nested footer links and translations. Reload an already open page to see a saved change; an intermediate CDN cache can take up to a minute to refresh. Changes to shared settings go live when saved and do not have a separate draft publishing step.

## Inquiries

Contact preferences retain every selected method: email, phone and Signal. Both notification email templates show the full list. Older single-preference submissions remain readable. Inquiries managers can choose **New**, **In progress**, **Closed** or **Spam**, but cannot edit sender details or delete submissions. Arrival time is recorded automatically; missing historical dates are recovered only when the original creation activity supplies one. Opening a submission or changing its status does not send an email; creating one can trigger the configured notification flow. Do not submit production test inquiries as an editing exercise.

## Styling and deployment

Ordinary content changes do not require a rebuild. A new Tailwind class added in CMS-authored markup does: the deployment scans current CMS content and supplies a class-only manifest to the build. Use complete class names, including variants, rather than constructing them from fragments. Credentials stay in the server environment. A production build fails if the manifest is missing or does not match its declared hash.

See [CMS provisioning and recovery](cms-provisioning.md) for reproducible setup, schema/configuration exports, backups and deployment. The original global-controls migration below remains useful for an older installation; it is not the current empty-database bootstrap.

### Earlier global-controls migration

The additive migration is `scripts/setup-global-controls.mjs`:

```sh
node --env-file=.env scripts/setup-global-controls.mjs
```

It requires the existing native translations schema and the Website, Preview and Editor policies. It adds the footer link collections, relations, editor metadata, server-only read permissions and cache triggers. It initializes the existing content once; reruns preserve edits, disabled items and deleted lists. `--schema-only` installs controls without seeding content. Production must receive the migration **before** deploying the frontend, which requests the new footer relationship.

Back up the database before running it and rehearse on a separate database. The previous frontend can still run with the additive schema. Code rollback should retain that schema and editor content; restoring a database backup would discard subsequent CMS edits. No anonymous permissions are added.
