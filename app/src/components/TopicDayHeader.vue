<template>
  <div class="topic-day-header">
    <div class="topic-day-header__topic">
      <router-link
        :to="`/topics/${topicSlug}`"
        class="topic-day-header__topic-link"
      >
        {{ displayName }}
      </router-link>
    </div>
    <DateNavigator
      :topic-slug="topicSlug"
      :date-key="dateKey"
      :prev-date-key="prevDateKey"
      :next-date-key="nextDateKey"
    />
  </div>
</template>

<script setup>
import DateNavigator from './DateNavigator.vue'

defineProps({
  topicSlug: {
    type: String,
    required: true
  },
  displayName: {
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
</script>

<style scoped>
.topic-day-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8) 0 var(--space-6);
  text-align: center;
}

.topic-day-header__topic-link {
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color var(--transition-fast);
}

.topic-day-header__topic-link:hover {
  color: var(--color-accent);
  text-decoration: none;
}
</style>
