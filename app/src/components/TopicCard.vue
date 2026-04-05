<template>
  <router-link
    :to="cardLink"
    class="topic-card"
  >
    <div class="topic-card__body">
      <h3 class="topic-card__name">
        {{ topic.display_name }}
      </h3>
      <p
        v-if="topic.description"
        class="topic-card__desc"
      >
        {{ topic.description }}
      </p>
    </div>
    <div class="topic-card__footer">
      <span class="topic-card__cta">View latest →</span>
    </div>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  topic: {
    type: Object,
    required: true
  }
})

const cardLink = computed(() => `/topics/${props.topic.topic_slug}`)
</script>

<style scoped>
.topic-card {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  text-decoration: none;
  transition: border-color var(--transition-fast), background var(--transition-fast);
  cursor: pointer;
}

.topic-card:hover {
  border-color: var(--color-accent);
  background: var(--color-surface-raised);
  text-decoration: none;
}

.topic-card__body {
  flex: 1;
}

.topic-card__name {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}

.topic-card__desc {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.topic-card__footer {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.topic-card__cta {
  font-size: 0.85rem;
  color: var(--color-accent);
  font-weight: 600;
}
</style>
