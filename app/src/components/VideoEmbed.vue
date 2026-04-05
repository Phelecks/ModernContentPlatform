<template>
  <div class="video-embed">
    <div class="video-embed__container">
      <iframe
        :src="`https://www.youtube.com/embed/${videoId}`"
        :title="title || 'Daily video'"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        loading="lazy"
        class="video-embed__iframe"
      />
    </div>
    <p
      v-if="title"
      class="video-embed__title"
    >
      {{ title }}
    </p>
  </div>
</template>

<script setup>
defineProps({
  videoId: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: null
  }
})
</script>

<style scoped>
.video-embed {
  width: 100%;
}

/* 16:9 responsive wrapper */
.video-embed__container {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.video-embed__iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
}

.video-embed__title {
  margin-top: var(--space-3);
  font-size: 0.9rem;
  color: var(--color-text-muted);
}
</style>
