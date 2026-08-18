import type { FastifyInstance } from "fastify";

import {
  type CreativeFinishedArticleRouteContext,
  type CreativeFinishedArticleRouteOptions,
} from "./creativeFinishedArticleRouteShared.js";
import { registerCreativeFinishedArticleCrudRoutes } from "./creativeFinishedArticleCrudRoutes.js";
import { registerCreativeFinishedArticleGenerationRoutes } from "./creativeFinishedArticleGenerationRoutes.js";
import { registerCreativeFinishedArticleImageRoutes } from "./creativeFinishedArticleImageRoutes.js";
import { registerCreativeFinishedArticlePublishRoutes } from "./creativeFinishedArticlePublishRoutes.js";

export type { CreativeFinishedArticleRouteOptions } from "./creativeFinishedArticleRouteShared.js";

/** 组装成品文章各稳定职责域；路由 URL 与注册所需依赖保持集中可查。 */
export function registerCreativeFinishedArticleRoutes(
  app: FastifyInstance,
  options: CreativeFinishedArticleRouteOptions
): void {
  const context: CreativeFinishedArticleRouteContext = {
    app,
    options,
    db: options.db,
  };

  registerCreativeFinishedArticleCrudRoutes(context);
  registerCreativeFinishedArticleImageRoutes(context);
  registerCreativeFinishedArticleGenerationRoutes(context);
  registerCreativeFinishedArticlePublishRoutes(context);
}
