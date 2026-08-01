/** 从 Markdown 中读取第一个一级标题；没有标题时返回空字符串。 */
export function readFirstH1(markdown: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

/** 只替换第一个一级标题；原文没有一级标题时在开头插入，避免误改正文中的同名文本。 */
export function replaceFirstH1(markdown: string, title: string): string {
  return /^# .+/m.test(markdown)
    ? markdown.replace(/^# .+/m, `# ${title}`)
    : `# ${title}\n\n${markdown}`;
}

export type ArticleTitleSyncInput = {
  isManualArticle: boolean;
  titles: string[];
  activeTitleIndex: number;
  humanMarkdown: string;
  contentMarkdown: string;
};

export type ArticleTitleSyncResult = {
  fields: Record<string, unknown>;
  humanMarkdown: string;
  title: string;
  titles: string[];
  contentMarkdown?: string;
};

/**
 * 以中栏发布内容为标题真源生成保存字段。
 * 手动稿只同步唯一标题；管线稿同步当前选中的发布标题，并让左栏草稿的 H1 跟随。
 */
export function buildArticleTitleSync(input: ArticleTitleSyncInput): ArticleTitleSyncResult {
  const titles = [...input.titles];
  const index = input.isManualArticle ? 0 : input.activeTitleIndex;
  let title = readFirstH1(input.humanMarkdown);
  if (!title) title = titles[index] ?? titles[0] ?? "";
  const humanMarkdown = title ? replaceFirstH1(input.humanMarkdown, title) : input.humanMarkdown;

  if (title) {
    while (titles.length <= index) titles.push("");
    titles[index] = title;
  }

  const contentMarkdown = !input.isManualArticle && title
    ? replaceFirstH1(input.contentMarkdown, title)
    : undefined;

  return {
    fields: {
      humanMarkdown,
      ...(title ? { titles } : {}),
      ...(contentMarkdown !== undefined ? { contentMarkdown } : {}),
    },
    humanMarkdown,
    title,
    titles,
    contentMarkdown,
  };
}
