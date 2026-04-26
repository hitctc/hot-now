import { computed, onMounted, reactive, ref } from "vue";

import type {
  AiTimelineImportanceLevel,
  AiTimelineVisibilityStatus
} from "../../../services/aiTimelineApi";
import {
  readAiTimelineAdminEvents,
  readAiTimelineAdminWorkbench,
  type AiTimelineAdminQuery
} from "../../../services/aiTimelineAdminApi";
import type {
  SettingsAiTimelineAdminResponse,
  SettingsAiTimelineEventsResponse
} from "../../../services/settingsApi";

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

  const filterState = reactive({
    eventType: undefined as string | undefined,
    company: undefined as string | undefined,
    searchKeyword: "",
    importance: ["S", "A"] as AiTimelineImportanceLevel[],
    visibility: ["auto_visible", "manual_visible"] as AiTimelineVisibilityStatus[],
    recentDays: 30,
    page: 1
  });

  const eventsModel = computed(() => adminModel.value?.events ?? null);
  const sourceHealthRows = computed(() => adminModel.value?.sources ?? []);
  const overview = computed(() => adminModel.value?.overview ?? null);
  const options = computed(() => adminModel.value?.options ?? null);

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
    loadWorkbench,
    loadEvents
  };
}
