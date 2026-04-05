<!--
  TopicPage — redirect to today's day page for this topic.
  If the redirect fails, show a placeholder error.
-->
<template>
  <div class="page-container">
    <div
      v-if="loading"
      class="loading-spinner"
    >
      Loading…
    </div>
    <div
      v-else-if="error"
      class="topic-page__error"
    >
      Topic not found or failed to load.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchDayStatus } from '@/services/api.js'
import { todayKey } from '@/utils/date.js'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref(false)

async function redirectToToday() {
  loading.value = true
  error.value = false
  try {
    const topicSlug = route.params.topicSlug
    const dateKey = todayKey()
    // Check if today's page exists; if not fall back gracefully.
    await fetchDayStatus(topicSlug, dateKey)
    router.replace({ name: 'topic-day', params: { topicSlug, dateKey } })
  } catch {
    error.value = true
    loading.value = false
  }
}

onMounted(redirectToToday)
watch(() => route.params.topicSlug, redirectToToday)
</script>

<style scoped>
.topic-page__error {
  padding: var(--space-12) 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.95rem;
}
</style>
