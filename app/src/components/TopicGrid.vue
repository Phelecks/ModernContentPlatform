<template>
  <div class="topic-grid">
    <TopicCard
      v-for="topic in topics"
      :key="topic.topic_slug"
      :topic="topic"
    />
  </div>
</template>

<script setup>
import TopicCard from './TopicCard.vue'

defineProps({
  topics: {
    type: Array,
    required: true
  }
})
</script>

<style scoped>
.topic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-5);
}

@media (max-width: 600px) {
  .topic-grid {
    grid-template-columns: 1fr;
  }
}
</style>
