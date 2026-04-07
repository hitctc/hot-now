import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ContentBackToTopButton from "../../src/client/components/content/ContentBackToTopButton.vue";

describe("ContentBackToTopButton", () => {
  it("keeps the fixed button high enough to avoid overlapping the pagination bar", () => {
    const wrapper = mount(ContentBackToTopButton, {
      props: {
        visible: true
      }
    });

    expect(wrapper.get("[data-content-back-to-top]").classes()).toEqual(
      expect.arrayContaining(["fixed", "bottom-24", "right-5", "max-[900px]:bottom-20", "max-[900px]:right-4"])
    );
    expect(wrapper.get("[data-content-back-to-top]").classes()).not.toEqual(
      expect.arrayContaining(["bottom-5", "max-[900px]:bottom-4"])
    );
  });
});
