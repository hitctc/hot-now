import { ref, onMounted } from "vue";
import { message } from "ant-design-vue";
import { readWechatMpAccounts, saveWechatMpAccount, deleteWechatMpAccount, setDefaultWechatMpAccount, type WechatMpAccountSummary } from "../../../services/settingsApi.js";



/** 管理公众号账号列表、启停和默认账号操作；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useWechatMpSettingsPanel() {


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
  /** 读取公众号账号列表并更新加载状态，不回显凭据字段。 */
  async function loadAccounts(): Promise<void> {
    loading.value = true;
    try {
      const res = await readWechatMpAccounts();
      if (res.ok) accounts.value = res.accounts;
    } finally {
      loading.value = false;
    }
  }
  /** 打开新增账号表单并清理当前编辑对象，不提交账号。 */
  function openCreateModal(): void {
    editingAccount.value = null;
    modalOpen.value = true;
  }
  /** 以选定账号打开编辑表单，不改变服务端配置。 */
  function openEditModal(account: WechatMpAccountSummary): void {
    editingAccount.value = account;
    modalOpen.value = true;
  }
  /** 收到账号保存事件后关闭表单并刷新列表。 */
  function onSaved(): void {
    loadAccounts();
  }
  /** 将选定账号设为默认并刷新列表，失败保留原错误提示。 */
  async function handleSetDefault(id: number): Promise<void> {
    try {
      await setDefaultWechatMpAccount(id);
      message.success("已设为默认");
      loadAccounts();
    } catch {
      message.error("操作失败");
    }
  }
  /** 提交选定账号的启停状态并刷新展示，不修改其他账号。 */
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
  /** 按原确认流程删除当前记录并刷新视图，失败沿用原错误提示。 */
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

  return {
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
  };
}
