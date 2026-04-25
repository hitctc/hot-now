import { message } from "ant-design-vue";
import { computed, onMounted, reactive, ref } from "vue";

import type {
  AiTimelineEventRecord,
  AiTimelineImportanceLevel,
  AiTimelineReliabilityStatus,
  AiTimelineVisibilityStatus
} from "../../../services/aiTimelineApi";
import {
  readAiTimelineAdminEvents,
  readAiTimelineAdminWorkbench,
  triggerAiTimelineAdminCollect,
  updateAiTimelineAdminEvent,
  type AiTimelineAdminQuery
} from "../../../services/aiTimelineAdminApi";
import type {
  SettingsAiTimelineAdminResponse,
  SettingsAiTimelineEventsResponse,
  UpdateAiTimelineEventPayload
} from "../../../services/settingsApi";

export type AiTimelineAdminEventDraft = {
  manualTitle: string;
  manualSummaryZh: string;
  manualImportanceLevel: AiTimelineImportanceLevel | null;
  visibilityStatus: AiTimelineVisibilityStatus;
  reliabilityStatus: AiTimelineReliabilityStatus;
};

type PageNotice = {
  tone: "success" | "error" | "info";
  message: string;
};

export function useAiTimelineAdminPageController() {
  const isLoading = ref(true);
  const isRefreshing = ref(false);
  const loadError = ref<string | null>(null);
  const pageNotice = ref<PageNotice | null>(null);
  const adminModel = ref<SettingsAiTimelineAdminResponse | null>(null);
  const pendingActionKeys = ref(new Set<string>());
  const editingEvent = ref<AiTimelineEventRecord | null>(null);
  const isEditDrawerOpen = ref(false);

  const filterState = reactive({
    eventType: undefined as string | undefined,
    company: undefined as string | undefined,
    searchKeyword: "",
    importance: ["S", "A"] as AiTimelineImportanceLevel[],
    visibility: ["auto_visible", "manual_visible"] as AiTimelineVisibilityStatus[],
    recentDays: 30,
    page: 1
  });

  const editDraft = reactive<AiTimelineAdminEventDraft>({
    manualTitle: "",
    manualSummaryZh: "",
    manualImportanceLevel: null,
    visibilityStatus: "auto_visible",
    reliabilityStatus: "single_source"
  });

  const eventsModel = computed(() => adminModel.value?.events ?? null);
  const sourceHealthRows = computed(() => adminModel.value?.sources ?? []);
  const overview = computed(() => adminModel.value?.overview ?? null);
  const options = computed(() => adminModel.value?.options ?? null);

  function isActionPending(actionKey: string): boolean {
    return pendingActionKeys.value.has(actionKey);
  }

  function setActionPending(actionKey: string, pending: boolean): void {
    const next = new Set(pendingActionKeys.value);

    if (pending) {
      next.add(actionKey);
    } else {
      next.delete(actionKey);
    }

    pendingActionKeys.value = next;
  }

  function buildQuery(overrides: Partial<AiTimelineAdminQuery> = {}): AiTimelineAdminQuery {
    return {
      eventType: filterState.eventType,
      company: filterState.company,
      searchKeyword: filterState.searchKeyword,
      importance: filterState.importance,
      visibility: filterState.visibility,
      recentDays: filterState.recentDays,
      page: filterState.page,
      ...overrides
    };
  }

  async function loadWorkbench(): Promise<void> {
    isRefreshing.value = !isLoading.value;
    loadError.value = null;

    try {
      adminModel.value = await readAiTimelineAdminWorkbench(buildQuery());
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : "AI 时间线管理页加载失败";
    } finally {
      isLoading.value = false;
      isRefreshing.value = false;
    }
  }

  async function loadEvents(page = filterState.page): Promise<void> {
    filterState.page = page;
    const response = await readAiTimelineAdminEvents(buildQuery({ page }));
    replaceEventsModel(response);
  }

  function replaceEventsModel(events: SettingsAiTimelineEventsResponse): void {
    if (!adminModel.value) {
      return;
    }

    adminModel.value = {
      ...adminModel.value,
      events
    };
  }

  async function handleManualCollect(): Promise<void> {
    const actionKey = "manual:ai-timeline-collect";
    setActionPending(actionKey, true);

    try {
      const response = await triggerAiTimelineAdminCollect();

      if (!response.accepted) {
        pageNotice.value = { tone: "info", message: "AI 时间线采集没有启动，当前可能已有任务正在执行。" };
        return;
      }

      message.success(`已完成官方源采集，写入 ${response.persistedEventCount} 条候选事件。`);
      await loadWorkbench();
    } catch (error) {
      pageNotice.value = {
        tone: "error",
        message: error instanceof Error ? error.message : "AI 时间线采集失败"
      };
    } finally {
      setActionPending(actionKey, false);
    }
  }

  function openEditEvent(event: AiTimelineEventRecord): void {
    editingEvent.value = event;
    editDraft.manualTitle = event.manualTitle ?? "";
    editDraft.manualSummaryZh = event.manualSummaryZh ?? "";
    editDraft.manualImportanceLevel = event.manualImportanceLevel ?? event.importanceLevel;
    editDraft.visibilityStatus = event.visibilityStatus;
    editDraft.reliabilityStatus = event.reliabilityStatus;
    isEditDrawerOpen.value = true;
  }

  function closeEditDrawer(): void {
    isEditDrawerOpen.value = false;
    editingEvent.value = null;
  }

  async function saveEditedEvent(draft: AiTimelineAdminEventDraft): Promise<void> {
    if (!editingEvent.value) {
      return;
    }

    const eventId = editingEvent.value.id;
    const actionKey = `ai-timeline-event:${eventId}`;
    const payload: UpdateAiTimelineEventPayload = {
      manualTitle: draft.manualTitle.trim() || null,
      manualSummaryZh: draft.manualSummaryZh.trim() || null,
      manualImportanceLevel: draft.manualImportanceLevel,
      visibilityStatus: draft.visibilityStatus,
      reliabilityStatus: draft.reliabilityStatus
    };

    setActionPending(actionKey, true);

    try {
      await updateAiTimelineAdminEvent(eventId, payload);
      message.success("AI 时间线事件已更新。");
      closeEditDrawer();
      await loadWorkbench();
    } catch (error) {
      pageNotice.value = {
        tone: "error",
        message: error instanceof Error ? error.message : "AI 时间线事件保存失败"
      };
    } finally {
      setActionPending(actionKey, false);
    }
  }

  async function setEventVisibility(event: AiTimelineEventRecord, visibilityStatus: AiTimelineVisibilityStatus) {
    const actionKey = `ai-timeline-event:${event.id}`;
    setActionPending(actionKey, true);

    try {
      await updateAiTimelineAdminEvent(event.id, { visibilityStatus });
      await loadEvents(filterState.page);
    } catch (error) {
      pageNotice.value = {
        tone: "error",
        message: error instanceof Error ? error.message : "事件可见性更新失败"
      };
    } finally {
      setActionPending(actionKey, false);
    }
  }

  onMounted(() => {
    void loadWorkbench();
  });

  return {
    isLoading,
    isRefreshing,
    loadError,
    pageNotice,
    adminModel,
    overview,
    sourceHealthRows,
    eventsModel,
    options,
    filterState,
    editingEvent,
    editDraft,
    isEditDrawerOpen,
    isActionPending,
    loadWorkbench,
    loadEvents,
    handleManualCollect,
    openEditEvent,
    closeEditDrawer,
    saveEditedEvent,
    setEventVisibility
  };
}
