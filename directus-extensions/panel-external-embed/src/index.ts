import { definePanel } from '@directus/extensions-sdk';
import PanelComponent from './panel.vue';

/**
 * "External Embed" Insights panel.
 *
 * Renders any external URL inside an iframe so a Directus dashboard can surface
 * live content from neighbouring self-hosted tools (Plausible analytics,
 * HedgeDoc notes, public ClickUp views, …) without leaving the admin app.
 *
 * Framing caveat: the embedded site must allow being iframed from the Directus
 * origin (no blocking `X-Frame-Options` / restrictive `frame-ancestors` CSP).
 * Plausible shared dashboards and HedgeDoc published notes allow this; Nextcloud
 * blocks it by default and needs a server-side `frame-ancestors` allowance. The
 * panel always shows an "Open ↗" link as a fallback for tools that refuse to be
 * embedded.
 */
export default definePanel({
  id: 'external-embed',
  name: 'External Embed',
  icon: 'web',
  description:
    'Embed an external dashboard or document (Plausible, HedgeDoc, public ClickUp view, …) via iframe.',
  component: PanelComponent,
  options: [
    {
      field: 'url',
      name: 'Embed URL',
      type: 'string',
      meta: {
        interface: 'input',
        width: 'full',
        options: {
          placeholder: 'https://plausible.example.com/share/ura.design?auth=…&embed=true',
          font: 'monospace',
        },
        note: 'Must be a URL the tool allows to be iframed (see panel docs for per-tool caveats).',
      },
    },
    {
      field: 'title',
      name: 'Accessible title',
      type: 'string',
      meta: {
        interface: 'input',
        width: 'full',
        options: { placeholder: 'e.g. Plausible — ura.design' },
      },
    },
    {
      field: 'allow',
      name: 'iframe "allow" attribute',
      type: 'string',
      meta: {
        interface: 'input',
        width: 'full',
        options: { placeholder: 'clipboard-write; fullscreen' },
      },
    },
  ],
  minWidth: 12,
  minHeight: 10,
});
