<template>
  <aside class="alert-timeline">
    <div class="alert-timeline__header">
      <h3 class="alert-timeline__title">
        Live Alerts
      </h3>
      <span
        v-if="!loading && alerts.length"
        class="alert-timeline__count"
      >
        {{ alerts.length }}
      </span>
    </div>

    <div
      v-if="loading"
      class="alert-timeline__state"
    >
      <span>Loading alerts…</span>
    </div>

    <div
      v-else-if="error"
      class="alert-timeline__state alert-timeline__state--error"
    >
      <span>Failed to load alerts</span>
    </div>

    <div
      v-else-if="!alerts.length"
      class="alert-timeline__state"
    >
      <span>No alerts yet for this day</span>
    </div>

    <ol
      v-else
      class="alert-timeline__list"
    >
      <li
        v-for="alert in alerts"
        :key="alert.id"
      >
        <AlertTimelineItem :alert="alert" />
      </li>
    </ol>

    <button
      v-if="hasMore && !loading"
      class="alert-timeline__load-more"
      @click="$emit('load-more')"
    >
      Load more
    </button>
  </aside>
</template>

<script setup>
import AlertTimelineItem from './AlertTimelineItem.vue'

defineProps({
  alerts: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: Boolean,
    default: false
  },
  hasMore: {
    type: Boolean,
    default: false
  }
})

defineEmits(['load-more'])
</script>

<style scoped>
.alert-timeline {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.alert-timeline__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.alert-timeline__title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.alert-timeline__count {
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 99px;
  padding: 2px 10px;
  color: var(--color-text-muted);
}

.alert-timeline__state {
  padding: var(--space-6) 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.alert-timeline__state--error {
  color: var(--color-danger);
}

.alert-timeline__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.alert-timeline__load-more {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: 0.85rem;
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
  align-self: center;
}

.alert-timeline__load-more:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
</style>
