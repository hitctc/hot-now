import { randomBytes, scryptSync } from "node:crypto";
import type { SqliteDatabase } from "./openDatabase.js";
import { ensureDefaultViewRules } from "../viewRules/viewRuleRepository.js";

type AuthBootstrap = {
  username: string;
  password: string;
  email?: string;
  juyaRssUrl?: string;
};

const builtinSources = [
  {
    kind: "juya",
    name: "Juya AI Daily",
    siteUrl: "https://imjuya.github.io/juya-ai-daily/",
    rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml"
  },
  {
    kind: "openai",
    name: "OpenAI",
    siteUrl: "https://openai.com/news/",
    rssUrl: "https://openai.com/news/rss.xml"
  },
  {
    kind: "google_ai",
    name: "Google AI",
    siteUrl: "https://blog.google/technology/ai/",
    rssUrl: "https://blog.google/technology/ai/rss/"
  },
  {
    kind: "kr36",
    name: "36氪",
    siteUrl: "https://36kr.com/",
    rssUrl: "https://36kr.com/feed"
  },
  {
    kind: "kr36_newsflash",
    name: "36氪快讯",
    siteUrl: "https://36kr.com/newsflashes/catalog/2",
    rssUrl: "https://36kr.com/feed-newsflash"
  },
  {
    kind: "techcrunch_ai",
    name: "TechCrunch AI",
    siteUrl: "https://techcrunch.com/category/artificial-intelligence/",
    rssUrl: "https://techcrunch.com/category/artificial-intelligence/feed/"
  },
  {
    kind: "aifanr",
    name: "爱范儿",
    siteUrl: "https://www.ifanr.com/",
    rssUrl: "https://www.ifanr.com/feed"
  },
  {
    kind: "ithome",
    name: "IT之家",
    siteUrl: "https://www.ithome.com/",
    rssUrl: "https://www.ithome.com/rss/"
  },
  {
    kind: "zhihu_daily",
    name: "知乎每日精选",
    siteUrl: "https://www.zhihu.com/",
    rssUrl: "https://www.zhihu.com/rss"
  },
  {
    kind: "sspai",
    name: "少数派",
    siteUrl: "https://sspai.com/",
    rssUrl: "https://sspai.com/feed"
  },
  {
    kind: "chinaz",
    name: "站长之家",
    siteUrl: "https://www.chinaz.com/",
    rssUrl: "https://app.chinaz.com/?app=rss"
  },
  {
    kind: "huxiu",
    name: "虎嗅网",
    siteUrl: "https://www.huxiu.com/",
    rssUrl: "https://www.huxiu.com/rss/0.xml"
  },
  {
    kind: "dgtle",
    name: "数字尾巴",
    siteUrl: "https://www.dgtle.com/",
    rssUrl: "https://www.dgtle.com/rss/dgtle.xml"
  },
  {
    kind: "cnblogs",
    name: "Cnblogs",
    siteUrl: "https://www.cnblogs.com/",
    rssUrl: "https://feed.cnblogs.com/blog/sitehome/rss"
  },
  {
    kind: "v2ex",
    name: "V2EX",
    siteUrl: "https://www.v2ex.com/",
    rssUrl: "https://www.v2ex.com/feed/tab/tech.xml"
  },
  {
    kind: "cyzone",
    name: "创业邦",
    siteUrl: "https://www.cyzone.cn/",
    rssUrl: "https://www.cyzone.cn/rss/"
  },
  {
    kind: "geekpark",
    name: "极客公园",
    siteUrl: "https://www.geekpark.net/",
    rssUrl: "https://www.geekpark.net/rss"
  },
  {
    kind: "appinn",
    name: "小众软件",
    siteUrl: "https://www.appinn.com/",
    rssUrl: "https://feeds.appinn.com/appinns/"
  },
  {
    kind: "wikipedia",
    name: "维基百科",
    siteUrl: "https://www.wikipedia.org/",
    rssUrl: "https://feedx.net/rss/wikiindex.xml"
  },
  {
    kind: "guangming_daily",
    name: "光明日报",
    siteUrl: "https://www.gmw.cn/",
    rssUrl: "https://feedx.net/rss/guangmingribao.xml"
  },
  {
    kind: "williamlong_blog",
    name: "月光博客",
    siteUrl: "https://www.williamlong.info/",
    rssUrl: "https://www.williamlong.info/rss.xml"
  }
] as const;

