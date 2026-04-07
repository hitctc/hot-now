import { isBuiltinSourceKind, resolveBuiltinSourceDefinition } from "./sourceCatalog.js";
import type { SourceDefinition, SourceKind } from "./types.js";

type RuntimeSourceInput = {
  kind: SourceKind;
  name: string;
  source_type: string | null;
};

// Runtime metadata keeps user-defined feeds compatible with the existing pipeline without
// requiring every new source row to also extend the hard-coded built-in catalog.
export function toRuntimeArticleSourceDefinition(
  source: RuntimeSourceInput
): Pick<SourceDefinition, "kind" | "name" | "category" | "sourceType" | "sourcePriority"> {
  if (isBuiltinSourceKind(source.kind)) {
    const builtinSource = resolveBuiltinSourceDefinition(source.kind);

    return {
      kind: builtinSource.kind,
      name: builtinSource.name,
      category: builtinSource.category,
      sourceType: builtinSource.sourceType,
      sourcePriority: builtinSource.sourcePriority
    };
  }

  if (source.source_type === "wechat_bridge") {
    return {
      kind: source.kind,
      name: source.name,
      category: "公众号文章",
      sourceType: "media",
      sourcePriority: 76
    };
  }

  return {
    kind: source.kind,
    name: source.name,
    category: "外部来源",
    sourceType: "aggregator",
    sourcePriority: 60
  };
}

// Sorting should remain deterministic even for custom rows, so source priority falls back to
// the same runtime metadata that powers the generic RSS parsing path.
export function resolveRuntimeSourcePriority(source: RuntimeSourceInput): number {
  return toRuntimeArticleSourceDefinition(source).sourcePriority;
}
