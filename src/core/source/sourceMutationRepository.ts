import type { SqliteDatabase } from "../db/openDatabase.js";
import { registerWechatBridgeSource } from "../wechat/registerWechatBridgeSource.js";
import type { WechatBridgeRuntimeConfig } from "../wechat/wechatBridgeTypes.js";

type BridgeFetch = typeof fetch;

export type SaveSourceInput =
  | {
      mode: "create" | "update";
      sourceType: "rss";
      kind: string;
      name: string;
      siteUrl: string;
      rssUrl: string;
      isEnabled?: boolean;
      showAllWhenSelected?: boolean;
    }
  | {
      mode: "create" | "update";
      sourceType: "wechat_bridge";
      kind: string;
      name: string;
      siteUrl: string;
      bridgeKind: "wechat2rss";
      inputMode: "feed_url";
      feedUrl: string;
      isEnabled?: boolean;
      showAllWhenSelected?: boolean;
    }
  | {
      mode: "create" | "update";
      sourceType: "wechat_bridge";
      kind: string;
      name: string;
      siteUrl: string;
      bridgeKind: "wechat2rss";
      inputMode: "article_url";
      articleUrl: string;
      isEnabled?: boolean;
      showAllWhenSelected?: boolean;
    };

export type SaveSourceResult =
  | { ok: true; kind: string }
  | { ok: false; reason: "not-found" | "already-exists" | "built-in" | "wechat-bridge-disabled" | "bridge-registration-failed" | "invalid-input" };

export type DeleteSourceResult =
  | { ok: true; kind: string }
  | { ok: false; reason: "not-found" | "built-in" | "in-use" };

export type ToggleSourceResult = { ok: true } | { ok: false; reason: "not-found" };
export type UpdateSourceDisplayModeResult = { ok: true } | { ok: false; reason: "not-found" };

type SourceRow = {
  id: number;
  kind: string;
  is_builtin: number;
  is_enabled: number;
  show_all_when_selected: number;
};

type PersistedSourceFields = {
  kind: string;
  name: string;
  siteUrl: string;
  rssUrl: string;
  sourceType: "rss" | "wechat_bridge";
  bridgeKind: string | null;
  bridgeConfigJson: string | null;
  isEnabled?: boolean;
  showAllWhenSelected?: boolean;
};

// Save centralizes custom source persistence so the rest of the app can treat create and update
// as one validated operation, including bridge registration when needed.
export async function saveSource(
  db: SqliteDatabase,
  input: SaveSourceInput,
  deps: {
    wechatBridge: WechatBridgeRuntimeConfig | null;
    fetch?: BridgeFetch;
  }
): Promise<SaveSourceResult> {
  try {
    const normalized = await normalizePersistedSourceFields(input, deps);

    return db.transaction((fields: PersistedSourceFields): SaveSourceResult => {
      const existing = readSourceRowByKind(db, fields.kind);

      if (input.mode === "create") {
        if (existing) {
          return { ok: false, reason: "already-exists" };
        }

        db.prepare(
          `
            INSERT INTO content_sources (
              kind,
              name,
              site_url,
              rss_url,
              is_enabled,
              is_builtin,
              show_all_when_selected,
              source_type,
              bridge_kind,
              bridge_config_json,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `
        ).run(
          fields.kind,
          fields.name,
          fields.siteUrl,
          fields.rssUrl,
          (fields.isEnabled ?? true) ? 1 : 0,
          (fields.showAllWhenSelected ?? false) ? 1 : 0,
          fields.sourceType,
          fields.bridgeKind,
          fields.bridgeConfigJson
        );

        return { ok: true, kind: fields.kind };
      }

      if (!existing) {
        return { ok: false, reason: "not-found" };
      }

      if (existing.is_builtin === 1) {
        return { ok: false, reason: "built-in" };
      }

      const nextEnabled = fields.isEnabled ?? existing.is_enabled === 1;
      const nextShowAllWhenSelected =
        fields.showAllWhenSelected ?? existing.show_all_when_selected === 1;

      db.prepare(
        `
          UPDATE content_sources
          SET name = ?,
              site_url = ?,
              rss_url = ?,
              is_enabled = ?,
              show_all_when_selected = ?,
              source_type = ?,
              bridge_kind = ?,
              bridge_config_json = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE kind = ?
        `
      ).run(
        fields.name,
        fields.siteUrl,
        fields.rssUrl,
        nextEnabled ? 1 : 0,
        nextShowAllWhenSelected ? 1 : 0,
        fields.sourceType,
        fields.bridgeKind,
        fields.bridgeConfigJson,
        fields.kind
      );

      return { ok: true, kind: fields.kind };
    })(normalized);
  } catch (error) {
    if (error instanceof Error && error.message === "wechat-bridge-disabled") {
      return { ok: false, reason: "wechat-bridge-disabled" };
    }

    if (error instanceof Error && error.message === "invalid-input") {
      return { ok: false, reason: "invalid-input" };
    }

    return { ok: false, reason: "bridge-registration-failed" };
  }
}