export function seedInitialData(db: SqliteDatabase, authBootstrap?: AuthBootstrap): void {
  // Built-in source definitions belong to the app itself, so rerunning the seed should refresh
  // stable metadata, including canonical site and RSS URLs, when the built-in catalog changes.
  // The seed also keeps one bootstrap admin row aligned with the runtime auth values so
  // the unified-site schema is coherent before dedicated user management lands.
  ensureContentSourcesEnabledColumn(db);
  ensureContentSourcesActiveColumn(db);
  ensureContentSourcesShowAllWhenSelectedColumn(db);
  ensureContentSourcesSourceTypeColumn(db);
  ensureContentSourcesBridgeKindColumn(db);
  ensureContentSourcesBridgeConfigColumn(db);

  const insertSource = db.prepare(
    `
      INSERT INTO content_sources (
        kind,
        name,
        site_url,
        rss_url,
        source_type,
        bridge_kind,
        bridge_config_json,
        is_enabled,
        is_builtin,
        show_all_when_selected,
        updated_at
      )
      VALUES (@kind, @name, @siteUrl, @rssUrl, 'rss', NULL, NULL, 1, 1, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(kind) DO UPDATE SET
        name = excluded.name,
        site_url = excluded.site_url,
        rss_url = excluded.rss_url,
        source_type = 'rss',
        bridge_kind = NULL,
        bridge_config_json = NULL,
        is_builtin = excluded.is_builtin,
        updated_at = CURRENT_TIMESTAMP
    `
  );
  const updateJuyaRssUrl = db.prepare(
    `
      UPDATE content_sources
      SET rss_url = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE kind = 'juya'
    `
  );
  const upsertAdmin = db.prepare(
    `
      INSERT INTO user_profile (
        id,
        username,
        password_hash,
        role,
        display_name,
        email,
        preferences_json,
        updated_at
      )
      VALUES (1, @username, @passwordHash, 'admin', @displayName, @email, '{}', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        password_hash = excluded.password_hash,
        role = excluded.role,
        display_name = excluded.display_name,
        email = excluded.email,
        updated_at = CURRENT_TIMESTAMP
    `
  );

  const seed = db.transaction(() => {
    for (const source of builtinSources) {
      insertSource.run(source);
    }

    ensureDefaultViewRules(db);
    ensureDefaultActiveSource(db);

    if (authBootstrap?.juyaRssUrl) {
      // Legacy config still treats `config.source.rssUrl` as the effective juya feed, so bootstrap
      // keeps that single row aligned until dedicated source management replaces the old setting.
      updateJuyaRssUrl.run(authBootstrap.juyaRssUrl);
    }

    if (authBootstrap) {
      upsertAdmin.run({
        username: authBootstrap.username,
        passwordHash: hashPassword(authBootstrap.password),
        displayName: authBootstrap.username,
        email: authBootstrap.email?.trim() || null
      });
    }
  });

  seed();
}

function ensureContentSourcesActiveColumn(db: SqliteDatabase): void {
  // Task6 keeps baseline migration untouched, so seed performs a one-time schema patch for is_active.
  if (hasContentSourcesActiveColumn(db)) {
    return;
  }

  db.exec("ALTER TABLE content_sources ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0");
}

function ensureContentSourcesEnabledColumn(db: SqliteDatabase): void {
  // Multi-source collection needs a separate enable flag, and older local databases get it via
  // the same seed-time schema patch so existing installs keep booting.
  if (hasContentSourcesEnabledColumn(db)) {
    return;
  }

  db.exec("ALTER TABLE content_sources ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1");
}

