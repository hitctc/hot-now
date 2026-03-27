import { randomBytes, scryptSync } from "node:crypto";
import type { SqliteDatabase } from "./openDatabase.js";

type AuthBootstrap = {
  username: string;
  password: string;
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
    kind: "techcrunch_ai",
    name: "TechCrunch AI",
    siteUrl: "https://techcrunch.com/category/artificial-intelligence/",
    rssUrl: "https://techcrunch.com/category/artificial-intelligence/feed/"
  }
] as const;

export function seedInitialData(db: SqliteDatabase, authBootstrap?: AuthBootstrap): void {
  // Built-in source definitions belong to the app itself, so rerunning the seed should refresh
  // their metadata instead of forcing operators to clean duplicates by hand.
  // The seed also keeps one bootstrap admin row aligned with the runtime auth values so
  // the unified-site schema is coherent before dedicated user management lands.
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
  const upsertAdmin = db.prepare(
    `
      INSERT INTO user_profile (
        id,
        username,
        password_hash,
        role,
        display_name,
        preferences_json,
        updated_at
      )
      VALUES (1, @username, @passwordHash, 'admin', @displayName, '{}', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        password_hash = excluded.password_hash,
        role = excluded.role,
        display_name = excluded.display_name,
        updated_at = CURRENT_TIMESTAMP
    `
  );

  const seed = db.transaction(() => {
    for (const source of builtinSources) {
      insertSource.run(source);
    }

    if (authBootstrap) {
      upsertAdmin.run({
        username: authBootstrap.username,
        passwordHash: hashPassword(authBootstrap.password),
        displayName: authBootstrap.username
      });
    }
  });

  seed();
}

function hashPassword(password: string) {
  // A salted scrypt hash is enough for bootstrap data and keeps the seed from writing
  // any plain-text credentials into SQLite.
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}
