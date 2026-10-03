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
import WechatMpAccountModal from "./WechatMpAccountModal.vue";
import { useWechatMpSettingsPanel } from "./useWechatMpSettingsPanel.js";
const {
  loading,
  accounts,
  modalOpen,
  editingAccount,
  columns,
  openCreateModal,
  openEditModal,
  onSaved,
  handleSetDefault,
  handleToggleEnabled,
  handleDelete,
} = useWechatMpSettingsPanel();

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
