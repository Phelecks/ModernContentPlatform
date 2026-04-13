<template>
  <span
    v-if="displayLabel"
    class="source-badge"
    :class="`source-badge--${normalizedType}`"
  >{{ displayLabel }}</span>
</template>

<script setup>
import { computed } from 'vue'

/**
 * Maps internal DB source_type values to user-friendly display labels.
 * Falls back to capitalising the first character of the raw value when
 * no mapping exists.
 */
const TYPE_MAP = {
  rss: 'News',
  api: 'Data',
  social: 'Social',
  webhook: 'Signal',
  x_account: 'X',
  x_query: 'X',
  newsapi: 'News',
  news: 'News',
  official: 'Official',
  data: 'Data',
  research: 'Research',
  x: 'X',
  signal: 'Signal'
}

/**
 * Normalized key used for the CSS modifier class.
 * Keeps class names stable regardless of which alias was supplied.
 */
const CSS_CLASS_MAP = {
  rss: 'news',
  api: 'data',
  social: 'social',
  webhook: 'signal',
  x_account: 'x',
  x_query: 'x',
  newsapi: 'news',
  news: 'news',
  official: 'official',
  data: 'data',
  research: 'research',
  x: 'x',
  signal: 'signal'
}

const props = defineProps({
  /** Source type string — DB value or display-level label */
  type: {
    type: String,
    default: null
  },
  /** Optional label override; takes precedence over type mapping */
  label: {
    type: String,
    default: null
  }
})

const displayLabel = computed(() => {
  if (props.label) return props.label
  if (!props.type) return ''
  const key = props.type.toLowerCase()
  return TYPE_MAP[key] ?? props.type.charAt(0).toUpperCase() + props.type.slice(1)
})

const normalizedType = computed(() => {
  if (!props.type) return 'default'
  const key = props.type.toLowerCase()
  return CSS_CLASS_MAP[key] ?? 'default'
})
</script>

<style scoped>
.source-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

/* ---- Type-specific colours (use design tokens + color-mix) ---- */

.source-badge--news {
  background: color-mix(in srgb, var(--color-accent) 15%, transparent);
  color: var(--color-accent);
}

.source-badge--official {
  background: color-mix(in srgb, var(--color-success) 15%, transparent);
  color: var(--color-success);
}

.source-badge--data {
  background: color-mix(in srgb, var(--color-accent) 15%, transparent);
  color: var(--color-accent);
}

.source-badge--research {
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
}

.source-badge--x {
  background: color-mix(in srgb, var(--color-text-muted) 12%, transparent);
  color: var(--color-text-muted);
}

.source-badge--signal {
  background: color-mix(in srgb, var(--color-danger) 15%, transparent);
  color: var(--color-danger);
}

.source-badge--social {
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  color: var(--color-accent);
}

.source-badge--default {
  background: color-mix(in srgb, var(--color-text-muted) 15%, transparent);
  color: var(--color-text-muted);
}
</style>
