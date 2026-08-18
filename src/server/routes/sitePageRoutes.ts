import path from "node:path";
import { normalizeClientDevOrigin, readSiteCss, readSiteJs } from "./sitePageAssetHelpers.js";
import {
  type SitePageDeps,
  type SitePageRouteOptions,
  type SitePageRouteContext,
} from "./sitePageRouteShared.js";
import { registerSiteAuthRoutes } from "./siteAuthRoutes.js";
import { registerSiteLegacyRoutes } from "./siteLegacyRoutes.js";
import { registerSitePublicRoutes } from "./sitePublicRoutes.js";

export type { SitePageRouteOptions } from "./sitePageRouteShared.js";
export { readSettingsAiTimelineAdminApiData } from "./sitePageContentHelpers.js";

/** 组装站点公共、认证和 legacy 三个稳定路由域。 */
export function registerSitePageRoutes(app: import("fastify").FastifyInstance, options: SitePageRouteOptions): void {
  const deps: SitePageDeps = options;
  const authConfig = options.auth;
  const authEnabled = authConfig?.requireLogin === true;
  const db = deps.db;
  const hasUnifiedShellDeps = Boolean(
    deps.listContentView || deps.getViewRulesWorkbenchData || deps.listSources || deps.getCurrentUserProfile
  );
  const siteCss = readSiteCss();
  const siteJs = readSiteJs();
  const clientBuildRoot = deps.clientBuildRoot ?? path.resolve(process.cwd(), "dist/client");
  const clientIndexPath = path.join(clientBuildRoot, "index.html");
  const clientDevOrigin = normalizeClientDevOrigin(deps.clientDevOrigin ?? null);
  const context: SitePageRouteContext = {
    app,
    options,
    deps,
    authConfig,
    authEnabled,
    db,
    hasUnifiedShellDeps,
    siteCss,
    siteJs,
    clientBuildRoot,
    clientIndexPath,
    clientDevOrigin,
  };

  registerSitePublicRoutes(context);
  registerSiteAuthRoutes(context);
  registerSiteLegacyRoutes(context);
}
