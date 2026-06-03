import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

/**
 * Slug input that keeps the value URL-safe (lowercase, hyphenated) and can
 * regenerate the slug from a sibling source field (e.g. `title`) with one click.
 */
export default defineInterface({
  id: 'ura-slug',
  name: 'Slug',
  icon: 'link',
  description: 'URL-safe slug input with one-click generation from a source field.',
  component: InterfaceComponent,
  types: ['string'],
  group: 'standard',
  recommendedDisplays: ['raw'],
  options: [
    {
      field: 'sourceField',
      name: 'Source field',
      type: 'string',
      meta: {
        interface: 'input',
        width: 'half',
        options: { placeholder: 'title' },
      },
      schema: { default_value: 'title' },
    },
    {
      field: 'placeholder',
      name: 'Placeholder',
      type: 'string',
      meta: { interface: 'input', width: 'half' },
    },
  ],
});
