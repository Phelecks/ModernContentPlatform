<template>
  <div class="page-container ops-dashboard">
    <h1 class="ops-dashboard__title">
      Operator Dashboard
    </h1>

    <!-- Auth gate -->
    <div
      v-if="!authenticated"
      class="ops-auth"
    >
      <label
        for="ops-key-input"
        class="ops-auth__label"
      >
        Enter your ops read key to view operational data.
      </label>
      <form
        class="ops-auth__form"
        @submit.prevent="authenticate"
      >
        <input
          id="ops-key-input"
          v-model="opsKey"
          type="password"
          class="ops-auth__input"
          placeholder="X-Ops-Key"
          autocomplete="off"
          aria-label="Operator dashboard read key"
        >
        <button
          type="submit"
          class="ops-auth__btn"
        >
          Authenticate
        </button>
      </form>
      <p
        v-if="authError"
        class="ops-auth__error"
      >
        {{ authError }}
      </p>
    </div>

    <!-- Dashboard content -->
    <div v-else>
      <div
        v-if="loading"
        class="loading-spinner"
      >
        Loading dashboard…
      </div>

      <div
        v-else-if="error"
        class="ops-dashboard__error"
      >
        {{ error }}
        <button
          class="ops-auth__btn ops-retry-btn"
          @click="resetAuth"
        >
          Retry
        </button>
      </div>

      <div
        v-else
        class="ops-sections"
      >
        <!-- Last Publish Per Topic -->
        <section class="ops-section">
          <h2 class="ops-section__heading">
            Last Publish Per Topic
          </h2>
          <div
            v-if="data.last_publish_per_topic.length === 0"
            class="ops-empty"
          >
            No published topics yet.
          </div>
          <table
            v-else
            class="ops-table"
          >
            <thead>
              <tr>
                <th>Topic</th>
                <th>Date</th>
                <th>Published At</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.last_publish_per_topic"
                :key="row.topic_slug"
              >
                <td>{{ row.topic_slug }}</td>
                <td>{{ row.date_key }}</td>
                <td>{{ row.published_at || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Recent Workflow Runs -->
        <section class="ops-section">
          <h2 class="ops-section__heading">
            Recent Workflow Runs
          </h2>
          <div
            v-if="data.recent_workflow_runs.length === 0"
            class="ops-empty"
          >
            No recent workflow runs.
          </div>
          <table
            v-else
            class="ops-table"
          >
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Type</th>
                <th>Topic</th>
                <th>Date</th>
                <th>Module</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.recent_workflow_runs"
                :key="row.id"
                :class="eventRowClass(row.event_type)"
              >
                <td>{{ row.workflow_name }}</td>
                <td>
                  <span :class="'ops-badge ops-badge--' + row.event_type">
                    {{ row.event_type }}
                  </span>
                </td>
                <td>{{ row.topic_slug || '—' }}</td>
                <td>{{ row.date_key || '—' }}</td>
                <td>{{ row.module_name || '—' }}</td>
                <td class="ops-table__mono">
                  {{ row.created_at }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Failed Workflow Events -->
        <section class="ops-section">
          <h2 class="ops-section__heading">
            Failed Workflow Events
          </h2>
          <div
            v-if="data.failed_workflow_events.length === 0"
            class="ops-empty ops-empty--success"
          >
            No recent failures.
          </div>
          <table
            v-else
            class="ops-table"
          >
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Module</th>
                <th>Error</th>
                <th>Topic</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.failed_workflow_events"
                :key="row.id"
                class="ops-row--error"
              >
                <td>{{ row.workflow_name }}</td>
                <td>{{ row.module_name || '—' }}</td>
                <td class="ops-table__error-msg">
                  {{ row.error_message || '—' }}
                </td>
                <td>{{ row.topic_slug || '—' }}</td>
                <td class="ops-table__mono">
                  {{ row.created_at }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Pending Publish Jobs -->
        <section class="ops-section">
          <h2 class="ops-section__heading">
            Pending Publish Jobs
          </h2>
          <div
            v-if="data.pending_publish_jobs.length === 0"
            class="ops-empty"
          >
            No pending publish jobs.
          </div>
          <table
            v-else
            class="ops-table"
          >
            <thead>
              <tr>
                <th>Topic</th>
                <th>Date</th>
                <th>Status</th>
                <th>Attempt</th>
                <th>Triggered By</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.pending_publish_jobs"
                :key="row.id"
              >
                <td>{{ row.topic_slug }}</td>
                <td>{{ row.date_key }}</td>
                <td>
                  <span class="ops-badge ops-badge--pending">
                    {{ row.status }}
                  </span>
                </td>
                <td>{{ row.attempt }}</td>
                <td>{{ row.triggered_by || '—' }}</td>
                <td class="ops-table__mono">
                  {{ row.created_at }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Failed Publish Jobs -->
        <section class="ops-section">
          <h2 class="ops-section__heading">
            Failed Publish Jobs
          </h2>
          <div
            v-if="data.failed_publish_jobs.length === 0"
            class="ops-empty ops-empty--success"
          >
            No failed publish jobs.
          </div>
          <table
            v-else
            class="ops-table"
          >
            <thead>
              <tr>
                <th>Topic</th>
                <th>Date</th>
                <th>Attempt</th>
                <th>Error</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.failed_publish_jobs"
                :key="row.id"
                class="ops-row--error"
              >
                <td>{{ row.topic_slug }}</td>
                <td>{{ row.date_key }}</td>
                <td>{{ row.attempt }}</td>
                <td class="ops-table__error-msg">
                  {{ row.error_message || '—' }}
                </td>
                <td class="ops-table__mono">
                  {{ row.created_at }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Social Publish Failures -->
        <section class="ops-section">
          <h2 class="ops-section__heading">
            Social Publish Failures
          </h2>
          <div
            v-if="data.social_publish_failures.length === 0"
            class="ops-empty ops-empty--success"
          >
            No social publish failures.
          </div>
          <table
            v-else
            class="ops-table"
          >
            <thead>
              <tr>
                <th>Source</th>
                <th>Platform</th>
                <th>Topic</th>
                <th>Date</th>
                <th>Attempt</th>
                <th>Error</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.social_publish_failures"
                :key="`${row.source}:${row.id}`"
                class="ops-row--error"
              >
                <td>{{ row.source }}</td>
                <td>{{ row.platform || '—' }}</td>
                <td>{{ row.topic_slug }}</td>
                <td>{{ row.date_key }}</td>
                <td>{{ row.attempt }}</td>
                <td class="ops-table__error-msg">
                  {{ row.error_message || '—' }}
                </td>
                <td class="ops-table__mono">
                  {{ row.created_at }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- AI Usage Summary -->
        <section class="ops-section">
          <h2 class="ops-section__heading">
            AI Usage Summary
            <span class="ops-section__subtitle">(last 50 calls)</span>
          </h2>
          <div class="ops-stats">
            <div class="ops-stat">
              <span class="ops-stat__value">{{ data.ai_usage_summary.total_calls }}</span>
              <span class="ops-stat__label">Total Calls</span>
            </div>
            <div class="ops-stat">
              <span class="ops-stat__value">{{ data.ai_usage_summary.total_tokens.toLocaleString() }}</span>
              <span class="ops-stat__label">Total Tokens</span>
            </div>
            <div class="ops-stat">
              <span
                class="ops-stat__value"
                :class="{ 'ops-stat__value--danger': data.ai_usage_summary.error_count > 0 }"
              >
                {{ data.ai_usage_summary.error_count }}
              </span>
              <span class="ops-stat__label">Errors</span>
            </div>
          </div>
          <table
            v-if="data.ai_usage_summary.recent.length > 0"
            class="ops-table"
          >
            <thead>
              <tr>
                <th>Task</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Status</th>
                <th>Topic</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.ai_usage_summary.recent"
                :key="row.id"
                :class="row.status === 'error' ? 'ops-row--error' : ''"
              >
                <td>{{ row.task }}</td>
                <td>{{ row.model }}</td>
                <td>{{ row.total_tokens }}</td>
                <td>
                  <span :class="'ops-badge ops-badge--' + row.status">
                    {{ row.status }}
                  </span>
                </td>
                <td>{{ row.topic_slug || '—' }}</td>
                <td class="ops-table__mono">
                  {{ row.created_at }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { fetchOperatorDashboard } from '@/services/api.js'

const opsKey = ref('')
const authenticated = ref(false)
const loading = ref(false)
const error = ref(null)
const authError = ref(null)
const data = ref(null)

async function authenticate() {
  if (!opsKey.value.trim()) {
    authError.value = 'Please enter an ops key.'
    return
  }
  authError.value = null
  loading.value = true
  error.value = null

  try {
    data.value = await fetchOperatorDashboard(opsKey.value)
    authenticated.value = true
  } catch (err) {
    if (err.message.includes('401') || err.message.includes('403')) {
      authError.value = 'Authentication failed. Check your ops key.'
    } else {
      authenticated.value = true
      error.value = 'Failed to load dashboard data. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

function resetAuth() {
  authenticated.value = false
  error.value = null
  data.value = null
}

function eventRowClass(eventType) {
  if (eventType === 'error') return 'ops-row--error'
  if (eventType === 'retry') return 'ops-row--warning'
  return ''
}
</script>

<style scoped>
.ops-dashboard__title {
  font-size: clamp(1.4rem, 3vw, 2rem);
  font-weight: 800;
  margin-bottom: var(--space-8);
}

/* Auth gate */
.ops-auth {
  max-width: 400px;
}

.ops-auth__label {
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
  font-size: 0.95rem;
}

.ops-auth__form {
  display: flex;
  gap: var(--space-3);
}

.ops-auth__input {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.9rem;
}

.ops-auth__input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.ops-auth__btn {
  padding: var(--space-2) var(--space-4);
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}

.ops-auth__btn:hover {
  background: var(--color-accent-hover);
}

.ops-auth__error {
  color: var(--color-danger);
  font-size: 0.85rem;
  margin-top: var(--space-3);
}

/* Dashboard error */
.ops-dashboard__error {
  color: var(--color-danger);
  font-size: 0.9rem;
  padding: var(--space-6) 0;
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.ops-retry-btn {
  font-size: 0.85rem;
  padding: var(--space-1) var(--space-3);
}

/* Sections */
.ops-sections {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}

.ops-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
}

.ops-section__heading {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: var(--space-4);
}

.ops-section__subtitle {
  font-weight: 400;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

/* Empty states */
.ops-empty {
  color: var(--color-text-muted);
  font-size: 0.9rem;
  padding: var(--space-4) 0;
}

.ops-empty--success {
  color: var(--color-success);
}

/* Tables */
.ops-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.ops-table th {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.ops-table td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}

.ops-table__mono {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  white-space: nowrap;
}

.ops-table__error-msg {
  color: var(--color-danger);
  max-width: 300px;
  word-break: break-word;
}

/* Row states */
.ops-row--error {
  background: rgba(229, 83, 83, 0.06);
}

.ops-row--warning {
  background: rgba(245, 166, 35, 0.06);
}

/* Badges */
.ops-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.ops-badge--error {
  background: rgba(229, 83, 83, 0.15);
  color: var(--color-danger);
}

.ops-badge--retry {
  background: rgba(245, 166, 35, 0.15);
  color: var(--color-warning);
}

.ops-badge--completed {
  background: rgba(62, 207, 142, 0.15);
  color: var(--color-success);
}

.ops-badge--info {
  background: rgba(91, 141, 238, 0.15);
  color: var(--color-accent);
}

.ops-badge--warning {
  background: rgba(245, 166, 35, 0.15);
  color: var(--color-warning);
}

.ops-badge--ok {
  background: rgba(62, 207, 142, 0.15);
  color: var(--color-success);
}

.ops-badge--pending {
  background: rgba(122, 127, 147, 0.15);
  color: var(--color-text-muted);
}

/* Stats */
.ops-stats {
  display: flex;
  gap: var(--space-6);
  margin-bottom: var(--space-4);
}

.ops-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-4) var(--space-6);
  background: var(--color-surface-raised);
  border-radius: var(--radius-md);
  min-width: 100px;
}

.ops-stat__value {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-text);
}

.ops-stat__value--danger {
  color: var(--color-danger);
}

.ops-stat__label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: var(--space-1);
}

/* Responsive */
@media (max-width: 768px) {
  .ops-table {
    display: block;
    overflow-x: auto;
  }

  .ops-stats {
    flex-wrap: wrap;
  }
}
</style>
