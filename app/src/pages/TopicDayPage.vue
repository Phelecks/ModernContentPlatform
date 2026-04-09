<!--
  TopicDayPage — the main topic/day view.

  Data sources:
    - Day status + navigation + alerts  →  Pages Functions (D1-backed)
    - Article + video metadata          →  GitHub-backed static content files

  Layout:
    - Desktop: two-column (main content | timeline side panel)
    - Mobile:  stacked vertically (header → video → summary → timeline)
-->
<template>
  <div class="page-container">
    <!-- Page-level loading -->
    <div
      v-if="pageLoading"
      class="loading-spinner"
    >
      Loading…
    </div>

    <div
      v-else-if="pageError"
      class="topic-day-page__error"
    >
      Failed to load page — please refresh.
    </div>

    <template v-else>
      <!-- Header: topic label + date navigator -->
      <TopicDayHeader
        :topic-slug="topicSlug"
        :display-name="displayName"
        :date-key="dateKey"
        :prev-date-key="nav.prev_date_key"
        :next-date-key="nav.next_date_key"
      />

      <!-- Publish state pill -->
      <div class="topic-day-page__banner">
        <PageStateBanner
          :type="bannerType"
          :message="bannerMessage"
        />
      </div>

      <!-- Two-column grid on desktop, stacked on mobile -->
      <div class="topic-day-layout">
        <!-- Main content column -->
        <div class="topic-day-page__main">
          <!-- Video area -->
          <section
            v-if="videoMeta"
            class="topic-day-page__section"
          >
            <VideoEmbed
              :video-id="videoMeta.video_id"
              :title="videoMeta.title"
            />
          </section>

          <!-- Summary or placeholder -->
          <section class="topic-day-page__section">
            <SummarySection
              v-if="status.article_available && articleMarkdown"
              :markdown="articleMarkdown"
            />
            <SummaryPlaceholder v-else />
          </section>

          <!-- Source attribution -->
          <section
            v-if="summaryData && summaryData.sources"
            class="topic-day-page__section"
          >
            <SourceList
              :sources="summaryData.sources"
              :confidence-note="summaryData.source_confidence_note"
            />
          </section>
        </div>

        <!-- Timeline side panel -->
        <AlertTimeline
          :alerts="alerts"
          :loading="timelineLoading"
          :error="timelineError"
          :has-more="timelineHasMore"
          @load-more="loadMoreAlerts"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import TopicDayHeader from '@/components/TopicDayHeader.vue'
import PageStateBanner from '@/components/PageStateBanner.vue'
import VideoEmbed from '@/components/VideoEmbed.vue'
import SummarySection from '@/components/SummarySection.vue'
import SummaryPlaceholder from '@/components/SummaryPlaceholder.vue'
import SourceList from '@/components/SourceList.vue'
import AlertTimeline from '@/components/AlertTimeline.vue'
import { fetchDayStatus, fetchNavigation, fetchTimeline } from '@/services/api.js'
import { fetchArticle, fetchVideoMeta, fetchSummary } from '@/services/content.js'

const route = useRoute()

// --- Route params ---
const topicSlug = computed(() => route.params.topicSlug)
const dateKey = computed(() => route.params.dateKey)

// --- State ---
const pageLoading = ref(true)
const pageError = ref(false)
const displayName = ref('')

const status = ref({
  page_state: 'pending',
  summary_available: 0,
  video_available: 0,
  article_available: 0
})

const nav = ref({ prev_date_key: null, next_date_key: null })

const videoMeta = ref(null)
const articleMarkdown = ref(null)
const summaryData = ref(null)

const alerts = ref([])
const timelineLoading = ref(false)
const timelineError = ref(false)
const timelineHasMore = ref(false)
const timelineCursor = ref(null)

// --- Derived ---
const bannerType = computed(() => {
  const state = status.value.page_state
  if (state === 'published') return 'success'
  if (state === 'error') return 'error'
  if (state === 'ready') return 'warning'
  return 'info'
})

