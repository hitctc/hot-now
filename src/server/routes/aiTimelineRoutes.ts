import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AiTimelineFeedReadResult } from "../../core/aiTimeline/aiTimelineFeedFile.js";
import type { AiTimelineListQuery, AiTimelinePageModel } from "../../core/aiTimeline/aiTimelineTypes.js";
import { readAiTimelineApiData } from "../aiTimelineApiData.js";
export type AiTimelineRouteOptions={readFeed?:()=>Promise<AiTimelineFeedReadResult>|AiTimelineFeedReadResult;readPage?: (q:AiTimelineListQuery)=>Promise<AiTimelinePageModel>|AiTimelinePageModel;authorize:(r:FastifyRequest,p:FastifyReply)=>boolean};
/** 注册公开时间线 Feed、读取和只读保护。 */
export function registerAiTimelineRoutes(app:FastifyInstance,o:AiTimelineRouteOptions):void {
 app.get('/feeds/ai-timeline-feed.md',async (_q,p)=>{if(!o.readFeed)return p.code(404).type('text/plain; charset=utf-8').send('AI timeline feed is not configured');try{const f=await o.readFeed();return p.header('x-hot-now-feed-source',f.sourcePath).header('x-hot-now-feed-fallback',String(f.isFallback)).type('text/markdown; charset=utf-8').send(f.content)}catch(e){app.log.warn({error:e},'AI timeline feed is unavailable');return p.code(503).type('text/plain; charset=utf-8').send('AI timeline feed is unavailable')}});
 app.get('/api/ai-timeline',async (q,p)=>p.send(await readAiTimelineApiData({readAiTimelinePage:o.readPage},q)));
 app.post('/actions/ai-timeline/events/:id/update',async(q,p)=>{if(!o.authorize(q,p))return;return p.code(410).send({ok:false,reason:'ai-timeline-feed-is-read-only'})});
}