function ensureContentSourcesShowAllWhenSelectedColumn(db: SqliteDatabase): void {
  // The content page display-mode toggle is additive only, so older local databases can pick it
  // up during seed without resetting any existing source rows or manual source settings.
  if (hasContentSourcesShowAllWhenSelectedColumn(db)) {
    return;
  }

  db.exec("ALTER TABLE content_sources ADD COLUMN show_all_when_selected INTEGER NOT NULL DEFAULT 0");
}

function ensureContentSourcesSourceTypeColumn(db: SqliteDatabase): void {
  // Source rows now carry an explicit type so built-in RSS rows and user-added bridge rows can
  // share one workbench without guessing from nullable fields.
  if (hasContentSourcesSourceTypeColumn(db)) {
    return;
  }

  db.exec("ALTER TABLE content_sources ADD COLUMN source_type TEXT NOT NULL DEFAULT 'rss'");
}

function ensureContentSourcesBridgeKindColumn(db: SqliteDatabase): void {
  // Bridge provider metadata is additive only, so older local databases can gain the field in place.
  if (hasContentSourcesBridgeKindColumn(db)) {
    return;
  }

  db.exec("ALTER TABLE content_sources ADD COLUMN bridge_kind TEXT");
}

function ensureContentSourcesBridgeConfigColumn(db: SqliteDatabase): void {
  // Raw bridge input stays in JSON so the sources page can show where a feed came from later on.
  if (hasContentSourcesBridgeConfigColumn(db)) {
    return;
  }

  db.exec("ALTER TABLE content_sources ADD COLUMN bridge_config_json TEXT");
}

function hasContentSourcesActiveColumn(db: SqliteDatabase): boolean {
  // PRAGMA introspection lets the seed stay compatible with both legacy and patched local databases.
  const columns = db
    .prepare("PRAGMA table_info(content_sources)")
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === "is_active");
}

function hasContentSourcesEnabledColumn(db: SqliteDatabase): boolean {
  // PRAGMA introspection lets the seed stay compatible with both legacy and patched local databases.
  const columns = db
    .prepare("PRAGMA table_info(content_sources)")
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === "is_enabled");
}

function hasContentSourcesShowAllWhenSelectedColumn(db: SqliteDatabase): boolean {
  // PRAGMA introspection lets the seed stay compatible with both legacy and patched local databases.
  const columns = db
    .prepare("PRAGMA table_info(content_sources)")
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === "show_all_when_selected");
}

function hasContentSourcesSourceTypeColumn(db: SqliteDatabase): boolean {
  const columns = db
    .prepare("PRAGMA table_info(content_sources)")
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === "source_type");
}

function hasContentSourcesBridgeKindColumn(db: SqliteDatabase): boolean {
  const columns = db
    .prepare("PRAGMA table_info(content_sources)")
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === "bridge_kind");
}

function hasContentSourcesBridgeConfigColumn(db: SqliteDatabase): boolean {
  const columns = db
    .prepare("PRAGMA table_info(content_sources)")
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === "bridge_config_json");
}

function ensureDefaultActiveSource(db: SqliteDatabase): void {
  // Seed only selects juya when no active source exists, so user-selected active source stays untouched.
  const activeSource = db
    .prepare(
      `
        SELECT kind
        FROM content_sources
        WHERE is_active = 1
        LIMIT 1
      `
    )
    .get() as { kind: string } | undefined;

  if (activeSource) {
    return;
  }

  db.prepare(
    `
      UPDATE content_sources
      SET is_active = CASE WHEN kind = 'juya' THEN 1 ELSE 0 END,
          updated_at = CURRENT_TIMESTAMP
    `
  ).run();
}

function hashPassword(password: string) {
  // A salted scrypt hash is enough for bootstrap data and keeps the seed from writing
  // any plain-text credentials into SQLite.
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}
