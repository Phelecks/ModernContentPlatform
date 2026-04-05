<template>
  <article class="summary-section">
    <h2 class="summary-section__heading">
      Daily Summary
    </h2>
    <!-- Render sanitized HTML. Content originates from GitHub-owned files;
         DOMPurify provides a defence-in-depth layer against any unexpected markup. -->
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-if="sanitizedHtml"
      class="summary-section__body prose"
      v-html="sanitizedHtml"
    />
    <!-- eslint-enable vue/no-v-html -->
    <div
      v-else-if="markdown"
      class="summary-section__body prose"
    >
      <!-- Markdown is passed pre-rendered by the parent page -->
      <pre class="summary-section__raw">{{ markdown }}</pre>
    </div>
    <slot v-else />
  </article>
</template>

<script setup>
import { computed } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({
  /** Pre-rendered HTML string (preferred) */
  html: {
    type: String,
    default: null
  },
  /** Raw markdown fallback when an HTML renderer is unavailable */
  markdown: {
    type: String,
    default: null
  }
})

/** Sanitized version of the html prop; null when no html is provided. */
const sanitizedHtml = computed(() =>
  props.html ? DOMPurify.sanitize(props.html) : null
)
</script>

<style scoped>
.summary-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
}

.summary-section__heading {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: var(--space-5);
  color: var(--color-text);
}

.summary-section__raw {
  white-space: pre-wrap;
  font-family: var(--font-sans);
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--color-text);
}

/* Prose styles for rendered HTML */
:deep(.prose) {
  font-size: 0.95rem;
  line-height: 1.75;
  color: var(--color-text);
}

:deep(.prose p) {
  margin-bottom: var(--space-4);
}

:deep(.prose h2),
:deep(.prose h3) {
  margin: var(--space-6) 0 var(--space-3);
  font-weight: 700;
}

:deep(.prose ul),
:deep(.prose ol) {
  padding-left: var(--space-6);
  margin-bottom: var(--space-4);
}

:deep(.prose li) {
  margin-bottom: var(--space-2);
}

:deep(.prose a) {
  color: var(--color-accent);
}

:deep(.prose strong) {
  font-weight: 700;
}
</style>
