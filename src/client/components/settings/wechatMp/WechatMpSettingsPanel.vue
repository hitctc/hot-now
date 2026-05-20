<!-- 公众号配置管理面板 -->
<template>
  <div class="wechat-mp-settings">
    <div class="wechat-mp-settings__header">
      <h3>公众号配置</h3>
      <a-button type="primary" @click="openCreateModal">新增公众号</a-button>
    </div>

    <a-table
      :columns="columns"
      :data-source="accounts"
      :loading="loading"
      row-key="id"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'secret'">
          <span>****{{ record.secretLast4 }}</span>
        </template>
        <template v-if="column.key === 'isDefault'">
          <a-tag v-if="record.isDefault" color="blue">默认</a-tag>
          <a-button v-else type="link" size="small" @click="handleSetDefault(record.id)">设为默认</a-button>
        </template>
        <template v-if="column.key === 'isEnabled'">
          <a-tag :color="record.isEnabled ? 'green' : 'default'">
            {{ record.isEnabled ? '启用' : '停用' }}
          </a-tag>
        </template>
        <template v-if="column.key === 'actions'">
          <a-space>
            <a-button type="link" size="small" @click="openEditModal(record)">编辑</a-button>
            <a-button type="link" size="small" @click="handleToggleEnabled(record)">
              {{ record.isEnabled ? '停用' : '启用' }}
            </a-button>
            <a-popconfirm title="确认删除该公众号配置？" @confirm="handleDelete(record.id)">
              <a-button type="link" size="small" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <WechatMpAccountModal
      v-model:open="modalOpen"
      :editing="editingAccount"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { message } from "ant-design-vue";
import WechatMpAccountModal from "./WechatMpAccountModal.vue";
import {
  readWechatMpAccounts,
  saveWechatMpAccount,
  deleteWechatMpAccount,
  setDefaultWechatMpAccount,
  type WechatMpAccountSummary,
} from "../../../services/settingsApi.js";

const loading = ref(false);
const accounts = ref<WechatMpAccountSummary[]>([]);
const modalOpen = ref(false);
const editingAccount = ref<WechatMpAccountSummary | null>(null);

const columns = [
  { title: "名称", dataIndex: "name", key: "name", width: 120 },
  { title: "APPID", dataIndex: "appId", key: "appId", width: 160 },
  { title: "SECRET", key: "secret", width: 100 },
  { title: "默认", key: "isDefault", width: 80 },
  { title: "状态", key: "isEnabled", width: 70 },
  { title: "备注", dataIndex: "notes", key: "notes", ellipsis: true },
  { title: "操作", key: "actions", width: 180 },
];

async function loadAccounts(): Promise<void> {
  loading.value = true;
  try {
    const res = await readWechatMpAccounts();
    if (res.ok) accounts.value = res.accounts;
  } finally {
    loading.value = false;
  }
}

function openCreateModal(): void {
  editingAccount.value = null;
  modalOpen.value = true;
}

function openEditModal(account: WechatMpAccountSummary): void {
  editingAccount.value = account;
  modalOpen.value = true;
}

function onSaved(): void {
  loadAccounts();
}

async function handleSetDefault(id: number): Promise<void> {
  try {
    await setDefaultWechatMpAccount(id);
    message.success("已设为默认");
    loadAccounts();
  } catch {
    message.error("操作失败");
  }
}

async function handleToggleEnabled(account: WechatMpAccountSummary): Promise<void> {
  try {
    await saveWechatMpAccount({
      id: account.id,
      name: account.name,
      appId: account.appId,
      isEnabled: !account.isEnabled,
    });
    message.success(account.isEnabled ? "已停用" : "已启用");
    loadAccounts();
  } catch {
    message.error("操作失败");
  }
}

async function handleDelete(id: number): Promise<void> {
  try {
    await deleteWechatMpAccount(id);
    message.success("已删除");
    loadAccounts();
  } catch {
    message.error("删除失败");
  }
}

onMounted(loadAccounts);
</script>

<style scoped>
.wechat-mp-settings__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.wechat-mp-settings__header h3 {
  margin: 0;
  font-size: 16px;
}
</style>
