<!-- 手动生图操作弹窗：选择 provider/codex 流程 + 8 种 action，始终可用 -->
<script setup lang="ts">
import { ref, computed } from "vue";
import { message } from "ant-design-vue";
import {
  providerGenerateImage,
  codexGenerateImage,
  fetchMissingImages,
  type ImageGenAction,
  type ImageGenResponse,
  type MissingImagesResponse,
  type CreativeFinishedArticle,
} from "../../services/creativeApi.js";

const props = defineProps<{
  open: boolean;
  article: CreativeFinishedArticle | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  done: [];
}>();

// ─── 流程选择 ───

type Flow = "provider" | "codex";
const selectedFlow = ref<Flow>("provider");

// ─── action 分组 ───

type ActionDef = { value: ImageGenAction; label: string; desc: string; needIndex: boolean };

const actionGroups: { title: string; actions: ActionDef[] }[] = [
  {
    title: "全部",
    actions: [
      { value: "fill-all", label: "补全缺图", desc: "缺图才补、有则跳过", needIndex: false },
      { value: "replace-all", label: "替换全部", desc: "强制重新生成所有图", needIndex: false },
    ],
  },
  {
    title: "封面",
    actions: [
      { value: "fill-cover", label: "补封面", desc: "无封面才生成", needIndex: false },
      { value: "replace-cover", label: "替换封面", desc: "重新生成封面", needIndex: false },
    ],
  },
  {
    title: "正文",
    actions: [
      { value: "fill-inline-all", label: "补全正文图", desc: "缺的正文图才补", needIndex: false },
      { value: "replace-inline-all", label: "替换正文图", desc: "重新生成所有正文图", needIndex: false },
      { value: "fill-inline", label: "补指定正文图", desc: "指定 slot 补图", needIndex: true },
      { value: "replace-inline", label: "替换指定正文图", desc: "指定 slot 替换", needIndex: true },
    ],
  },
];

const allActions = actionGroups.flatMap(g => g.actions);

const selectedAction = ref<ImageGenAction | null>(null);
const inlineIndex = ref<number | null>(null);

// 当前选中的 action 定义
const selectedDef = computed(() => allActions.find(a => a.value === selectedAction.value));

// 需要 imageIndex 但未填
const indexMissing = computed(() => selectedDef.value?.needIndex && inlineIndex.value == null);

// ─── 缺图信息 ───

const missingInfo = ref<MissingImagesResponse | null>(null);
const missingLoading = ref(false);

async function loadMissingInfo(): Promise<void> {
  if (!props.article) return;
  missingLoading.value = true;
  try {
    missingInfo.value = await fetchMissingImages(props.article.id);
  } catch { /* 静默 */ }
  finally { missingLoading.value = false; }
}

// ─── 执行 ───

const submitting = ref(false);
const lastResult = ref<ImageGenResponse | null>(null);

async function handleSubmit(): Promise<void> {
  if (!props.article || !selectedAction.value || indexMissing.value) return;

  submitting.value = true;
  lastResult.value = null;
  try {
    const fn = selectedFlow.value === "provider" ? providerGenerateImage : codexGenerateImage;
    const result = await fn(props.article.id, selectedAction.value, inlineIndex.value ?? undefined);
    lastResult.value = result;

    if (result.success) {
      const s = result.summary;
      if (s && s.failed > 0) {
        message.warning(`完成 ${s.success} 张，失败 ${s.failed} 张，跳过 ${s.skipped} 张`);
      } else {
        message.success("生图完成");
      }
      emit("done");
    } else {
      message.error(result.error ?? "生图失败");
    }
  } catch (err: unknown) {
    const httpErr = err as { body?: { error?: string } };
    message.error(httpErr?.body?.error ?? "生图请求失败");
  } finally {
    submitting.value = false;
  }
}

// ─── 打开/关闭 ───

function handleOpen(): void {
  selectedAction.value = null;
  inlineIndex.value = null;
  lastResult.value = null;
  missingInfo.value = null;
  selectedFlow.value = "provider";
  loadMissingInfo();
}

function handleClose(): void {
  emit("update:open", false);
}

const flowOptions = [
  { value: "provider" as Flow, label: "服务商生图" },
  { value: "codex" as Flow, label: "Codex 生图" },
];
</script>

