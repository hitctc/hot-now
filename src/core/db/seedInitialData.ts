import type { SqliteDatabase } from "./openDatabase.js";

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
    kind: "techcrunch_ai",
    name: "TechCrunch AI",
    siteUrl: "https://techcrunch.com/category/artificial-intelligence/",
    rssUrl: "https://techcrunch.com/category/artificial-intelligence/feed/"
  }
] as const;

export function seedInitialData(db: SqliteDatabase): void {
  // Built-in source definitions belong to the app itself, so rerunning the seed should refresh
  // their metadata instead of forcing operators to clean duplicates by hand.
  // The seed only installs built-in content sources, so reruns should quietly refresh
  // metadata instead of creating duplicate rows.
  const insertSource = db.prepare(
    `
      INSERT INTO content_sources (kind, name, site_url, rss_url, is_builtin, updated_at)
      VALUES (@kind, @name, @siteUrl, @rssUrl, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(kind) DO UPDATE SET
        name = excluded.name,
        site_url = excluded.site_url,
        rss_url = excluded.rss_url,
        is_builtin = excluded.is_builtin,
        updated_at = CURRENT_TIMESTAMP
    `
  );

  const seed = db.transaction(() => {
    for (const source of builtinSources) {
      insertSource.run(source);
    }
  });

  seed();
}
