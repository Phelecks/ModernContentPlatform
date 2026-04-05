<template>
  <div class="summary-placeholder">
    <div
      class="summary-placeholder__icon"
      aria-hidden="true"
    >
      📰
    </div>
    <h3 class="summary-placeholder__title">
      Summary in progress
    </h3>
    <p class="summary-placeholder__body">
      Today's full summary will be published at the end of the day.
      Check back later or watch the live timeline below for the latest alerts.
    </p>
  </div>
</template>

<style scoped>
.summary-placeholder {
  background: var(--color-surface);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-10) var(--space-6);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.summary-placeholder__icon {
  font-size: 2rem;
  line-height: 1;
}

.summary-placeholder__title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.summary-placeholder__body {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  max-width: 380px;
  line-height: 1.6;
}
</style>