const bannerMessage = computed(() => {
  const state = status.value.page_state
  if (state === 'published') return 'Published'
  if (state === 'ready') return 'Summary ready — publishing soon'
  if (state === 'error') return 'Publish error — check back later'
  return 'Live — summary pending end of day'
})

// --- Data loading ---

// Monotonic counter — incremented on every loadPage() call.
// Each in-flight load captures its own id and bails out if a newer load started.
let currentLoadId = 0

async function loadPage() {
  const myId = ++currentLoadId

  // Reset content from any previous route immediately
  videoMeta.value = null
  articleMarkdown.value = null
  summaryData.value = null
  pageError.value = false
  pageLoading.value = true

  try {
    const [dayStatus, dayNav] = await Promise.all([
      fetchDayStatus(topicSlug.value, dateKey.value),
      fetchNavigation(topicSlug.value, dateKey.value)
    ])

    // A newer load has already started — discard these results
    if (myId !== currentLoadId) return

    status.value = dayStatus
    nav.value = dayNav
    displayName.value = dayStatus.display_name ?? topicSlug.value

    // Load content files in parallel only when available
    const contentLoads = []
    if (dayStatus.video_available) {
      contentLoads.push(
        fetchVideoMeta(topicSlug.value, dateKey.value).then((v) => { videoMeta.value = v })
      )
    }
    if (dayStatus.article_available) {
      contentLoads.push(
        fetchArticle(topicSlug.value, dateKey.value).then((a) => { articleMarkdown.value = a })
      )
    }
    if (dayStatus.summary_available) {
      contentLoads.push(
        fetchSummary(topicSlug.value, dateKey.value).then((s) => { summaryData.value = s })
      )
    }
    await Promise.all(contentLoads)

    if (myId !== currentLoadId) return
  } catch (err) {
    if (myId !== currentLoadId) return
    console.error('[TopicDayPage] Failed to load page:', err)
    pageError.value = true
    pageLoading.value = false
    return // skip timeline when page shell data failed to load
  }

  pageLoading.value = false

  // Load timeline separately so the page shell renders first
  await loadTimeline(myId)
}

async function loadTimeline(myId) {
  if (myId !== currentLoadId) return
  timelineLoading.value = true
  timelineError.value = false
  try {
    const result = await fetchTimeline(topicSlug.value, dateKey.value, { limit: 30 })
    if (myId !== currentLoadId) return
    alerts.value = result.alerts ?? []
    timelineHasMore.value = result.has_more ?? false
    if (alerts.value.length) {
      timelineCursor.value = alerts.value[alerts.value.length - 1].event_at
    }
  } catch (err) {
    if (myId === currentLoadId) {
      console.error('[TopicDayPage] Failed to load timeline:', err)
      timelineError.value = true
    }
  } finally {
    if (myId === currentLoadId) timelineLoading.value = false
  }
}

async function loadMoreAlerts() {
  if (timelineLoading.value) return
  timelineLoading.value = true
  try {
    const result = await fetchTimeline(topicSlug.value, dateKey.value, {
      limit: 30,
      before: timelineCursor.value
    })
    alerts.value = [...alerts.value, ...(result.alerts ?? [])]
    timelineHasMore.value = result.has_more ?? false
    if (result.alerts?.length) {
      timelineCursor.value = result.alerts[result.alerts.length - 1].event_at
    }
  } catch {
    timelineError.value = true
  } finally {
    timelineLoading.value = false
  }
}

// Reload when route changes (e.g., navigating between days)
onMounted(loadPage)
watch([topicSlug, dateKey], () => {
  alerts.value = []
  timelineCursor.value = null
  timelineHasMore.value = false
  loadPage()
})
</script>

<style scoped>
.topic-day-page__error {
  padding: var(--space-12) 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

.topic-day-page__banner {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-6);
}

.topic-day-page__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0; /* prevent grid blowout */
}

.topic-day-page__section {
  width: 100%;
}
</style>
