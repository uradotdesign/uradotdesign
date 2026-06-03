<template>
  <div class="panel-external-embed" :class="{ 'has-header': showHeader }">
    <div v-if="showHeader" class="header">
      <span class="title">{{ title || 'External Embed' }}</span>
      <a v-if="url" class="open" :href="url" target="_blank" rel="noopener noreferrer">
        Open ↗
      </a>
    </div>

    <iframe
      v-if="url"
      class="frame"
      :src="url"
      :title="title || 'External embed'"
      :allow="allow || undefined"
      referrerpolicy="no-referrer"
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    />

    <div v-else class="empty">
      <p>No URL configured.</p>
      <p class="hint">Add an <strong>Embed URL</strong> in this panel's options.</p>
    </div>

    <a
      v-if="url && !showHeader"
      class="open floating"
      :href="url"
      target="_blank"
      rel="noopener noreferrer"
    >
      Open ↗
    </a>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    url: { type: String, default: '' },
    title: { type: String, default: '' },
    allow: { type: String, default: '' },
    showHeader: { type: Boolean, default: true },
  },
});
</script>

<style scoped>
.panel-external-embed {
  position: relative;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: var(--border-width) solid var(--border-subdued);
  font-size: 13px;
}

.title {
  font-weight: 600;
  color: var(--foreground-normal);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.frame {
  flex: 1 1 auto;
  width: 100%;
  border: 0;
  background: var(--background-subdued);
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--foreground-subdued);
  text-align: center;
}

.empty .hint {
  font-size: 12px;
}

.open {
  color: var(--primary);
  text-decoration: none;
  font-size: 12px;
  white-space: nowrap;
}

.open:hover {
  text-decoration: underline;
}

.open.floating {
  position: absolute;
  top: 6px;
  right: 8px;
  background: var(--background-page);
  padding: 2px 8px;
  border-radius: var(--border-radius);
  box-shadow: var(--card-shadow);
}
</style>
