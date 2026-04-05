<template>
  <div
    class="page-state-banner"
    :class="`page-state-banner--${type}`"
    role="status"
  >
    <span
      class="page-state-banner__dot"
      aria-hidden="true"
    />
    <span class="page-state-banner__message">{{ message }}</span>
  </div>
</template>

<script setup>
defineProps({
  /**
   * Visual type of the banner.
   * One of: 'info' | 'success' | 'warning' | 'error'
   */
  type: {
    type: String,
    default: 'info',
    validator: (v) => ['info', 'success', 'warning', 'error'].includes(v)
  },
  message: {
    type: String,
    required: true
  }
})
</script>

<style scoped>
.page-state-banner {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.8rem;
  font-weight: 600;
  padding: var(--space-1) var(--space-3);
  border-radius: 99px;
  border: 1px solid transparent;
}

.page-state-banner--info {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 30%, transparent);
  color: var(--color-accent);
}

.page-state-banner--success {
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-success) 30%, transparent);
  color: var(--color-success);
}

.page-state-banner--warning {
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-warning) 30%, transparent);
  color: var(--color-warning);
}

.page-state-banner--error {
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-danger) 30%, transparent);
  color: var(--color-danger);
}

.page-state-banner__dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
</style>
