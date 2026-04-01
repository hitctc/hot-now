<script setup lang="ts">
import { ConfigProvider } from "ant-design-vue";

import UnifiedShellLayout from "./layouts/UnifiedShellLayout.vue";
import { useTheme } from "./composables/useTheme";

const { themeConfig } = useTheme();
</script>

<template>
  <ConfigProvider :theme="themeConfig">
    <div class="min-h-screen text-editorial-text-main" data-shell-root>
      <UnifiedShellLayout />
    </div>
  </ConfigProvider>
</template>
