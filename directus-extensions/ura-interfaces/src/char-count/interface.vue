<template>
  <div class="ura-char-count">
    <v-textarea
      v-if="multiline"
      :model-value="value"
      :placeholder="placeholder"
      :disabled="disabled"
      :nullable="true"
      @update:model-value="onInput"
    />
    <v-input
      v-else
      :model-value="value"
      :placeholder="placeholder"
      :disabled="disabled"
      :nullable="true"
      @update:model-value="onInput"
    />

    <div class="meter" :class="state">
      <span class="count">{{ length }}</span>
      <span v-if="recommended" class="rec">/ {{ recommended }}</span>
      <span v-if="recommended" class="label">{{ stateLabel }}</span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';

export default defineComponent({
  props: {
    value: { type: String, default: null },
    multiline: { type: Boolean, default: false },
    recommended: { type: Number, default: null },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },
  emits: ['input'],
  setup(props, { emit }) {
    const length = computed(() => (props.value ?? '').length);

    const state = computed(() => {
      if (!props.recommended) return 'neutral';
      if (length.value > props.recommended) return 'over';
      if (length.value >= props.recommended * 0.9) return 'near';
      return 'ok';
    });

    const stateLabel = computed(() => {
      switch (state.value) {
        case 'over':
          return 'Too long';
        case 'near':
          return 'Near limit';
        case 'ok':
          return 'Good';
        default:
          return '';
      }
    });

    function onInput(next: string) {
      emit('input', next === '' ? null : next);
    }

    return { length, state, stateLabel, onInput };
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
