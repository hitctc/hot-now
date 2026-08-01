import { reactive, ref } from "vue";

import type {
  SaveBilibiliQueryPayload,
  SaveHackerNewsQueryPayload,
  SaveSourcePayload,
  SaveTwitterAccountPayload,
  SaveTwitterSearchKeywordPayload,
  SettingsBilibiliQuery,
  SettingsHackerNewsQuery,
  SettingsSourceItem,
  SettingsTwitterAccount,
  SettingsTwitterSearchKeyword,
  SettingsWechatRssSource,
  UpdateWechatRssSourcePayload
} from "../../../services/settingsApi";
import type {
  BilibiliQueryFormState,
  BilibiliQueryModalMode,
  HackerNewsQueryFormState,
  HackerNewsQueryModalMode,
  SourceFormState,
  SourceModalMode,
  TwitterAccountFormState,
  TwitterAccountModalMode,
  TwitterKeywordFormState,
  TwitterKeywordModalMode,
  WechatRssFormState,
  WechatRssModalMode
} from "./sourcesPageShared";

type SourcesPageFormsOptions = {
  onUnsupportedSourceEdit: (message: string) => void;
};

// 六类来源表单共享创建、回填、关闭和提交前校验；页面加载与后端动作留在控制器中。
export function useSourcesPageForms(options: SourcesPageFormsOptions) {
  const isSourceModalOpen = ref(false);
  const isTwitterAccountModalOpen = ref(false);
  const isTwitterKeywordModalOpen = ref(false);
  const isHackerNewsQueryModalOpen = ref(false);
  const isBilibiliQueryModalOpen = ref(false);
  const isWechatRssModalOpen = ref(false);
  const sourceModalMode = ref<SourceModalMode>("create");
  const twitterAccountModalMode = ref<TwitterAccountModalMode>("create");
  const twitterKeywordModalMode = ref<TwitterKeywordModalMode>("create");
  const hackerNewsQueryModalMode = ref<HackerNewsQueryModalMode>("create");
  const bilibiliQueryModalMode = ref<BilibiliQueryModalMode>("create");
  const wechatRssModalMode = ref<WechatRssModalMode>("create");
  const sourceFormError = ref<string | null>(null);
  const twitterAccountFormError = ref<string | null>(null);
  const twitterKeywordFormError = ref<string | null>(null);
  const hackerNewsQueryFormError = ref<string | null>(null);
  const bilibiliQueryFormError = ref<string | null>(null);
  const wechatRssFormError = ref<string | null>(null);
  const sourceForm = reactive<SourceFormState>(createEmptySourceForm());
  const twitterAccountForm = reactive<TwitterAccountFormState>(createEmptyTwitterAccountForm());
  const twitterKeywordForm = reactive<TwitterKeywordFormState>(createEmptyTwitterKeywordForm());
  const hackerNewsQueryForm = reactive<HackerNewsQueryFormState>(createEmptyHackerNewsQueryForm());
  const bilibiliQueryForm = reactive<BilibiliQueryFormState>(createEmptyBilibiliQueryForm());
  const wechatRssForm = reactive<WechatRssFormState>(createEmptyWechatRssForm());

  function createEmptySourceForm(): SourceFormState {
    return {
      kind: "",
      rssUrl: ""
    };
  }

  // 每次打开弹窗都从同一套初始值开始，避免上一次编辑残留到下一次新增。
  function resetSourceForm(): void {
    Object.assign(sourceForm, createEmptySourceForm());
    sourceFormError.value = null;
  }

  function createEmptyTwitterAccountForm(): TwitterAccountFormState {
    return {
      id: null,
      username: "",
      displayName: "",
      category: "official_vendor",
      priority: 90,
      includeReplies: false,
      notes: ""
    };
  }

  function resetTwitterAccountForm(): void {
    Object.assign(twitterAccountForm, createEmptyTwitterAccountForm());
    twitterAccountFormError.value = null;
  }

  function createEmptyTwitterKeywordForm(): TwitterKeywordFormState {
    return {
      id: null,
      keyword: "",
      category: "topic",
      priority: 60,
      isCollectEnabled: true,
      isVisible: true,
      notes: ""
    };
  }

  function resetTwitterKeywordForm(): void {
    Object.assign(twitterKeywordForm, createEmptyTwitterKeywordForm());
    twitterKeywordFormError.value = null;
  }

  function createEmptyHackerNewsQueryForm(): HackerNewsQueryFormState {
    return {
      id: null,
      query: "",
      priority: 60,
      isEnabled: true,
      notes: ""
    };
  }

  function resetHackerNewsQueryForm(): void {
    Object.assign(hackerNewsQueryForm, createEmptyHackerNewsQueryForm());
    hackerNewsQueryFormError.value = null;
  }

  function createEmptyBilibiliQueryForm(): BilibiliQueryFormState {
    return {
      id: null,
      query: "",
      priority: 60,
      isEnabled: true,
      notes: ""
    };
  }

  function resetBilibiliQueryForm(): void {
    Object.assign(bilibiliQueryForm, createEmptyBilibiliQueryForm());
    bilibiliQueryFormError.value = null;
  }

  function createEmptyWechatRssForm(): WechatRssFormState {
    return {
      id: null,
      displayName: "",
      rssUrl: "",
      rssUrls: ""
    };
  }

  function resetWechatRssForm(): void {
    Object.assign(wechatRssForm, createEmptyWechatRssForm());
    wechatRssFormError.value = null;
  }

  // 新增模式只需要清空表单并打开弹窗，不再引入额外的临时草稿状态。
  function openCreateSourceModal(): void {
    sourceModalMode.value = "create";
    resetSourceForm();
    isSourceModalOpen.value = true;
  }

  function openCreateTwitterAccountModal(): void {
    twitterAccountModalMode.value = "create";
    resetTwitterAccountForm();
    isTwitterAccountModalOpen.value = true;
  }

  function openCreateTwitterKeywordModal(): void {
    twitterKeywordModalMode.value = "create";
    resetTwitterKeywordForm();
    isTwitterKeywordModalOpen.value = true;
  }

  function openCreateHackerNewsQueryModal(): void {
    hackerNewsQueryModalMode.value = "create";
    resetHackerNewsQueryForm();
    isHackerNewsQueryModalOpen.value = true;
  }

  function openCreateBilibiliQueryModal(): void {
    bilibiliQueryModalMode.value = "create";
    resetBilibiliQueryForm();
    isBilibiliQueryModalOpen.value = true;
  }

  function openCreateWechatRssModal(): void {
    wechatRssModalMode.value = "create";
    resetWechatRssForm();
    isWechatRssModalOpen.value = true;
  }

  // 编辑模式只回填 RSS 来源已有配置，kind 继续锁定，避免把“编辑”做成“重命名来源主键”。
  function openEditSourceModal(source: SettingsSourceItem): void {
    if (source.sourceType !== "rss") {
      options.onUnsupportedSourceEdit("该来源后续会迁移到单独配置表，这里暂不再编辑。");
      return;
    }

    sourceModalMode.value = "update";
    resetSourceForm();
    sourceForm.kind = source.kind;
    sourceForm.rssUrl = source.rssUrl ?? "";
    isSourceModalOpen.value = true;
  }

  function openEditTwitterAccountModal(account: SettingsTwitterAccount): void {
    twitterAccountModalMode.value = "update";
    resetTwitterAccountForm();
    twitterAccountForm.id = account.id;
    twitterAccountForm.username = account.username;
    twitterAccountForm.displayName = account.displayName;
    twitterAccountForm.category = account.category;
    twitterAccountForm.priority = account.priority;
    twitterAccountForm.includeReplies = account.includeReplies;
    twitterAccountForm.notes = account.notes ?? "";
    isTwitterAccountModalOpen.value = true;
  }

  function openEditTwitterKeywordModal(keyword: SettingsTwitterSearchKeyword): void {
    twitterKeywordModalMode.value = "update";
    resetTwitterKeywordForm();
    twitterKeywordForm.id = keyword.id;
    twitterKeywordForm.keyword = keyword.keyword;
    twitterKeywordForm.category = keyword.category;
    twitterKeywordForm.priority = keyword.priority;
    twitterKeywordForm.isCollectEnabled = keyword.isCollectEnabled;
    twitterKeywordForm.isVisible = keyword.isVisible;
    twitterKeywordForm.notes = keyword.notes ?? "";
    isTwitterKeywordModalOpen.value = true;
  }

  function openEditHackerNewsQueryModal(query: SettingsHackerNewsQuery): void {
    hackerNewsQueryModalMode.value = "update";
    resetHackerNewsQueryForm();
    hackerNewsQueryForm.id = query.id;
    hackerNewsQueryForm.query = query.query;
    hackerNewsQueryForm.priority = query.priority;
    hackerNewsQueryForm.isEnabled = query.isEnabled;
    hackerNewsQueryForm.notes = query.notes ?? "";
    isHackerNewsQueryModalOpen.value = true;
  }

  function openEditBilibiliQueryModal(query: SettingsBilibiliQuery): void {
    bilibiliQueryModalMode.value = "update";
    resetBilibiliQueryForm();
    bilibiliQueryForm.id = query.id;
    bilibiliQueryForm.query = query.query;
    bilibiliQueryForm.priority = query.priority;
    bilibiliQueryForm.isEnabled = query.isEnabled;
    bilibiliQueryForm.notes = query.notes ?? "";
    isBilibiliQueryModalOpen.value = true;
  }

  // 单条编辑只回填当前 RSS 的名称和地址，批量新增 textarea 不参与这条路径。
  function openEditWechatRssSource(source: SettingsWechatRssSource): void {
    wechatRssModalMode.value = "update";
    resetWechatRssForm();
    wechatRssForm.id = source.id;
    wechatRssForm.displayName = source.displayName || `公众号 RSS #${source.id}`;
    wechatRssForm.rssUrl = source.rssUrl;
    isWechatRssModalOpen.value = true;
  }

  // 关闭弹窗时顺手清掉局部错误，避免旧错误粘在下一次操作里。
  function closeSourceModal(): void {
    isSourceModalOpen.value = false;
    sourceFormError.value = null;
  }

  function closeTwitterAccountModal(): void {
    isTwitterAccountModalOpen.value = false;
    twitterAccountFormError.value = null;
  }

  function closeTwitterKeywordModal(): void {
    isTwitterKeywordModalOpen.value = false;
    twitterKeywordFormError.value = null;
  }

  function closeHackerNewsQueryModal(): void {
    isHackerNewsQueryModalOpen.value = false;
    hackerNewsQueryFormError.value = null;
  }

  function closeBilibiliQueryModal(): void {
    isBilibiliQueryModalOpen.value = false;
    bilibiliQueryFormError.value = null;
  }

  function closeWechatRssModal(): void {
    isWechatRssModalOpen.value = false;
    wechatRssFormError.value = null;
  }


  function buildSourceSavePayload(): { ok: true; payload: SaveSourcePayload } | { ok: false; message: string } {
    const rssUrl = sourceForm.rssUrl.trim();

    if (!rssUrl) {
      return { ok: false, message: "请填写 RSS 地址。" };
    }

    return {
      ok: true,
      payload:
        sourceModalMode.value === "update"
          ? {
              kind: sourceForm.kind,
              sourceType: "rss",
              rssUrl
            }
          : {
              sourceType: "rss",
              rssUrl
            }
    };
  }

  function buildTwitterAccountSavePayload(): { ok: true; payload: SaveTwitterAccountPayload } | { ok: false; message: string } {
    const username = twitterAccountForm.username.trim();

    if (!username) {
      return { ok: false, message: "请填写 Twitter username。" };
    }

    if (!Number.isInteger(twitterAccountForm.priority) || twitterAccountForm.priority < 0 || twitterAccountForm.priority > 100) {
      return { ok: false, message: "优先级需要是 0 到 100 之间的整数。" };
    }

    return {
      ok: true,
      payload: {
        ...(twitterAccountModalMode.value === "update" && twitterAccountForm.id ? { id: twitterAccountForm.id } : {}),
        username,
        displayName: twitterAccountForm.displayName.trim() || null,
        category: twitterAccountForm.category,
        priority: twitterAccountForm.priority,
        includeReplies: twitterAccountForm.includeReplies,
        notes: twitterAccountForm.notes.trim() || null
      }
    };
  }

  function buildTwitterKeywordSavePayload(): { ok: true; payload: SaveTwitterSearchKeywordPayload } | { ok: false; message: string } {
    const keyword = twitterKeywordForm.keyword.trim();

    if (!keyword) {
      return { ok: false, message: "请填写 Twitter 关键词。" };
    }

    if (!Number.isInteger(twitterKeywordForm.priority) || twitterKeywordForm.priority < 0 || twitterKeywordForm.priority > 100) {
      return { ok: false, message: "优先级需要是 0 到 100 之间的整数。" };
    }

    return {
      ok: true,
      payload: {
        ...(twitterKeywordModalMode.value === "update" && twitterKeywordForm.id ? { id: twitterKeywordForm.id } : {}),
        keyword,
        category: twitterKeywordForm.category,
        priority: twitterKeywordForm.priority,
        isCollectEnabled: twitterKeywordForm.isCollectEnabled,
        isVisible: twitterKeywordForm.isVisible,
        notes: twitterKeywordForm.notes.trim() || null
      }
    };
  }

  function buildHackerNewsQuerySavePayload(): { ok: true; payload: SaveHackerNewsQueryPayload } | { ok: false; message: string } {
    const query = hackerNewsQueryForm.query.trim();

    if (!query) {
      return { ok: false, message: "请填写 Hacker News 查询词。" };
    }

    if (!Number.isInteger(hackerNewsQueryForm.priority) || hackerNewsQueryForm.priority < 0 || hackerNewsQueryForm.priority > 100) {
      return { ok: false, message: "优先级需要是 0 到 100 之间的整数。" };
    }

    return {
      ok: true,
      payload: {
        ...(hackerNewsQueryModalMode.value === "update" && hackerNewsQueryForm.id ? { id: hackerNewsQueryForm.id } : {}),
        query,
        priority: hackerNewsQueryForm.priority,
        isEnabled: hackerNewsQueryForm.isEnabled,
        notes: hackerNewsQueryForm.notes.trim() || null
      }
    };
  }

  function buildBilibiliQuerySavePayload(): { ok: true; payload: SaveBilibiliQueryPayload } | { ok: false; message: string } {
    const query = bilibiliQueryForm.query.trim();

    if (!query) {
      return { ok: false, message: "请填写 B 站查询词。" };
    }

    if (!Number.isInteger(bilibiliQueryForm.priority) || bilibiliQueryForm.priority < 0 || bilibiliQueryForm.priority > 100) {
      return { ok: false, message: "优先级需要是 0 到 100 之间的整数。" };
    }

    return {
      ok: true,
      payload: {
        ...(bilibiliQueryModalMode.value === "update" && bilibiliQueryForm.id ? { id: bilibiliQueryForm.id } : {}),
        query,
        priority: bilibiliQueryForm.priority,
        isEnabled: bilibiliQueryForm.isEnabled,
        notes: bilibiliQueryForm.notes.trim() || null
      }
    };
  }

  function buildWechatRssCreatePayload(): { ok: true; payload: { rssUrls: string } } | { ok: false; message: string } {
    const rssUrls = wechatRssForm.rssUrls.trim();

    if (!rssUrls) {
      return { ok: false, message: "请至少填写一个微信公众号 RSS 链接。" };
    }

    return {
      ok: true,
      payload: { rssUrls }
    };
  }

  // 编辑 payload 必须带上已有 ID，避免把“改一条 RSS”误提交成批量新增。
  function buildWechatRssUpdatePayload():
    | { ok: true; payload: UpdateWechatRssSourcePayload }
    | { ok: false; message: string } {
    const id = wechatRssForm.id;
    const displayName = wechatRssForm.displayName.trim();
    const rssUrl = wechatRssForm.rssUrl.trim();

    if (!id || id <= 0) {
      return { ok: false, message: "微信公众号 RSS ID 不合法。" };
    }

    if (!displayName) {
      return { ok: false, message: "请填写微信公众号 RSS 来源名称。" };
    }

    if (!rssUrl) {
      return { ok: false, message: "请填写微信公众号 RSS 地址。" };
    }

    return {
      ok: true,
      payload: {
        id,
        displayName,
        rssUrl
      }
    };
  }

  return {
    isSourceModalOpen,
    isTwitterAccountModalOpen,
    isTwitterKeywordModalOpen,
    isHackerNewsQueryModalOpen,
    isBilibiliQueryModalOpen,
    isWechatRssModalOpen,
    sourceModalMode,
    twitterAccountModalMode,
    twitterKeywordModalMode,
    hackerNewsQueryModalMode,
    bilibiliQueryModalMode,
    wechatRssModalMode,
    sourceFormError,
    twitterAccountFormError,
    twitterKeywordFormError,
    hackerNewsQueryFormError,
    bilibiliQueryFormError,
    wechatRssFormError,
    sourceForm,
    twitterAccountForm,
    twitterKeywordForm,
    hackerNewsQueryForm,
    bilibiliQueryForm,
    wechatRssForm,
    openCreateSourceModal,
    openCreateTwitterAccountModal,
    openCreateTwitterKeywordModal,
    openCreateHackerNewsQueryModal,
    openCreateBilibiliQueryModal,
    openCreateWechatRssModal,
    openEditSourceModal,
    openEditTwitterAccountModal,
    openEditTwitterKeywordModal,
    openEditHackerNewsQueryModal,
    openEditBilibiliQueryModal,
    openEditWechatRssSource,
    closeSourceModal,
    closeTwitterAccountModal,
    closeTwitterKeywordModal,
    closeHackerNewsQueryModal,
    closeBilibiliQueryModal,
    closeWechatRssModal,
    buildSourceSavePayload,
    buildTwitterAccountSavePayload,
    buildTwitterKeywordSavePayload,
    buildHackerNewsQuerySavePayload,
    buildBilibiliQuerySavePayload,
    buildWechatRssCreatePayload,
    buildWechatRssUpdatePayload
  };
}
