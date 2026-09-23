import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  createDraft,
  prepareWechatImage,
  uploadPermanentImage,
} from "../../src/core/wechatMp/wechatMpApiClient.js";
import { WECHAT_ERROR_HINTS } from "../../src/core/wechatMp/types.js";

async function createWebpFixture(): Promise<Buffer> {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 28, g: 67, b: 95 },
    },
  }).webp().toBuffer();
}

describe("公众号图片上传格式", () => {
  it("把 WebP 封面转换成 JPEG，并携带正确的 MIME 类型", async () => {
    const prepared = await prepareWechatImage(await createWebpFixture(), "cover", "cover");
    const metadata = await sharp(prepared.buffer).metadata();

    expect(prepared.filename).toBe("cover.jpg");
    expect(prepared.contentType).toBe("image/jpeg");
    expect(metadata.format).toBe("jpeg");
  });

  it("把 WebP 正文图片转换成 PNG，避免把不支持的格式发给微信", async () => {
    const prepared = await prepareWechatImage(await createWebpFixture(), "image_0", "content");
    const metadata = await sharp(prepared.buffer).metadata();

    expect(prepared.filename).toBe("image_0.png");
    expect(prepared.contentType).toBe("image/png");
    expect(metadata.format).toBe("png");
  });

  it("上传 multipart 时使用转换后的文件名和 MIME 类型", async () => {
    const prepared = await prepareWechatImage(await createWebpFixture(), "cover", "cover");
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ media_id: "media-cover" }),
      { headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await uploadPermanentImage("token", prepared);

    const init = fetchMock.mock.calls[0]?.[1];
    const media = (init?.body as FormData).get("media") as File;
    expect(media.name).toBe("cover.jpg");
    expect(media.type).toBe("image/jpeg");
  });

  it("创建草稿时固定填写作者、摘要并向所有人开启留言", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ media_id: "draft-media" })));
    vi.stubGlobal("fetch", fetchMock);

    const mediaId = await createDraft("token", {
      title: "测试标题",
      thumbMediaId: "cover-media",
      content: "<p>正文</p>",
    });

    expect(mediaId).toBe("draft-media");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/cgi-bin/draft/add?");
    expect(JSON.parse(init.body as string).articles[0]).toMatchObject({
      title: "测试标题",
      author: "阿川",
      digest: "详情请见正文。",
      need_open_comment: 1,
      only_fans_can_comment: 0,
      thumb_media_id: "cover-media",
      content: "<p>正文</p>",
    });
  });

  it("为文件类型和 IP 白名单错误提供对应的处理提示", () => {
    expect(WECHAT_ERROR_HINTS[40113]?.hint).toContain("JPEG");
    expect(WECHAT_ERROR_HINTS[40164]?.hint).toContain("IP 白名单");
  });
});