<template>
  <a-modal
    :open="open"
    :closable="true"
    :mask-closable="true"
    :destroy-on-close="true"
    width="480px"
    centered
    title="手动生图"
    @after-open-change="(v: boolean) => v && handleOpen()"
    @cancel="handleClose"
  >
    <template v-if="article" #footer>
      <a-button @click="handleClose">关闭</a-button>
      <a-button
        type="primary"
        :loading="submitting"
        :disabled="!selectedAction || indexMissing"
        @click="handleSubmit"
      >执行</a-button>
    </template>

    <div v-if="article" class="space-y-4">
      <!-- 文章信息 -->
      <div class="text-xs text-editorial-text-muted">
        文章 #{{ article.id }}
        <span v-if="article.titles" class="ml-1">{{ JSON.parse(article.titles)[0] ?? '' }}</span>
      </div>

      <!-- 缺图提示 -->
      <div v-if="missingLoading" class="text-xs text-editorial-text-muted">加载缺图信息…</div>
      <div v-else-if="missingInfo" class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs space-y-0.5">
        <div v-if="missingInfo.missingCover?.length" class="text-orange-600">封面图缺失</div>
        <div v-if="missingInfo.missingInline?.length" class="text-orange-600">
          正文图缺失：{{ missingInfo.missingInline.map(m => `#${m.imageIndex}`).join('、') }}
        </div>
        <div v-if="!missingInfo.missingCover?.length && !missingInfo.missingInline?.length" class="text-green-600">图片齐全</div>
      </div>

      <!-- 流程选择 -->
      <div>
        <div class="mb-1 text-xs font-medium text-editorial-text-muted">生图流程</div>
        <a-radio-group v-model:value="selectedFlow" size="small" :options="flowOptions" />
      </div>

      <!-- action 选择 -->
      <div>
        <div class="mb-1 text-xs font-medium text-editorial-text-muted">操作</div>
        <div class="space-y-2">
          <div v-for="group in actionGroups" :key="group.title">
            <div class="mb-1 text-[10px] text-editorial-text-muted/70">{{ group.title }}</div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="act in group.actions"
                :key="act.value"
                class="rounded border px-2 py-1 text-xs transition-colors"
                :class="selectedAction === act.value
                  ? 'border-editorial-accent bg-editorial-accent/10 text-editorial-accent font-medium'
                  : 'border-editorial-border hover:border-editorial-accent/40 text-editorial-text-body'"
                @click="selectedAction = act.value"
              >{{ act.label }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 指定正文图 slot -->
      <div v-if="selectedDef?.needIndex" class="flex items-center gap-2">
        <span class="text-xs text-editorial-text-muted">正文图 slot：</span>
        <a-input-number v-model:value="inlineIndex" :min="1" :max="20" size="small" class="!w-20" placeholder="序号" />
      </div>

      <!-- action 说明 -->
      <div v-if="selectedDef" class="rounded bg-editorial-bg-page px-3 py-1.5 text-xs text-editorial-text-muted">
        {{ selectedDef.desc }}
      </div>

      <!-- 执行结果 -->
      <template v-if="lastResult">
        <div class="border-t border-editorial-border pt-3">
          <div class="mb-1 text-xs font-medium text-editorial-text-muted">执行结果</div>
          <!-- 汇总 -->
          <div v-if="lastResult.summary" class="mb-2 flex gap-3 text-xs">
            <span class="text-green-600">成功 {{ lastResult.summary.success }}</span>
            <span class="text-yellow-600">跳过 {{ lastResult.summary.skipped }}</span>
            <span class="text-red-500">失败 {{ lastResult.summary.failed }}</span>
          </div>
          <!-- 逐条 -->
          <div v-if="lastResult.results?.length" class="space-y-1">
            <div
              v-for="(r, i) in lastResult.results"
              :key="i"
              class="flex items-center gap-2 rounded border border-editorial-border px-2 py-1 text-xs"
            >
              <span class="font-mono text-editorial-text-muted">
                {{ r.type === 'cover' ? '封面' : `正文#${r.imageIndex}` }}
              </span>
              <span
                :class="r.status === 'success' ? 'text-green-600' : r.status === 'failed' ? 'text-red-500' : 'text-yellow-600'"
              >{{ r.status === 'success' ? '成功' : r.status === 'failed' ? `失败：${r.error}` : `跳过：${r.reason}` }}</span>
            </div>
          </div>
          <!-- 整体错误 -->
          <div v-if="lastResult.error && !lastResult.results?.length" class="text-xs text-red-500">
            {{ lastResult.error }}
          </div>
        </div>
      </template>
    </div>
  </a-modal>
</template>
