import type { Ref } from "vue";
import { appendShortPublishFooter } from "../shortPublishFooter.js";

import type { CreativeFinishedArticle } from "../../../services/creativeApi.js";

export type ArticleEditorContentSyncOptions = {
  article: CreativeFinishedArticle;
  editContent: Ref<string>;
  humanContent: Ref<string>;
  getLastSavedContent: () => string;
  setLastSavedContent: (value: string) => void;
  getLastSavedHuman: () => string;
  setLastSavedHuman: (value: string) => void;
  force?: boolean;
};

/**
 * 将服务端最新正文同步到详情编辑器。
 * 仅在对应栏没有未保存修改时更新；force 用于首次打开或切换文章时强制初始化。
 * 短稿发布栏补结尾段，保存快照仍记录服务端原文，让既有保存流程落盘；长文和AI草稿不变。
 * 副作用：更新编辑器 ref 与最后保存快照，不直接发送保存请求。
 */
export function syncArticleEditorContent(options: ArticleEditorContentSyncOptions): {
  draftSynced: boolean;
  humanSynced: boolean;
} {
  const serverDraft = options.article.contentMarkdown ?? "";
  const serverHuman = options.article.humanMarkdown || serverDraft;
  const draftDirty = options.editContent.value !== options.getLastSavedContent();
  const humanDirty = options.humanContent.value !== options.getLastSavedHuman();
  const draftSynced = Boolean(options.force || !draftDirty);
  const humanSynced = Boolean(options.force || !humanDirty);

  if (draftSynced) {
    options.editContent.value = serverDraft;
    options.setLastSavedContent(serverDraft);
  }
  if (humanSynced) {
    options.humanContent.value = appendShortPublishFooter(serverHuman, options.article.direction);
    options.setLastSavedHuman(serverHuman);
  }

  return { draftSynced, humanSynced };
}
