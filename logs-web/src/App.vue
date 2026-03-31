<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import {
  clearLogEvents,
  fetchLogEvent,
  fetchLogEvents,
  levelClassName,
  openLogStream,
  type LogEvent,
  type LogFilters,
} from "./api/logs";

interface EventsRoute {
  kind: "events";
}

interface RequestRoute {
  kind: "llm-request";
  fromEventId: number | null;
  requestEventId: number;
}

type ViewerRoute = EventsRoute | RequestRoute;

const filters = ref<LogFilters>({
  from: "",
  level: "",
  project_root: "",
  q: "",
  request_id: "",
  scope: "",
  to: "",
});
const events = ref<LogEvent[]>([]);
const selectedEvent = ref<LogEvent | null>(null);
const nextBeforeId = ref<number | null>(null);
const latestId = ref<number | null>(null);
const errorMessage = ref("");
const successMessage = ref("");
const isLoading = ref(false);
const isLoadingDetail = ref(false);
const isLoadingMore = ref(false);
const isLoadingRequestView = ref(false);
const isClearingLogs = ref(false);
const showClearLogsModal = ref(false);
const liveTailEnabled = ref(true);
const route = ref<ViewerRoute>(readRouteFromHash());
const requestViewEvent = ref<LogEvent | null>(null);
let liveSource: EventSource | null = null;

const liveTailBlockedReason = computed(() => {
  if (filters.value.q) {
    return "Live tail is disabled while free-text search is active.";
  }

  if (filters.value.from || filters.value.to) {
    return "Live tail is disabled while a time window is active.";
  }

  return "";
});

const liveTailActive = computed(() => liveTailEnabled.value && !liveTailBlockedReason.value);
const selectedPayload = computed(() => parsePayloadJson(selectedEvent.value?.payload_json));
const selectedLlmRequestEventId = computed(() => {
  const value = selectedPayload.value?.request_log_event_id;
  return typeof value === "number" ? value : null;
});
const prettyPayload = computed(() => {
  if (!selectedEvent.value) {
    return "";
  }

  return JSON.stringify(JSON.parse(selectedEvent.value.payload_json), null, 2);
});
const selectedStackTrace = computed(() => {
  if (!selectedEvent.value) {
    return "";
  }

  const payload = JSON.parse(selectedEvent.value.payload_json) as Record<string, unknown>;
  return typeof payload.error_stack === "string" ? payload.error_stack : "";
});
const eventCountLabel = computed(() => (isLoading.value ? "Loading…" : `${events.value.length} loaded`));
const requestViewPayload = computed(() => {
  if (!requestViewEvent.value) {
    return "";
  }

  return JSON.stringify(parsePayloadJson(requestViewEvent.value.payload_json) ?? {}, null, 2);
});

onMounted(async () => {
  window.addEventListener("hashchange", syncRouteFromHash);
  await loadCurrentRoute();
});

onBeforeUnmount(() => {
  closeLiveSource();
  window.removeEventListener("hashchange", syncRouteFromHash);
});

watch(
  filters,
  async () => {
    if (route.value.kind !== "events") {
      return;
    }

    await refreshEvents();
  },
  { deep: true },
);

watch(
  () => [
    route.value.kind,
    liveTailActive.value,
    latestId.value ?? 0,
    filters.value.level,
    filters.value.scope,
    filters.value.request_id,
    filters.value.project_root,
  ].join("::"),
  () => {
    if (route.value.kind !== "events") {
      closeLiveSource();
      return;
    }

    refreshLiveTail();
  },
);

watch(
  route,
  async () => {
    await loadCurrentRoute();
  },
  { deep: true },
);

async function refreshEvents(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const response = await fetchLogEvents({
      ...filters.value,
      limit: 200,
    });

    events.value = response.events;
    nextBeforeId.value = response.next_before_id;
    latestId.value = response.latest_id ?? response.events[0]?.id ?? null;

    if (response.events.length === 0) {
      selectedEvent.value = null;
      closeLiveSource();
      return;
    }

    const selectedId = selectedEvent.value?.id;
    const nextSelectedId = selectedId && response.events.some((event) => event.id === selectedId)
      ? selectedId
      : response.events[0].id;

    await loadEventDetail(nextSelectedId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Failed to load log events.";
    closeLiveSource();
  } finally {
    isLoading.value = false;
  }
}

