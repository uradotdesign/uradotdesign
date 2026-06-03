<template>
  <div class="ura-slug">
    <v-input
      :model-value="draft"
      :placeholder="placeholder || 'my-slug'"
      :disabled="disabled"
      :nullable="true"
      class="field"
      @update:model-value="draft = $event"
      @blur="commit"
    >
      <template #append>
        <v-icon
          v-tooltip="sourceValue ? `Generate from ${sourceField}` : `Set a ${sourceField} first`"
          name="auto_fix_high"
          :disabled="disabled || !sourceValue"
          clickable
          @click="generate"
        />
      </template>
    </v-input>

    <div v-if="draft && draft !== slugified" class="hint warn">
      Will be saved as <code>{{ slugified }}</code>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, inject, watch, type Ref } from 'vue';
import { slugify } from '../shared/slugify';

export default defineComponent({
  props: {
    value: { type: String, default: null },
    sourceField: { type: String, default: 'title' },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },
  emits: ['input'],
  setup(props, { emit }) {
    const draft = ref(props.value ?? '');
    watch(
      () => props.value,
      (v) => {
        draft.value = v ?? '';
      }
    );

    // The current edited item, provided by Directus's form. Guarded so the
    // interface still works if the injection is unavailable.
    const values = inject<Ref<Record<string, any>>>('values', ref({}));
    const sourceValue = computed(() => {
      const raw = values?.value?.[props.sourceField];
      return typeof raw === 'string' ? raw : '';
    });

    const slugified = computed(() => slugify(draft.value));

    function commit() {
      const next = slugify(draft.value);
      draft.value = next;
      emit('input', next === '' ? null : next);
    }

    function generate() {
      const next = slugify(sourceValue.value);
      if (!next) return;
      draft.value = next;
      emit('input', next);
    }

    return { draft, sourceValue, slugified, commit, generate };
  },
});
</script>

<style scoped>
.ura-slug {
  width: 100%;
}

.hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--theme--foreground-subdued, var(--foreground-subdued));
}

.hint.warn {
  color: var(--theme--warning, #f59e0b);
}

.hint code {
  font-family: var(--theme--fonts--monospace--font-family, monospace);
}
</style>
