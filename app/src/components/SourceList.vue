<template>
  <aside
    v-if="sources && sources.length > 0"
    class="source-list"
  >
    <h3 class="source-list__heading">
      Sources
    </h3>
    <ul class="source-list__items">
      <li
        v-for="source in sources"
        :key="`${source.source_name || ''}::${source.source_url || ''}::${source.source_role || ''}`"
        class="source-list__item"
      >
        <SourceBadge
          v-if="source.source_type"
          :type="source.source_type"
        />
        <a
          v-if="isSafeUrl(source.source_url)"
          :href="source.source_url"
          class="source-list__link"
          target="_blank"
          rel="noopener noreferrer"
        >{{ source.source_name }}</a>
        <span
          v-else
          class="source-list__name"
        >{{ source.source_name }}</span>
        <span
          v-if="source.source_role"
          class="source-list__role"
        >{{ source.source_role }}</span>
      </li>
    </ul>
    <p
      v-if="confidenceNote"
      class="source-list__confidence"
    >
      {{ confidenceNote }}
    </p>
  </aside>
</template>

<script setup>
import SourceBadge from './SourceBadge.vue'
import { isSafeUrl } from '@/utils/url.js'

defineProps({
  /** Array of source objects: { source_name, source_url?, source_type?, source_role? } */
  sources: {
    type: Array,
    default: null
  },
  /** Optional confidence note about source quality */
  confidenceNote: {
    type: String,
    default: null
  }
})
</script>

<style scoped>
.source-list {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  margin-top: var(--space-5);
}

.source-list__heading {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-3);
}

.source-list__items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.source-list__item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-3);
  font-size: 0.82rem;
  line-height: 1.4;
}

.source-list__link {
  color: var(--color-accent);
  text-decoration: none;
}

.source-list__link:hover {
  text-decoration: underline;
}

.source-list__name {
  color: var(--color-text);
}

.source-list__role {
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.source-list__confidence {
  margin-top: var(--space-3);
  font-size: 0.8rem;
  font-style: italic;
  color: var(--color-text-muted);
}
</style>