async function loadOlderEvents(): Promise<void> {
  if (!nextBeforeId.value) {
    return;
  }

  isLoadingMore.value = true;
  errorMessage.value = "";

  try {
    const response = await fetchLogEvents({
      ...filters.value,
      before_id: nextBeforeId.value,
      limit: 200,
    });

    events.value = deduplicateEvents([...events.value, ...response.events]);
    nextBeforeId.value = response.next_before_id;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Failed to load older log events.";
  } finally {
    isLoadingMore.value = false;
  }
}

async function loadEventDetail(eventId: number): Promise<void> {
  isLoadingDetail.value = true;
  errorMessage.value = "";

  try {
    selectedEvent.value = await fetchLogEvent(eventId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Failed to load log event detail.";
  } finally {
    isLoadingDetail.value = false;
  }
}

async function loadRequestView(eventId: number): Promise<void> {
  isLoadingRequestView.value = true;
  errorMessage.value = "";

  try {
    requestViewEvent.value = await fetchLogEvent(eventId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Failed to load LLM request detail.";
    requestViewEvent.value = null;
  } finally {
    isLoadingRequestView.value = false;
  }
}

function refreshLiveTail(): void {
  closeLiveSource();

  if (!liveTailActive.value) {
    return;
  }

  liveSource = openLogStream({
    after_id: latestId.value ?? undefined,
    level: filters.value.level,
    project_root: filters.value.project_root,
    request_id: filters.value.request_id,
    scope: filters.value.scope,
  });
  liveSource.onmessage = (message) => {
    const event = JSON.parse(message.data) as LogEvent;

    latestId.value = Math.max(latestId.value ?? 0, event.id);
    events.value = deduplicateEvents([event, ...events.value]).slice(0, 500);

    if (!selectedEvent.value) {
      void loadEventDetail(event.id);
    }
  };
  liveSource.onerror = () => {
    errorMessage.value = "Live tail disconnected.";
    closeLiveSource();
  };
}

function closeLiveSource(): void {
  liveSource?.close();
  liveSource = null;
}

function applyFilter(key: keyof LogFilters, value: string | null): void {
  filters.value = {
    ...filters.value,
    [key]: value ?? "",
  };
}

function clearFilters(): void {
  filters.value = {
    from: "",
    level: "",
    project_root: "",
    q: "",
    request_id: "",
    scope: "",
    to: "",
  };
  liveTailEnabled.value = true;
}

function promptClearLogs(): void {
  showClearLogsModal.value = true;
}

function cancelClearLogs(): void {
  if (isClearingLogs.value) {
    return;
  }

  showClearLogsModal.value = false;
}

async function confirmClearLogs(): Promise<void> {
  isClearingLogs.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  try {
    const result = await clearLogEvents();
    showClearLogsModal.value = false;
    closeLiveSource();
    events.value = [];
    selectedEvent.value = null;
    requestViewEvent.value = null;
    nextBeforeId.value = null;
    latestId.value = null;
    successMessage.value = result.cleared_count > 0
      ? `Cleared ${result.cleared_count} log event${result.cleared_count === 1 ? "" : "s"}.`
      : "Logs are already empty.";

    if (route.value.kind === "llm-request") {
      returnToEvents();
      return;
    }

    await refreshEvents();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Failed to clear log events.";
  } finally {
    isClearingLogs.value = false;
  }
}

async function loadCurrentRoute(): Promise<void> {
  if (route.value.kind === "llm-request") {
    closeLiveSource();
    await loadRequestView(route.value.requestEventId);
    return;
  }

  requestViewEvent.value = null;
  await refreshEvents();
}

function openRequestView(requestEventId: number): void {
  const fromEventId = selectedEvent.value?.id ?? null;
  const hash = fromEventId
    ? `#llm-request/${requestEventId}/from/${fromEventId}`
    : `#llm-request/${requestEventId}`;
  window.location.hash = hash;
  syncRouteFromHash();
}

function returnToEvents(): void {
  window.location.hash = "";
  syncRouteFromHash();
}

function syncRouteFromHash(): void {
  route.value = readRouteFromHash();
}

function deduplicateEvents(entries: LogEvent[]): LogEvent[] {
  const seen = new Set<number>();
  return entries.filter((event) => {
    if (seen.has(event.id)) {
      return false;
    }

    seen.add(event.id);
    return true;
  });
}

function compactPayloadPreview(payloadJson: string): string {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    const visibleEntries = Object.entries(parsed).filter(([key]) => key !== "error_stack");

    if (visibleEntries.length === 0) {
      return "";
    }

    return visibleEntries
      .slice(0, 3)
      .map(([key, value]) => `${key}=${formatCompactValue(value)}`)
      .join(" ");
  } catch {
    return "";
  }
}

function formatCompactValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function parsePayloadJson(payloadJson: string | undefined): Record<string, unknown> | null {
  if (!payloadJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readRouteFromHash(): ViewerRoute {
  const match = window.location.hash.match(/^#llm-request\/(\d+)(?:\/from\/(\d+))?$/);

  if (!match) {
    return { kind: "events" };
  }

  return {
    kind: "llm-request",
    fromEventId: match[2] ? Number(match[2]) : null,
    requestEventId: Number(match[1]),
  };
}
</script>

<template>
  <main class="log-viewer-shell">
    <template v-if="route.kind === 'llm-request'">
      <section class="toolbar">
        <div class="toolbar__title">
          <p class="eyebrow">Log Viewer</p>
          <h1>LLM request</h1>
          <span class="toolbar__meta">
            {{ isLoadingRequestView ? "Loading…" : requestViewEvent ? `#${requestViewEvent.id}` : "Unavailable" }}
          </span>
        </div>

        <button class="ghost-button" data-testid="back-button" type="button" @click="returnToEvents">Back</button>
      </section>

      <p v-if="errorMessage" class="status status--error">{{ errorMessage }}</p>
      <p v-if="successMessage" class="status status--ok">{{ successMessage }}</p>

      <section class="panel panel--request-view">
        <header class="panel-header">
          <h2>Request detail</h2>
          <span>{{ route.fromEventId ? `Opened from #${route.fromEventId}` : "Direct view" }}</span>
        </header>

        <template v-if="requestViewEvent">
          <dl class="detail-grid">
            <div>
              <dt>Message</dt>
              <dd>{{ requestViewEvent.message }}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd class="mono">{{ requestViewEvent.scope }}</dd>
            </div>
            <div>
              <dt>Request id</dt>
              <dd class="mono">{{ requestViewEvent.request_id || "-" }}</dd>
            </div>
            <div>
              <dt>Project root</dt>
              <dd class="mono">{{ requestViewEvent.project_root || "-" }}</dd>
            </div>
          </dl>

          <div class="detail-block">
            <h3>Payload</h3>
            <pre data-testid="request-payload-json">{{ requestViewPayload }}</pre>
          </div>
        </template>

        <p v-else class="empty-detail">The requested LLM request log was not found.</p>
      </section>
    </template>

    <template v-else>
      <section class="toolbar">
        <div class="toolbar__title">
          <p class="eyebrow">Log Viewer</p>
          <h1>Backend events</h1>
          <span class="toolbar__meta">{{ eventCountLabel }}</span>
        </div>

        <label class="live-toggle">
          <input v-model="liveTailEnabled" type="checkbox" />
          <span>Live tail</span>
        </label>
      </section>

      <section class="filters">
        <label>
          <span>Search</span>
          <input v-model="filters.q" data-testid="search-input" type="search" placeholder="message, path, payload" />
        </label>
        <label>
          <span>Level</span>
          <select v-model="filters.level" data-testid="level-filter">
            <option value="">All</option>
            <option value="trace">trace</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </label>
        <label>
          <span>Scope</span>
          <input v-model="filters.scope" data-testid="scope-filter" type="text" placeholder="server.request" />
        </label>
        <label>
          <span>Request id</span>
          <input v-model="filters.request_id" data-testid="request-filter" type="text" placeholder="req-1234" />
        </label>
        <label>
          <span>Project root</span>
          <input v-model="filters.project_root" data-testid="project-filter" type="text" placeholder="/path/to/project" />
        </label>
        <label>
          <span>From</span>
          <input v-model="filters.from" data-testid="from-filter" type="datetime-local" />
        </label>
        <label>
          <span>To</span>
          <input v-model="filters.to" data-testid="to-filter" type="datetime-local" />
        </label>
        <button class="ghost-button" type="button" @click="clearFilters">Clear filters</button>
      </section>

      <p v-if="liveTailBlockedReason" class="status status--warning" data-testid="live-tail-warning">
        {{ liveTailBlockedReason }}
      </p>
      <p v-else-if="liveTailActive" class="status status--ok">Live tail is active.</p>
      <div class="toolbar toolbar--actions">
        <div />
        <button class="ghost-button ghost-button--danger" data-testid="clear-logs" type="button" @click="promptClearLogs">
          Clear Logs
        </button>
      </div>
      <p v-if="errorMessage" class="status status--error">{{ errorMessage }}</p>
      <p v-if="successMessage" class="status status--ok">{{ successMessage }}</p>

      <section class="viewer-grid">
        <section class="panel panel--table">
          <header class="panel-header">
            <h2>Events</h2>
            <span>{{ eventCountLabel }}</span>
          </header>

          <div class="table-head">
            <span>Time</span>
            <span>Level</span>
            <span>Scope</span>
            <span>Request</span>
            <span>Project</span>
            <span>Message</span>
            <span>Payload</span>
          </div>

          <button
            v-for="event in events"
            :key="event.id"
            class="event-row"
            :class="{ 'event-row--selected': selectedEvent?.id === event.id }"
            type="button"
            @click="loadEventDetail(event.id)"
          >
            <span class="mono event-row__time">{{ event.occurred_at }}</span>
            <span :class="levelClassName(event.level)" data-testid="level-badge">{{ event.level }}</span>
            <span class="mono pill" data-testid="scope-pill" @click.stop="applyFilter('scope', event.scope)">{{ event.scope }}</span>
            <span class="mono pill" data-testid="request-pill" @click.stop="applyFilter('request_id', event.request_id)">{{ event.request_id || "-" }}</span>
            <span class="mono pill" data-testid="project-pill" @click.stop="applyFilter('project_root', event.project_root)">{{ event.project_root || "-" }}</span>
            <span class="event-row__message">{{ event.message }}</span>
            <span class="mono event-row__payload">{{ compactPayloadPreview(event.payload_json) || "-" }}</span>
          </button>

          <div class="table-actions">
            <button
              v-if="nextBeforeId"
              class="ghost-button"
              data-testid="load-older"
              type="button"
              :disabled="isLoadingMore"
              @click="loadOlderEvents"
            >
              {{ isLoadingMore ? "Loading…" : "Load older events" }}
            </button>
          </div>
        </section>

        <section class="panel panel--detail">
          <header class="panel-header">
            <h2>Detail</h2>
            <span>{{ isLoadingDetail ? "Loading…" : selectedEvent ? `#${selectedEvent.id}` : "No event selected" }}</span>
          </header>

          <template v-if="selectedEvent">
            <dl class="detail-grid">
              <div>
                <dt>Message</dt>
                <dd>{{ selectedEvent.message }}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd class="mono">{{ selectedEvent.scope }}</dd>
              </div>
              <div>
                <dt>Request id</dt>
                <dd class="mono">{{ selectedEvent.request_id || "-" }}</dd>
              </div>
              <div>
                <dt>Project root</dt>
                <dd class="mono">{{ selectedEvent.project_root || "-" }}</dd>
              </div>
            </dl>

            <div v-if="selectedLlmRequestEventId" class="detail-actions">
              <button
                class="ghost-button"
                data-testid="view-request"
                type="button"
                @click="openRequestView(selectedLlmRequestEventId)"
              >
                View Request
              </button>
            </div>

            <div class="detail-block">
              <h3>Payload</h3>
              <pre data-testid="payload-json">{{ prettyPayload }}</pre>
            </div>

            <div v-if="selectedStackTrace" class="detail-block">
              <h3>Stack trace</h3>
              <pre data-testid="stack-trace">{{ selectedStackTrace }}</pre>
            </div>
          </template>

          <p v-else class="empty-detail">Select an event to inspect its full payload.</p>
        </section>
      </section>
    </template>

    <div v-if="showClearLogsModal" class="modal-scrim" data-testid="clear-logs-modal">
      <section class="modal-card" aria-modal="true" role="dialog">
        <header class="modal-card__header">
          <h2>Clear persisted logs?</h2>
        </header>
        <p class="modal-card__body">
          This deletes all stored log events from the SQLite log store. The action cannot be undone.
        </p>
        <div class="modal-card__actions">
          <button
            class="ghost-button"
            data-testid="cancel-clear-logs"
            type="button"
            :disabled="isClearingLogs"
            @click="cancelClearLogs"
          >
            Cancel
          </button>
          <button
            class="ghost-button ghost-button--danger"
            data-testid="confirm-clear-logs"
            type="button"
            :disabled="isClearingLogs"
            @click="confirmClearLogs"
          >
            {{ isClearingLogs ? "Clearing…" : "Delete all logs" }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
