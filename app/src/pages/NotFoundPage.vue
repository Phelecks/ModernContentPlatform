<template>
  <div class="page-container">
    <div class="not-found">
      <h1 class="not-found__title">
        404
      </h1>
      <p class="not-found__body">
        This page doesn't exist.
      </p>
      <router-link
        to="/"
        class="not-found__link"
      >
        ← Back to home
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  text-align: center;
  padding: var(--space-16) 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.not-found__title {
  font-size: 5rem;
  font-weight: 800;
  color: var(--color-text-muted);
  letter-spacing: -0.04em;
}

.not-found__body {
  font-size: 1rem;
  color: var(--color-text-muted);
}

.not-found__link {
  font-size: 0.9rem;
  color: var(--color-accent);
}
</style>
