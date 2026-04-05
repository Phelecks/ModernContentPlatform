<template>
  <div
    class="alert-timeline-item"
    :class="`alert-timeline-item--severity-${severityLevel}`"
  >
    <div class="alert-timeline-item__meta">
      <span class="alert-timeline-item__time">{{ formattedTime }}</span>
      <span
        v-if="alert.source_name"
        class="alert-timeline-item__source"
      >
        {{ alert.source_name }}
      </span>
    </div>
    <h4 class="alert-timeline-item__headline">
      {{ alert.headline }}
    </h4>
    <p
      v-if="alert.summary_text"
      class="alert-timeline-item__summary"
    >
      {{ alert.summary_text }}
    </p>
    <a
      v-if="alert.source_url"
      :href="alert.source_url"
      target="_blank"
      rel="noopener noreferrer"
      class="alert-timeline-item__link"
    >
      Read more ↗
    </a>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { timeAgo } from '@/utils/date.js'

const props = defineProps({
  alert: {
    type: Object,
    required: true
  }
})

const formattedTime = computed(() => timeAgo(props.alert.event_at))

const severityLevel = computed(() => {
  const score = props.alert.severity_score ?? 0
  if (score >= 75) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
})
</script>

<style scoped>
.alert-timeline-item {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  border-left: 3px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.alert-timeline-item--severity-high {
  border-left-color: var(--color-danger);
}

.alert-timeline-item--severity-medium {
  border-left-color: var(--color-warning);
}

.alert-timeline-item--severity-low {
  border-left-color: var(--color-border);
}

.alert-timeline-item__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.alert-timeline-item__time {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.alert-timeline-item__source {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.alert-timeline-item__headline {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.4;
}

.alert-timeline-item__summary {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.alert-timeline-item__link {
  font-size: 0.8rem;
  color: var(--color-accent);
  align-self: flex-start;
}
</style>
