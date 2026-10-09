<script setup lang="ts">
import { onMounted, ref } from "vue";
import { message } from "ant-design-vue";

import EditorialEmptyState from "../../components/content/EditorialEmptyState.vue";
import {
  editorialContentIntroSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { HttpError } from "../../services/http";
import {
  createSettingsApiAccessToken,
  readSettingsApiAccessTokens,
  readSettingsProfile,
  revokeSettingsApiAccessToken,
  updatePassword,
  type SettingsApiAccessToken,
  type SettingsApiAccessTokenCreation,
  type SettingsProfile
} from "../../services/settingsApi";

const isLoading = ref(true);
const loadError = ref<string | null>(null);
const profile = ref<SettingsProfile | null>(null);
const apiAccessTokens = ref<SettingsApiAccessToken[]>([]);
const apiAccessTokensError = ref<string | null>(null);
const apiTokenName = ref("MacBook");
const apiTokenPending = ref(false);
const apiTokenRevokingId = ref<number | null>(null);
const issuedApiToken = ref<SettingsApiAccessTokenCreation | null>(null);

// 先读账号资料，再为已登录管理员加载凭证元数据，避免公开访问模式触发凭证接口。
async function loadProfile(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;

  try {
    profile.value = await readSettingsProfile();
    if (profile.value?.loggedIn && profile.value.role === "admin") {
      await loadApiAccessTokens();
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      loadError.value = "请先登录后再查看当前用户信息。";
    } else {
      loadError.value = "当前用户信息加载失败，请稍后重试。";
    }
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void loadProfile();
});

/** 读取当前管理员的凭证清单；接口故障不影响账号资料和密码管理。 */
async function loadApiAccessTokens(): Promise<void> {
  apiAccessTokensError.value = null;
  try {
    apiAccessTokens.value = await readSettingsApiAccessTokens();
  } catch {
    apiAccessTokensError.value = "凭证列表暂时无法读取，请稍后重试。";
  }
}

/** 签发新凭证并仅在当前页面内存中展示一次，随后刷新不敏感的凭证清单。 */
async function handleApiTokenCreate(): Promise<void> {
  const name = apiTokenName.value.trim();
  if (!name || name.length > 64) {
    message.warning("请填写 1–64 个字符的凭证名称");
    return;
  }

  apiTokenPending.value = true;
  try {
    const response = await createSettingsApiAccessToken(name);
    issuedApiToken.value = response.token;
    apiTokenName.value = "";
    await loadApiAccessTokens();
  } catch {
    message.error("凭证签发失败，请稍后重试");
  } finally {
    apiTokenPending.value = false;
  }
}

/** 关闭签发结果后清除页面内存中的明文，列表仍只保留不可用前缀。 */
function dismissIssuedApiToken(): void {
  issuedApiToken.value = null;
}

/** 撤销凭证后重新读取列表，服务端立即拒绝后续使用该 token 的请求。 */
async function handleApiTokenRevoke(id: number): Promise<void> {
  apiTokenRevokingId.value = id;
  try {
    await revokeSettingsApiAccessToken(id);
    await loadApiAccessTokens();
    message.success("API 凭证已撤销");
  } catch {
    message.error("API 凭证撤销失败，请稍后重试");
  } finally {
    apiTokenRevokingId.value = null;
  }
}

// ─── 修改密码 ───

const passwordFormOpen = ref(false);
const passwordPending = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");

function openPasswordForm(): void {
  passwordFormOpen.value = true;
}

function closePasswordForm(): void {
  passwordFormOpen.value = false;
  currentPassword.value = "";
  newPassword.value = "";
  confirmPassword.value = "";
}

async function handlePasswordSubmit(): Promise<void> {
  if (!newPassword.value || newPassword.value.length < 6) {
    message.warning("新密码至少 6 位");
    return;
  }

  if (newPassword.value !== confirmPassword.value) {
    message.warning("两次输入的新密码不一致");
    return;
  }

  passwordPending.value = true;
  try {
    await updatePassword(currentPassword.value, newPassword.value);
    message.success("密码修改成功");
    closePasswordForm();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      message.error("当前密码不正确");
    } else if (error instanceof HttpError && error.status === 400) {
      message.error("请求参数有误，请检查输入");
    } else {
      message.error("密码修改失败，请稍后重试");
    }
  } finally {
    passwordPending.value = false;
  }
}
</script>

