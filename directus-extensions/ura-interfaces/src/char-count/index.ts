import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

/**
 * Text input / textarea with a live character counter and a recommended-length
 * guide. The counter turns amber as it nears the recommended max and red once
 * it is exceeded — useful for SEO titles (~60) and meta descriptions (~160).
 */
export default defineInterface({
  id: 'ura-char-count',
  name: 'Input with Counter',
  icon: 'pin',
  description:
    'Text field with a live character counter and a recommended-length guide.',
  component: InterfaceComponent,
  types: ['string', 'text'],
  group: 'standard',
  recommendedDisplays: ['raw', 'formatted-value'],
  options: [
    {
      field: 'multiline',
      name: 'Multiline',
      type: 'boolean',
      meta: { interface: 'boolean', width: 'half' },
      schema: { default_value: false },
    },
    {
      field: 'recommended',
      name: 'Recommended length',
      type: 'integer',
      meta: {
        interface: 'input',
        width: 'half',
        options: { placeholder: 'e.g. 60 for an SEO title' },
      },
    },
    {
      field: 'placeholder',
      name: 'Placeholder',
      type: 'string',
      meta: { interface: 'input', width: 'full' },
    },
  ],
});
