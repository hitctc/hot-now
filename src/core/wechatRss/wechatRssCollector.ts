import Parser from "rss-parser";
import type { SqliteDatabase } from "../db/openDatabase.js";
import type { LoadedSourceIssues, SourceLoadFailure } from "../source/loadEnabledSourceIssues.js";
import { parseArticleFeed } from "../source/parseArticleFeed.js";
import type { CandidateItem, LoadedIssue, SourceKind } from "../source/types.js";
import {
  listWechatRssSources,
  markWechatRssSourceFetchResult,
  type WechatRssSourceRecord
} from "./wechatRssSourceRepository.js";

export const wechatRssSourceKind = "wechat_rss" as SourceKind;

export type WechatRssFetch = typeof fetch;

export type CollectWechatRssIssuesOptions = {
  fetch?: WechatRssFetch;
  now?: Date;
};

type WechatRssCandidateItem = CandidateItem & {
  metadataJson?: string;
};

const parser = new Parser();

// 公众号 RSS 使用独立配置表，但仍产出共享 issue 结构，方便复用内容入库和排序链路。
export async function collectWechatRssIssues(
  db: SqliteDatabase,
  options: CollectWechatRssIssuesOptions = {}
): Promise<LoadedSourceIssues> {
  const enabledSources = listWechatRssSources(db).filter((source) => source.isEnabled);
  const failures: SourceLoadFailure[] = [];

  if (enabledSources.length === 0) {
    return Object.assign([], { failures });
  }

  const fetchedAt = (options.now ?? new Date()).toISOString();
  const fetcher = options.fetch ?? fetch;
  const issues: LoadedIssue[] = [];

  for (const source of enabledSources) {
    try {
      const issue = await collectSingleWechatRssIssue(source, fetcher);
      markWechatRssSourceFetchResult(db, {
        id: source.id,
        success: true,
        fetchedAt,
        displayName: readIssueDisplayName(issue, source),
        message:
          issue.items.length > 0
            ? `本次 RSS 抓取成功，获得 ${issue.items.length} 条候选内容。`
            : "本次 RSS 抓取成功，但没有获得可入库候选内容。"
      });
      issues.push(issue);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      failures.push({
        kind: wechatRssSourceKind,
        reason: `${source.rssUrl}: ${reason}`
      });
      markWechatRssSourceFetchResult(db, {
        id: source.id,
        success: false,
        fetchedAt,
        error: reason
      });
    }
  }

  return Object.assign(issues, { failures });
}

async function collectSingleWechatRssIssue(
  source: WechatRssSourceRecord,
  fetcher: WechatRssFetch
): Promise<LoadedIssue> {
  const response = await fetcher(source.rssUrl);

  if (response.status !== 200) {
    throw new Error(`RSS request failed with ${response.status}`);
  }

  const feedXml = await response.text();
  const metadata = await readFeedMetadata(feedXml);
  const sourceName = metadata.title ?? source.displayName ?? `微信公众号 RSS #${source.id}`;
  const issue = await parseArticleFeed(feedXml, {
    kind: wechatRssSourceKind,
    name: sourceName,
    category: "公众号文章",
    sourceType: "media",
    sourcePriority: 76
  });

  return {
    ...issue,
    issueUrl: metadata.link ?? issue.issueUrl,
    items: issue.items.map((item) => mapWechatRssCandidateItem(source, sourceName, item))
  };
}

function mapWechatRssCandidateItem(
  source: WechatRssSourceRecord,
  sourceName: string,
  item: CandidateItem
): WechatRssCandidateItem {
  return {
    ...item,
    sourceName,
    externalId: `wechat-rss:${source.id}:${item.externalId}`,
    metadataJson: JSON.stringify({
      collector: {
        kind: "wechat_rss",
        sourceId: source.id,
        rssUrl: source.rssUrl,
        displayName: sourceName
      }
    })
  };
}

async function readFeedMetadata(feedXml: string): Promise<{ title: string | null; link: string | null }> {
  try {
    const feed = await parser.parseString(feedXml);
    return {
      title: feed.title?.trim() || null,
      link: feed.link?.trim() || null
    };
  } catch {
    return {
      title: null,
      link: null
    };
  }
}

function readIssueDisplayName(issue: LoadedIssue, source: WechatRssSourceRecord): string {
  const firstItemSourceName = issue.items[0]?.sourceName?.trim();
  return firstItemSourceName || source.displayName || `微信公众号 RSS #${source.id}`;
}