// Delete protects built-ins and already-collected sources so operators do not accidentally lose
// seeded publishers or historical content rows while cleaning up custom sources.
export function deleteSource(db: SqliteDatabase, kind: string): DeleteSourceResult {
  return db.transaction((normalizedKind: string): DeleteSourceResult => {
    const source = readSourceRowByKind(db, normalizedKind);

    if (!source) {
      return { ok: false, reason: "not-found" };
    }

    if (source.is_builtin === 1) {
      return { ok: false, reason: "built-in" };
    }

    const contentCount = db
      .prepare("SELECT COUNT(*) AS count FROM content_items WHERE source_id = ?")
      .get(source.id) as { count: number };

    if (contentCount.count > 0) {
      return { ok: false, reason: "in-use" };
    }

    db.prepare("DELETE FROM content_sources WHERE id = ?").run(source.id);
    return { ok: true, kind: normalizedKind };
  })(normalizeSourceKind(kind));
}

// Toggle writes only the enabled bit so source workbench actions stay separate from source edit flows.
export function toggleSource(db: SqliteDatabase, kind: string, enable: boolean): ToggleSourceResult {
  return db.transaction((normalizedKind: string, nextEnabled: boolean): ToggleSourceResult => {
    const source = readSourceRowByKind(db, normalizedKind);

    if (!source) {
      return { ok: false, reason: "not-found" };
    }

    db.prepare(
      `
        UPDATE content_sources
        SET is_enabled = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE kind = ?
      `
    ).run(nextEnabled ? 1 : 0, normalizedKind);

    return { ok: true };
  })(normalizeSourceKind(kind), enable);
}

// Display mode toggles remain independent from source edits so operators can change browse behavior
// without reopening the edit form.
export function updateSourceDisplayMode(
  db: SqliteDatabase,
  kind: string,
  showAllWhenSelected: boolean
): UpdateSourceDisplayModeResult {
  return db.transaction((normalizedKind: string, nextMode: boolean): UpdateSourceDisplayModeResult => {
    const source = readSourceRowByKind(db, normalizedKind);

    if (!source) {
      return { ok: false, reason: "not-found" };
    }

    db.prepare(
      `
        UPDATE content_sources
        SET show_all_when_selected = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE kind = ?
      `
    ).run(nextMode ? 1 : 0, normalizedKind);

    return { ok: true };
  })(normalizeSourceKind(kind), showAllWhenSelected);
}

async function normalizePersistedSourceFields(
  input: SaveSourceInput,
  deps: {
    wechatBridge: WechatBridgeRuntimeConfig | null;
    fetch?: BridgeFetch;
  }
): Promise<PersistedSourceFields> {
  const kind = normalizeSourceKind(input.kind);
  const name = normalizeRequiredText(input.name);
  const siteUrl = normalizeHttpUrl(input.siteUrl);

  if (input.sourceType === "rss") {
    return {
      kind,
      name,
      siteUrl,
      rssUrl: normalizeHttpUrl(input.rssUrl),
      sourceType: "rss",
      bridgeKind: null,
      bridgeConfigJson: null,
      isEnabled: input.isEnabled,
      showAllWhenSelected: input.showAllWhenSelected
    };
  }

  const registered = await registerWechatBridgeSource(input, deps);

  return {
    kind,
    name,
    siteUrl,
    rssUrl: registered.rssUrl,
    sourceType: "wechat_bridge",
    bridgeKind: input.bridgeKind,
    bridgeConfigJson: registered.bridgeConfigJson,
    isEnabled: input.isEnabled,
    showAllWhenSelected: input.showAllWhenSelected
  };
}

function readSourceRowByKind(db: SqliteDatabase, kind: string): SourceRow | undefined {
  return db
    .prepare(
      `
        SELECT id, kind, is_builtin
             , is_enabled
             , show_all_when_selected
        FROM content_sources
        WHERE kind = ?
        LIMIT 1
      `
    )
    .get(kind) as SourceRow | undefined;
}

function normalizeSourceKind(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!normalized || !/^[a-z0-9_-]+$/.test(normalized)) {
    throw new Error("invalid-input");
  }

  return normalized;
}

function normalizeRequiredText(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("invalid-input");
  }

  return normalized;
}

function normalizeHttpUrl(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("invalid-input");
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("invalid-input");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid-input");
  }

  return url.toString();
}
