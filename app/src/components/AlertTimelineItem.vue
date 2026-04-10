<template>
  <div
    class="alert-timeline-item"
    :class="`alert-timeline-item--severity-${severityLevel}`"
  >
    <div class="alert-timeline-item__meta">
      <span class="alert-timeline-item__time">{{ formattedTime }}</span>
      <SourceBadge
        v-if="alert.source_type"
        :type="alert.source_type"
        class="alert-timeline-item__type-badge"
      />
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
    <div
      v-if="hasSupportingSources"
      class="alert-timeline-item__supporting"
    >
      <span
        v-for="ss in alert.supporting_sources"
        :key="`${ss.source_name || ''}|${ss.source_url || ''}|${ss.source_type || ''}`"
        class="alert-timeline-item__supporting-source"
      >
        <SourceBadge
          v-if="ss.source_type"
          :type="ss.source_type"
        />
        <a
          v-if="isSafeUrl(ss.source_url)"
          :href="ss.source_url"
          target="_blank"
          rel="noopener noreferrer"
          class="alert-timeline-item__supporting-link"
        >{{ ss.source_name }}</a>
        <span v-else>{{ ss.source_name }}</span>
      </span>
    </div>
    <a
      v-if="isSafeUrl(alert.source_url)"
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
import { isSafeUrl } from '@/utils/url.js'
import SourceBadge from './SourceBadge.vue'

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

const hasSupportingSources = computed(() =>
  Array.isArray(props.alert.supporting_sources) && props.alert.supporting_sources.length > 0
)
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
  gap: var(--space-2);
  flex-wrap: wrap;
}

.alert-timeline-item__time {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.alert-timeline-item__type-badge {
  flex-shrink: 0;
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

.alert-timeline-item__supporting {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  align-items: center;
}

.alert-timeline-item__supporting-source {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.72rem;
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 1px var(--space-2);
}

.alert-timeline-item__supporting-link {
  color: var(--color-accent);
  text-decoration: none;
}

.alert-timeline-item__supporting-link:hover {
  text-decoration: underline;
}

.alert-timeline-item__link {
  font-size: 0.8rem;
  color: var(--color-accent);
  align-self: flex-start;
}
</style>
