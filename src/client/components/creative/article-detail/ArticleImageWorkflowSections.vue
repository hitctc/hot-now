<script setup lang="ts">
import EditablePromptRow from "../EditablePromptRow.vue";
import {
  extractImageUrl,
  type ArticleImageEntry,
  type CreativeFinishedArticle,
  type LunaImageJob,
  type LunaImageTarget,
} from "../../../services/creativeApi.js";

defineProps<{
  article: CreativeFinishedArticle;
  readonly?: boolean;
  articleImages: ArticleImageEntry[];
  displayCoverImages: string[];
  activeCoverIndex: number;
  inlineImageSlotCount: number;
  totalImageSlotCount: number;
  coverPromptGenerating: boolean;
  inlinePromptsGenerating: boolean;
  inlinePromptGeneratingIndex: number | null;
  uploadingCover: boolean;
  uploadingInline: Set<number>;
  lunaImageEligible: boolean;
  lunaImageJobs: Record<string, LunaImageJob>;
}>();

const emit = defineEmits<{
  (event: "copy-prompt", value: string): void;
  (event: "prompt-dirty", key: string, dirty: boolean): void;
  (event: "generate-cover-prompt"): void;
  (event: "upload-cover", eventValue: Event): void;
  (event: "select-cover", index: number): void;
  (event: "save-cover-prompt", value: string): void;
  (event: "generate-inline-prompts", index?: number): void;
  (event: "upload-inline", index: number, eventValue: Event): void;
  (event: "save-inline-prompt", key: string, value: string): void;
  (event: "generate-luna-image", target: LunaImageTarget, imageIndex?: number): void;
}>();

/** 每个提示词只映射一个独立 Luna 任务，避免把封面和正文合并成批处理。 */
function lunaJobFor(
  jobs: Record<string, LunaImageJob>,
  target: LunaImageTarget,
  imageIndex?: number,
): LunaImageJob | undefined {
  return jobs[target === "cover" ? "cover" : `inline-${imageIndex}`];
}

