<template>
  <div class="page-container">
    <section class="home-hero">
      <h1 class="home-hero__title">
        Modern Content Platform
      </h1>
      <p class="home-hero__subtitle">
        AI-powered intelligence and daily summaries across topics that matter.
      </p>
    </section>

    <section class="home-topics">
      <h2 class="home-topics__heading">
        Topics
      </h2>

      <div
        v-if="loading"
        class="loading-spinner"
      >
        Loading topics…
      </div>

      <div
        v-else-if="error"
        class="home-topics__error"
      >
        Failed to load topics. Please try again later.
      </div>

      <TopicGrid
        v-else
        :topics="topics"
      />
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import TopicGrid from '@/components/TopicGrid.vue'
import { fetchTopics } from '@/services/api.js'

const topics = ref([])
const loading = ref(true)
const error = ref(false)

onMounted(async () => {
  try {
    topics.value = await fetchTopics()
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.home-hero {
  text-align: center;
  padding: var(--space-16) 0 var(--space-12);
}

.home-hero__title {
  font-size: clamp(1.8rem, 5vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-bottom: var(--space-4);
}

.home-hero__subtitle {
  font-size: 1.1rem;
  color: var(--color-text-muted);
  max-width: 520px;
  margin: 0 auto;
}

.home-topics {
  padding-bottom: var(--space-16);
}

.home-topics__heading {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: var(--space-5);
}

.home-topics__error {
  color: var(--color-danger);
  font-size: 0.9rem;
  padding: var(--space-6) 0;
}
</style>
