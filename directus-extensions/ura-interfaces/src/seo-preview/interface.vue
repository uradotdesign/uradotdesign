<template>
  <div class="ura-seo-preview">
    <div class="serp">
      <div class="url">{{ displayUrl }}</div>
      <div class="title">{{ title || 'Untitled — add an SEO title' }}</div>
      <div class="desc">{{ description || 'Add a meta description to control the snippet shown in search results.' }}</div>
    </div>

    <div class="metrics">
      <span class="metric" :class="titleState">
        Title {{ titleLen }}/{{ TITLE_MAX }}
      </span>
      <span class="metric" :class="descState">
        Description {{ descLen }}/{{ DESC_MAX }}
      </span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, inject, ref, type Ref } from 'vue';

const TITLE_MAX = 60;
const DESC_MAX = 160;

export default defineComponent({
  props: {
    titleField: { type: String, default: 'seo_title' },
    descriptionField: { type: String, default: 'seo_description' },
    fallbackTitleField: { type: String, default: 'title' },
    slugField: { type: String, default: 'slug' },
    baseUrl: { type: String, default: 'https://ura.design' },
    pathPrefix: { type: String, default: '/' },
  },
  setup(props) {
    const values = inject<Ref<Record<string, any>>>('values', ref({}));
    const field = (name: string) => {
      const raw = values?.value?.[name];
      return typeof raw === 'string' ? raw : '';
    };

    const title = computed(() => field(props.titleField) || field(props.fallbackTitleField));
    const description = computed(() => field(props.descriptionField));

    const displayUrl = computed(() => {
      const base = (props.baseUrl || '').replace(/\/+$/, '');
      const prefix = props.pathPrefix || '/';
      const slug = field(props.slugField);
      const path = `${prefix}${slug}`.replace(/\/{2,}/g, '/');
      return `${base}${path.startsWith('/') ? '' : '/'}${path}`.replace(/\/+$/, '') || base;
    });

    const titleLen = computed(() => title.value.length);
    const descLen = computed(() => description.value.length);

    const rate = (len: number, max: number) => {
      if (len === 0) return 'empty';
      if (len > max) return 'over';
      if (len >= max * 0.9) return 'near';
      return 'ok';
    };
    const titleState = computed(() => rate(titleLen.value, TITLE_MAX));
    const descState = computed(() => rate(descLen.value, DESC_MAX));

    return {
      title,
      description,
      displayUrl,
      titleLen,
      descLen,
      titleState,
      descState,
      TITLE_MAX,
      DESC_MAX,
    };
  },
});
</script>

<style scoped>
.ura-seo-preview {
  width: 100%;
  max-width: 640px;
}

.serp {
  padding: 12px 16px;
  border: var(--theme--border-width, 2px) solid var(--theme--border-color-subdued, var(--border-subdued));
  border-radius: var(--theme--border-radius, 6px);
  background: var(--theme--background, var(--background-page));
}

.serp .url {
  font-size: 13px;
  color: #3c7e44;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.serp .title {
  margin-top: 2px;
  font-size: 19px;
  line-height: 1.3;
  color: #1a0dab;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.serp .desc {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--theme--foreground-subdued, var(--foreground-subdued));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.metrics {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.metric.empty {
  color: var(--theme--foreground-subdued, var(--foreground-subdued));
}

.metric.ok {
  color: var(--theme--success, #2ecda7);
}

.metric.near {
  color: var(--theme--warning, #f59e0b);
}

.metric.over {
  color: var(--theme--danger, #e35169);
}
</style>
