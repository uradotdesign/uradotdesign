import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

/**
 * Presentation-only interface that renders a live Google search-result snippet
 * from sibling fields (SEO title, description, slug) with length guidance.
 *
 * Attach it to an alias (presentation) field on a collection, then point the
 * options at the relevant fields.
 */
export default defineInterface({
  id: 'ura-seo-preview',
  name: 'SEO Preview',
  icon: 'travel_explore',
  description: 'Live Google snippet preview built from sibling SEO fields.',
  component: InterfaceComponent,
  types: ['alias'],
  localTypes: ['presentation'],
  group: 'presentation',
  options: [
    {
      field: 'titleField',
      name: 'Title field',
      type: 'string',
      meta: { interface: 'input', width: 'half', options: { placeholder: 'seo_title' } },
      schema: { default_value: 'seo_title' },
    },
    {
      field: 'descriptionField',
      name: 'Description field',
      type: 'string',
      meta: { interface: 'input', width: 'half', options: { placeholder: 'seo_description' } },
      schema: { default_value: 'seo_description' },
    },
    {
      field: 'fallbackTitleField',
      name: 'Fallback title field',
      type: 'string',
      meta: { interface: 'input', width: 'half', options: { placeholder: 'title' } },
      schema: { default_value: 'title' },
    },
    {
      field: 'slugField',
      name: 'Slug field',
      type: 'string',
      meta: { interface: 'input', width: 'half', options: { placeholder: 'slug' } },
      schema: { default_value: 'slug' },
    },
    {
      field: 'baseUrl',
      name: 'Base URL',
      type: 'string',
      meta: { interface: 'input', width: 'half', options: { placeholder: 'https://ura.design' } },
      schema: { default_value: 'https://ura.design' },
    },
    {
      field: 'pathPrefix',
      name: 'Path prefix',
      type: 'string',
      meta: { interface: 'input', width: 'half', options: { placeholder: '/blog/' } },
      schema: { default_value: '/' },
    },
  ],
});
