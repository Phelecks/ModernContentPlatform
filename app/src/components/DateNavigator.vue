<template>
  <div class="date-navigator">
    <router-link
      v-if="prevDateKey"
      :to="`/topics/${topicSlug}/${prevDateKey}`"
      class="date-navigator__arrow date-navigator__arrow--prev"
      :aria-label="`Previous day: ${prevDateKey}`"
    >
      ←
    </router-link>
    <span
      v-else
      class="date-navigator__arrow date-navigator__arrow--disabled"
      aria-hidden="true"
    >←</span>

    <span class="date-navigator__date">{{ formattedDate }}</span>

    <router-link
      v-if="nextDateKey"
      :to="`/topics/${topicSlug}/${nextDateKey}`"
      class="date-navigator__arrow date-navigator__arrow--next"
      :aria-label="`Next day: ${nextDateKey}`"
    >
      →
    </router-link>
    <span
      v-else
      class="date-navigator__arrow date-navigator__arrow--disabled"
      aria-hidden="true"
    >→</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatDateKey } from '@/utils/date.js'

const props = defineProps({
  topicSlug: {
    type: String,
    required: true
  },
  dateKey: {
    type: String,
    required: true
  },
  prevDateKey: {
    type: String,
    default: null
  },
  nextDateKey: {
    type: String,
    default: null
  }
})

const formattedDate = computed(() => formatDateKey(props.dateKey))
</script>

<style scoped>
.date-navigator {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.date-navigator__date {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--color-text);
  min-width: 200px;
  text-align: center;
}

.date-navigator__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  text-decoration: none;
  transition: border-color var(--transition-fast), color var(--transition-fast);
  cursor: pointer;
  user-select: none;
}

.date-navigator__arrow:not(.date-navigator__arrow--disabled):hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  text-decoration: none;
}

.date-navigator__arrow--disabled {
  opacity: 0.25;
  cursor: default;
}

@media (max-width: 480px) {
  .date-navigator__date {
    font-size: 1.1rem;
    min-width: 160px;
  }
}
</style>
