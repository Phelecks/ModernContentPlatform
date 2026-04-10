<template>
  <span
    class="source-badge"
    :class="`source-badge--${normalizedType}`"
  >{{ displayLabel }}</span>
</template>

<script setup>
import { computed } from 'vue'

/**
 * Maps internal DB source_type values to user-friendly display labels.
 * Falls back to title-casing the raw value when no mapping exists.
 */
const TYPE_MAP = {
  rss: 'News',
  api: 'Data',
  social: 'Social',
  webhook: 'Signal',
  x_account: 'X',
  x_query: 'X',
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

/* ---- Type-specific colours ---- */

.source-badge--news {
  background: rgba(91, 141, 238, 0.15);
  color: #5b8dee;
}

.source-badge--official {
  background: rgba(62, 207, 142, 0.15);
  color: #3ecf8e;
}

.source-badge--data {
  background: rgba(168, 131, 243, 0.15);
  color: #a883f3;
}

.source-badge--research {
  background: rgba(245, 166, 35, 0.15);
  color: #f5a623;
}

.source-badge--x {
  background: rgba(232, 234, 240, 0.12);
  color: #e8eaf0;
}

.source-badge--signal {
  background: rgba(229, 83, 83, 0.15);
  color: #e55353;
}

.source-badge--social {
  background: rgba(91, 141, 238, 0.10);
  color: #7a9fea;
}

.source-badge--default {
  background: rgba(122, 127, 147, 0.15);
  color: #7a7f93;
}
</style>