/** 只有排队/运行时禁用按钮，失败和成功都允许重新点击。 */
function lunaJobBusy(job: LunaImageJob | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

/** 根据终态显示可执行动作，保持失败任务可以从原提示词重试。 */
function lunaJobLabel(job: LunaImageJob | undefined): string {
  if (job?.status === "queued" || job?.status === "running") return "Luna 生成中...";
  if (job?.status === "failed") return "重试 Luna 生图";
  return job?.status === "succeeded" ? "再次用 Luna 生图" : "使用 Luna 生图";
}

/** 读取长文正文或短内容配图的对应提示词，保持上传序号与任务序号一致。 */
function inlinePromptFor(article: CreativeFinishedArticle, index: number): string {
  if (article.direction === "short_content") {
    const prompt = article.imagePrompts?.[index - 1];
    return typeof prompt === "string" ? prompt.trim() : "";
  }
  const prompt = article.inlineImagePrompts?.[String(index)];
  return typeof prompt === "string" ? prompt.trim() : "";
}

/** 任务存在时才显示状态，空闲状态不占用上传控件区域。 */
function lunaJobStatusLabel(job: LunaImageJob | undefined): string {
  if (!job) return "";
  if (job.status === "queued") return "排队中";
  if (job.status === "running") return "生成中";
  if (job.status === "succeeded") return "已完成";
  if (job.status === "skipped") return "已跳过";
  return "失败";
}

/** 用颜色区分独立任务状态，但不改变旧上传和提示词控件的视觉层级。 */
function lunaJobStatusClass(job: LunaImageJob | undefined): string {
  if (!job) return "";
  if (job.status === "succeeded") return "text-green-600";
  if (job.status === "failed") return "text-red-500";
  if (job.status === "queued" || job.status === "running") return "text-editorial-link-active";
  return "text-editorial-text-muted";
}
</script>

<template>
  <section>
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">封面图</h3>
      <div v-if="!readonly" class="flex flex-wrap items-center gap-3">
        <a-button
          type="link"
          size="small"
          class="!h-auto !px-2 !py-1 !text-[11px]"
          :loading="coverPromptGenerating"
          :disabled="coverPromptGenerating"
          @click="emit('generate-cover-prompt')"
        >{{ coverPromptGenerating ? '生成中...' : '生成封面提示词' }}</a-button>
        <label class="cursor-pointer text-[11px] text-editorial-link-active hover:underline">
          <span v-if="uploadingCover">上传中...</span>
          <span v-else>上传封面图</span>
          <input type="file" accept="image/*" class="hidden" @change="emit('upload-cover', $event)" />
        </label>
        <span
          v-if="lunaImageEligible && article.coverImagePrompt?.trim()"
          class="inline-flex items-center gap-1.5"
          data-testid="luna-cover-image-action"
        >
          <a-button
            type="link"
            size="small"
            class="!h-auto !px-2 !py-1 !text-[11px]"
            :loading="lunaJobBusy(lunaJobFor(lunaImageJobs, 'cover'))"
            :disabled="lunaJobBusy(lunaJobFor(lunaImageJobs, 'cover'))"
            data-testid="luna-cover-image-button"
            @click="emit('generate-luna-image', 'cover')"
          >{{ lunaJobLabel(lunaJobFor(lunaImageJobs, 'cover')) }}</a-button>
          <span
            v-if="lunaJobFor(lunaImageJobs, 'cover')"
            :class="['text-[11px]', lunaJobStatusClass(lunaJobFor(lunaImageJobs, 'cover'))]"
          >{{ lunaJobStatusLabel(lunaJobFor(lunaImageJobs, 'cover')) }}</span>
        </span>
      </div>
    </div>
    <template v-if="displayCoverImages.length > 0">
      <a-image-preview-group>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <template v-for="(url, index) in displayCoverImages" :key="index">
            <div
              v-if="url"
              class="relative overflow-hidden rounded-editorial-md border transition-all"
              :class="index === activeCoverIndex
                ? 'border-editorial-accent ring-2 ring-editorial-ring'
                : 'border-editorial-border opacity-60 hover:opacity-100 hover:border-editorial-link-active/40'"
            >
              <a-image :src="url" :alt="`封面图 ${index + 1}`" class="block w-full object-cover" loading="lazy" />
              <div
                v-if="index === activeCoverIndex"
                class="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-editorial-accent px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
              ><span class="inline-block h-3 w-3 leading-none text-center">✓</span> 发布封面</div>
              <div v-if="index === 0 && index !== activeCoverIndex" class="absolute left-1 top-1 rounded bg-black/40 px-1 py-0.5 text-[10px] text-white">最新</div>
              <button
                v-if="!readonly && index !== activeCoverIndex"
                class="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-black/80"
                @click.stop="emit('select-cover', index)"
              >设为发布封面</button>
            </div>
          </template>
        </div>
      </a-image-preview-group>
    </template>
    <div v-else class="flex items-center justify-center rounded-editorial-md border border-dashed border-editorial-border bg-editorial-bg-page px-4 py-6 text-xs text-editorial-text-muted">
      暂无封面图，请先在外部生图后上传
    </div>
    <EditablePromptRow
      class="mt-1.5"
      label="封面 Prompt"
      :value="article.coverImagePrompt ?? ''"
      :readonly="readonly"
      :regenerating="coverPromptGenerating"
      @copy="emit('copy-prompt', $event)"
      @save="emit('save-cover-prompt', $event)"
      @regenerate="emit('generate-cover-prompt')"
      @dirty-change="emit('prompt-dirty', 'cover', $event)"
    />
  </section>

  <section v-if="!readonly || articleImages.length > 0 || inlineImageSlotCount > 0 || Object.keys(article.inlineImagePrompts ?? {}).length > 0 || (article.imagePrompts?.length ?? 0) > 0">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">正文配图</h3>
      <div v-if="!readonly" class="flex flex-wrap items-center gap-1">
        <a-button
          type="link"
          size="small"
          class="!h-auto !px-2 !py-1 !text-[11px]"
          :loading="inlinePromptsGenerating"
          :disabled="inlinePromptsGenerating"
          @click="emit('generate-inline-prompts')"
        >{{ inlinePromptsGenerating ? '生成中...' : '生成正文配图提示词' }}</a-button>
        <template v-for="index in totalImageSlotCount" :key="index">
          <span class="inline-flex items-center gap-1.5">
            <label class="cursor-pointer text-[11px] text-editorial-link-active hover:underline">
              <span v-if="uploadingInline.has(index)">上传中...</span>
              <span v-else>上传配图{{ index }}</span>
              <input type="file" accept="image/*" class="hidden" @change="emit('upload-inline', index, $event)" />
            </label>
            <template v-if="lunaImageEligible && inlinePromptFor(article, index)">
              <a-button
                type="link"
                size="small"
                class="!h-auto !px-2 !py-1 !text-[11px]"
                :loading="lunaJobBusy(lunaJobFor(lunaImageJobs, 'inline', index))"
                :disabled="lunaJobBusy(lunaJobFor(lunaImageJobs, 'inline', index))"
                :data-testid="`luna-inline-image-button-${index}`"
                @click="emit('generate-luna-image', 'inline', index)"
              >{{ lunaJobLabel(lunaJobFor(lunaImageJobs, 'inline', index)) }}</a-button>
              <span
                v-if="lunaJobFor(lunaImageJobs, 'inline', index)"
                :class="['text-[11px]', lunaJobStatusClass(lunaJobFor(lunaImageJobs, 'inline', index))]"
              >{{ lunaJobStatusLabel(lunaJobFor(lunaImageJobs, 'inline', index)) }}</span>
            </template>
            <span v-if="index < totalImageSlotCount" class="text-editorial-text-muted/40">|</span>
          </span>
        </template>
      </div>
    </div>
    <template v-if="articleImages.length > 0">
      <a-image-preview-group>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div
            v-for="(image, index) in articleImages"
            :key="index"
            class="relative overflow-hidden rounded-editorial-md border border-editorial-border"
          >
            <a-image
              :src="extractImageUrl(image)"
              :alt="typeof image === 'object' && image.alt ? image.alt : `配图 ${index + 1}`"
              class="block w-full object-cover"
              loading="lazy"
            />
            <div v-if="typeof image === 'object' && image.purpose" class="absolute right-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
              {{ image.purpose }}
            </div>
          </div>
        </div>
      </a-image-preview-group>
    </template>
    <div v-else class="flex items-center justify-center rounded-editorial-md border border-dashed border-editorial-border bg-editorial-bg-page px-4 py-6 text-xs text-editorial-text-muted">
      正文含 {{ inlineImageSlotCount }} 张配图占位符未生成，点击上方按钮逐张补图
    </div>
    <template v-if="article.inlineImagePrompts && Object.keys(article.inlineImagePrompts).length > 0">
      <div class="mt-1.5 space-y-1">
        <div
          v-for="(prompt, index) in article.inlineImagePrompts"
          :key="index"
        >
          <EditablePromptRow
            :label="`配图${index} Prompt`"
            :value="String(prompt)"
            :readonly="readonly"
            :regenerating="inlinePromptGeneratingIndex === Number(index)"
            @copy="emit('copy-prompt', $event)"
            @save="emit('save-inline-prompt', String(index), $event)"
            @regenerate="emit('generate-inline-prompts', Number(index))"
            @dirty-change="emit('prompt-dirty', `inline-${index}`, $event)"
          />
        </div>
      </div>
    </template>
  </section>
</template>
