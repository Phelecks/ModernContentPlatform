<template>
  <div class="site-wrapper">
    <header class="site-header">
      <nav class="site-nav">
        <router-link
          to="/"
          class="site-logo"
        >
          Modern Content Platform
        </router-link>
      </nav>
    </header>

    <main class="site-main">
      <router-view />
    </main>

    <footer class="site-footer">
      <p>© {{ currentYear }} Modern Content Platform</p>
    </footer>
  </div>
</template>

<script setup>
const currentYear = new Date().getFullYear()
</script>

<style scoped>
.site-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.site-header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.site-nav {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 0 var(--space-4);
  height: 56px;
  display: flex;
  align-items: center;
}

.site-logo {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-text);
  text-decoration: none;
  letter-spacing: -0.01em;
}

.site-logo:hover {
  color: var(--color-accent);
}

.site-main {
  flex: 1;
  width: 100%;
}

.site-footer {
  border-top: 1px solid var(--color-border);
  padding: var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
</style>