<template>
  <div :class="editorialContentPageClass" data-settings-page="profile">
    <a-skeleton v-if="isLoading" active :paragraph="{ rows: 6 }" />

    <a-result
      v-else-if="loadError"
      status="error"
      title="当前用户页加载失败"
      :sub-title="loadError"
    >
      <template #extra>
        <a-button type="primary" @click="loadProfile()">重新加载</a-button>
      </template>
    </a-result>

    <EditorialEmptyState
      v-else-if="!profile"
      title="当前没有可读取的用户信息"
      description="可以稍后刷新页面，或重新登录后再试。"
      data-profile-empty-state
    />

    <template v-else>
      <section :class="editorialContentIntroSectionClass" data-settings-intro="profile">
        <div
          class="pointer-events-none absolute right-[-56px] top-[-72px] h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(122,162,255,0.24),_transparent_72%)] blur-3xl"
          aria-hidden="true"
        />
        <div class="relative z-[1] flex flex-col gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-editorial-pill border border-editorial-border bg-editorial-panel/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-editorial-text-muted">
              Profile Board
            </span>
            <span class="text-xs leading-6 text-editorial-text-muted">用统一壳层里的同一套视觉语言展示当前账号与会话状态。</span>
          </div>
          <div class="flex flex-col gap-2">
            <h2 class="m-0 text-[28px] font-semibold tracking-[-0.04em] text-editorial-text-main">
              当前账号资料卡
            </h2>
            <p class="m-0 max-w-3xl text-sm leading-7 text-editorial-text-body">
              这页只负责确认当前会话、账号角色和联系信息，方便你判断系统菜单现在是不是以正确身份在工作。
            </p>
          </div>
        </div>
      </section>

      <section class="grid gap-3 md:grid-cols-3" data-profile-section="overview">
        <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
          <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">用户名</p>
          <p class="mt-2 mb-0 text-base font-medium text-editorial-text-main">{{ profile.username }}</p>
        </article>
        <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
          <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">角色</p>
          <p class="mt-2 mb-0 text-base font-medium text-editorial-text-main">{{ profile.role }}</p>
        </article>
        <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
          <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">会话状态</p>
          <p class="mt-2 mb-0 text-base font-medium text-editorial-text-main">
            {{ profile.loggedIn ? "已登录" : "公开访问" }}
          </p>
        </article>
      </section>

      <section
        class="editorial-spotlight-card rounded-editorial-xl border border-editorial-border-strong px-5 py-5"
        data-profile-section="summary"
      >
        <div class="flex flex-col gap-4">
          <div>
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">当前账号摘要</p>
            <h2 class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ profile.displayName }}</h2>
            <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
              {{ profile.loggedIn ? "当前会话有效，可以访问系统菜单。" : "当前处于公开访问模式。" }}
            </p>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">显示名称</p>
              <p class="mt-2 mb-0 text-sm text-editorial-text-main" data-profile-field="display-name">{{ profile.displayName }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">邮箱</p>
              <p class="mt-2 mb-0 text-sm text-editorial-text-main" data-profile-field="email">{{ profile.email || "未设置" }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">username</p>
              <p class="mt-2 mb-0 text-sm text-editorial-text-main" data-profile-field="username">{{ profile.username }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">登录状态</p>
              <p class="mt-2 mb-0 text-sm text-editorial-text-main" data-profile-field="session-status">
                {{ profile.loggedIn ? "已登录（当前会话有效）" : "未登录（公开访问模式）" }}
              </p>
            </article>
          </div>
        </div>
      </section>

      <!-- 修改密码 -->
      <section class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl" data-profile-section="password">
        <div class="flex items-center justify-between">
          <div>
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">安全设置</p>
            <p class="mt-1 mb-0 text-sm text-editorial-text-body">修改当前账号的登录密码。</p>
          </div>
          <a-button
            v-if="!passwordFormOpen"
            type="primary"
            size="small"
            @click="openPasswordForm"
          >修改密码</a-button>
        </div>

        <div v-if="passwordFormOpen" class="mt-4 flex flex-col gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-editorial-text-muted">当前密码</label>
            <a-input-password
              v-model:value="currentPassword"
              placeholder="输入当前密码"
              size="small"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-editorial-text-muted">新密码</label>
            <a-input-password
              v-model:value="newPassword"
              placeholder="至少 6 位"
              size="small"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-editorial-text-muted">确认新密码</label>
            <a-input-password
              v-model:value="confirmPassword"
              placeholder="再次输入新密码"
              size="small"
            />
          </div>
          <div class="flex gap-2">
            <a-button
              type="primary"
              size="small"
              :loading="passwordPending"
              @click="handlePasswordSubmit"
            >确认修改</a-button>
            <a-button size="small" @click="closePasswordForm">取消</a-button>
          </div>
        </div>
      </section>

      <section
        v-if="profile.loggedIn && profile.role === 'admin'"
        class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl"
        data-profile-section="api-access-tokens"
      >
        <div class="flex flex-col gap-2">
          <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">生产 API 凭证</p>
          <h2 class="m-0 text-lg font-medium text-editorial-text-main">管理员完整权限</h2>
          <p class="m-0 text-sm leading-6 text-editorial-text-body">
            凭证可调用现有受保护 API，包含读取、修改、删除、发布和触发操作。请只保存在可信设备；遗失后立即撤销。
          </p>
          <p class="m-0 text-xs leading-5 text-editorial-text-muted">
            每个凭证有效一年。明文只在签发后展示一次；到期前 30、14、7 天会发邮件提醒，不会通过邮件发送凭证。
          </p>
        </div>

        <div class="mt-4 flex flex-col gap-2 sm:flex-row">
          <a-input
            v-model:value="apiTokenName"
            :maxlength="64"
            placeholder="凭证名称，例如 MacBook"
            aria-label="API 凭证名称"
          />
          <a-button
            type="primary"
            :loading="apiTokenPending"
            data-api-token-create
            @click="handleApiTokenCreate"
          >签发一年期凭证</a-button>
        </div>

        <div
          v-if="apiAccessTokensError"
          class="mt-3 rounded-editorial-md border border-editorial-border bg-editorial-link px-3 py-2 text-sm text-editorial-text-body"
          role="alert"
        >
          {{ apiAccessTokensError }}
          <a-button type="link" size="small" @click="loadApiAccessTokens">重试</a-button>
        </div>

        <div
          v-if="issuedApiToken"
          class="mt-4 rounded-editorial-md border border-editorial-border-strong bg-editorial-link px-4 py-4"
          data-api-token-issued
        >
          <p class="m-0 font-medium text-editorial-text-main">请立即保存凭证明文，离开本页后无法再次读取。</p>
          <code class="mt-2 block select-all break-all rounded bg-editorial-panel px-3 py-2 text-sm">{{ issuedApiToken.token }}</code>
          <p class="mt-3 mb-1 text-sm text-editorial-text-body">在 macOS 终端运行下面的命令，再把凭证粘贴到系统提示中：</p>
          <code class="block select-all break-all rounded bg-editorial-panel px-3 py-2 text-xs">security add-generic-password -a "$USER" -s "hot-now-prod-api-token" -U -w</code>
          <p class="mt-3 mb-1 text-sm text-editorial-text-body">之后可从钥匙串读取凭证调用生产 API，例如：</p>
          <code class="block select-all break-all rounded bg-editorial-panel px-3 py-2 text-xs">bash scripts/hotnow-api.sh GET /api/settings/sources</code>
          <p class="mt-2 mb-0 text-xs text-editorial-text-muted">钥匙串中的 token 不会出现在命令参数或 shell 历史中；API 凭证不能签发或撤销其他凭证。</p>
          <a-button class="mt-3" size="small" @click="dismissIssuedApiToken">我已保存，隐藏凭证</a-button>
        </div>

        <div v-if="apiAccessTokens.length" class="mt-4 flex flex-col gap-2" data-api-token-list>
          <article
            v-for="token in apiAccessTokens"
            :key="token.id"
            class="flex flex-col gap-2 rounded-editorial-md border border-editorial-border bg-editorial-link px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            data-api-token-row
          >
            <div class="min-w-0">
              <p class="m-0 font-medium text-editorial-text-main">{{ token.name }} <span class="font-mono text-xs text-editorial-text-muted">{{ token.tokenPrefix }}…</span></p>
              <p class="mt-1 mb-0 break-all text-xs leading-5 text-editorial-text-muted">
                {{ token.revokedAt ? `已撤销：${token.revokedAt}` : `到期：${token.expiresAt}` }}
                <span v-if="token.lastUsedAt"> · 最近使用：{{ token.lastUsedAt }}</span>
              </p>
            </div>
            <a-popconfirm
              v-if="!token.revokedAt"
              title="撤销后该凭证将立即失效，确定继续吗？"
              ok-text="撤销"
              cancel-text="取消"
              @confirm="handleApiTokenRevoke(token.id)"
            >
              <a-button danger size="small" :loading="apiTokenRevokingId === token.id">撤销</a-button>
            </a-popconfirm>
          </article>
        </div>
        <p v-else-if="!apiAccessTokensError" class="mt-4 mb-0 text-sm text-editorial-text-muted">尚未签发 API 凭证。</p>
      </section>
    </template>
  </div>
</template>
