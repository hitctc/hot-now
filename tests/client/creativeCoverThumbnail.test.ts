import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";

import CreativeCoverThumbnail from "../../src/client/components/creative/CreativeCoverThumbnail.vue";

const ImageStub = defineComponent({
  name: "AImage",
  props: {
    src: String,
    preview: Object
  },
  emits: ["click", "error"],
  template: "<button data-image @click=\"$emit('click')\"></button>"
});

describe("CreativeCoverThumbnail", () => {
  it("only exposes the original image to preview after the thumbnail is clicked", async () => {
    const originalUrl = "/api/creative/images/2026-07-31/large-cover.jpg";
    const wrapper = mount(CreativeCoverThumbnail, {
      props: {
        originalUrl
      },
      global: {
        stubs: {
          "a-image": ImageStub
        }
      }
    });

    const image = wrapper.findComponent(ImageStub);
    expect(image.props("src")).toBe(`${originalUrl}?variant=thumbnail`);
    expect(image.props("preview")).toMatchObject({
      src: `${originalUrl}?variant=thumbnail`,
      visible: false
    });

    await wrapper.get("[data-image]").trigger("click");

    expect(image.props("preview")).toMatchObject({
      src: originalUrl,
      visible: true
    });
  });

  it("loads the original only after a failed thumbnail placeholder is clicked", async () => {
    const originalUrl = "/api/creative/images/2026-07-31/broken-cover.jpg";
    const wrapper = mount(CreativeCoverThumbnail, {
      props: {
        originalUrl
      },
      global: {
        stubs: {
          "a-image": ImageStub
        }
      }
    });

    await wrapper.findComponent(ImageStub).vm.$emit("error");
    expect(wrapper.findAllComponents(ImageStub)).toHaveLength(0);

    await wrapper.get("button").trigger("click");

    const previewImage = wrapper.findComponent(ImageStub);
    expect(previewImage.props("src")).toBe(originalUrl);
    expect(previewImage.props("preview")).toMatchObject({
      src: originalUrl,
      visible: true
    });
  });
});
