/** @vitest-environment jsdom */
/// <reference path="../logs-web/src/shims-vue.d.ts" />

import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

import type { LogEvent, LogEventListResponse } from "../src/modules/logs/contract.js";
import App from "../logs-web/src/App.vue";

const fetchMock = vi.fn<typeof fetch>();

class MockEventSource {
  static instances: MockEventSource[] = [];

  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readonly close = vi.fn();

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  emit(event: LogEvent): void {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify(event),
      }),
    );
  }

  static reset(): void {
    MockEventSource.instances = [];
  }
}

function buildEvent(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    id: 41,
    occurred_at: "2026-03-31T15:00:00.000Z",
    level: "info",
    scope: "server.request",
    message: "request completed",
    request_id: "req-1234",
    request_method: "GET",
    request_path: "/api/status",
    project_root: "/tmp/project",
    payload_json: JSON.stringify({
      duration_ms: 12,
      error_stack: "Error: boom\n    at line one",
      feature: "logging",
    }),
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  MockEventSource.reset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
});

describe("log viewer app", () => {
  it("renders the results table, headers, and colored level badges", async () => {
    const event = buildEvent();
    mockLogFetches({
      detail: event,
      list: {
        events: [event],
        latest_id: event.id,
        next_before_id: null,
      },
    });

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain("Time");
    expect(wrapper.text()).toContain("Level");
    expect(wrapper.text()).toContain("Scope");
    expect(wrapper.text()).toContain("request completed");
    expect(wrapper.get('[data-testid="level-badge"]').classes()).toContain("level-badge--info");
  });

  it("clicking scope, request, and project pills applies those filters", async () => {
    const event = buildEvent();
    mockLogFetches({
      detail: event,
      list: {
        events: [event],
        latest_id: event.id,
        next_before_id: null,
      },
    });

    const wrapper = mount(App);
    await flushPromises();

    await wrapper.get('[data-testid="scope-pill"]').trigger("click");
    await flushPromises();
    expect((wrapper.get('[data-testid="scope-filter"]').element as HTMLInputElement).value).toBe(
      "server.request",
    );

    await wrapper.get('[data-testid="request-pill"]').trigger("click");
    await flushPromises();
    expect((wrapper.get('[data-testid="request-filter"]').element as HTMLInputElement).value).toBe(
      "req-1234",
    );

    await wrapper.get('[data-testid="project-pill"]').trigger("click");
    await flushPromises();
    expect((wrapper.get('[data-testid="project-filter"]').element as HTMLInputElement).value).toBe(
      "/tmp/project",
    );
  });

  it("disables live tail while free-text search is active and resumes when cleared", async () => {
    const event = buildEvent();
    mockLogFetches({
      detail: event,
      list: {
        events: [event],
        latest_id: event.id,
        next_before_id: null,
      },
    });

    const wrapper = mount(App);
    await flushPromises();

    expect(MockEventSource.instances).toHaveLength(1);

    await wrapper.get('[data-testid="search-input"]').setValue("needle");
    await flushPromises();

    expect(wrapper.get('[data-testid="live-tail-warning"]').text()).toContain(
      "free-text search",
    );
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();

    await wrapper.get('[data-testid="search-input"]').setValue("");
    await flushPromises();

    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("disables live tail while a time range is active", async () => {
    const event = buildEvent();
    mockLogFetches({
      detail: event,
      list: {
        events: [event],
        latest_id: event.id,
        next_before_id: null,
      },
    });

    const wrapper = mount(App);
    await flushPromises();

    await wrapper.get('[data-testid="from-filter"]').setValue("2026-03-31T15:00");
    await flushPromises();

    expect(wrapper.get('[data-testid="live-tail-warning"]').text()).toContain("time window");
  });

  it("renders the detail panel with structured payload and stack trace", async () => {
    const event = buildEvent();
    mockLogFetches({
      detail: event,
      list: {
        events: [event],
        latest_id: event.id,
        next_before_id: null,
      },
    });

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.get('[data-testid="payload-json"]').text()).toContain('"feature": "logging"');
    expect(wrapper.get('[data-testid="stack-trace"]').text()).toContain("Error: boom");
  });

  it("prepends live events from the stream to the table", async () => {
    const event = buildEvent();
    const streamed = buildEvent({
      id: 42,
      level: "error",
      message: "streamed event",
    });
    mockLogFetches({
      detail: event,
      list: {
        events: [event],
        latest_id: event.id,
        next_before_id: null,
      },
    });

    const wrapper = mount(App);
    await flushPromises();

    MockEventSource.instances[0].emit(streamed);
    await flushPromises();

    expect(wrapper.text()).toContain("streamed event");
    expect(wrapper.findAll('[data-testid="level-badge"]')[0].classes()).toContain(
      "level-badge--error",
    );
  });
});

function mockLogFetches(input: {
  detail: LogEvent;
  list: LogEventListResponse;
}): void {
  fetchMock.mockImplementation(async (request) => {
    const url = typeof request === "string" ? request : String(request);

    if (url.startsWith("/api/logs/events?")) {
      return jsonResponse(input.list);
    }

    if (url === `/api/logs/events/${input.detail.id}`) {
      return jsonResponse(input.detail);
    }

    throw new Error(`Unexpected fetch url: ${url}`);
  });
}
