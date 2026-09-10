<template>
  <div class="ura-char-count">
    <v-textarea
      v-if="multiline"
      :model-value="value"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-label="inputLabel"
      :aria-describedby="meterId"
      :nullable="true"
      @update:model-value="onInput"
    />
    <v-input
      v-else
      :model-value="value"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-label="inputLabel"
      :aria-describedby="meterId"
      :nullable="true"
      @update:model-value="onInput"
    />

    <div :id="meterId" class="meter" :class="state" aria-live="polite">
      <span class="count">{{ length }}</span>
      <span v-if="recommended" class="rec">/ {{ recommended }}</span>
      <span v-if="recommended" class="label">{{ stateLabel }}</span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, useId } from 'vue';

export default defineComponent({
  props: {
    value: { type: String, default: null },
    multiline: { type: Boolean, default: false },
    recommended: { type: Number, default: null },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    field: { type: String, default: 'Text' },
  },
  emits: ['input'],
  setup(props, { emit }) {
    const meterId = useId();
    const inputLabel = computed(() => props.field.replaceAll('_', ' ').replace(/^seo\b/i, 'SEO'));
    const length = computed(() => (props.value ?? '').length);

    const state = computed(() => {
      if (!props.recommended || length.value === 0) return 'neutral';
      if (length.value > props.recommended) return 'over';
      if (length.value >= props.recommended * 0.9) return 'near';
      return 'ok';
    });

    const stateLabel = computed(() => {
      switch (state.value) {
        case 'over':
          return 'Above guideline';
        case 'near':
          return 'Near guideline';
        case 'ok':
          return 'Good';
        default:
          return length.value === 0 ? 'Optional' : '';
      }
    });

    function onInput(next: string) {
      emit('input', next === '' ? null : next);
    }

    return { length, state, stateLabel, onInput, meterId, inputLabel };
  },
});
</script>

<style scoped>
.ura-char-count {
  width: 100%;
}

.meter {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--theme--foreground-subdued, var(--foreground-subdued));
}

.meter .count {
  font-weight: 600;
}

.meter .label {
  margin-left: auto;
  font-weight: 600;
}

.meter.ok,
.meter.ok .label {
  color: var(--theme--success, #2ecda7);
}

.meter.near,
.meter.near .label {
  color: var(--theme--warning, #f59e0b);
}

.meter.over,
.meter.over .label {
  color: var(--theme--danger, #e35169);
}
</style>
