<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";

const shellPages = [
  { key: "view-rules", label: "筛选策略", to: "/settings/view-rules" },
  { key: "sources", label: "数据收集", to: "/settings/sources" },
  { key: "profile", label: "当前用户", to: "/settings/profile" }
];
</script>

<template>
  <a-layout class="app-shell">
    <a-layout-sider class="app-shell__sider" width="256">
      <div class="app-shell__brand">
        <p class="app-shell__eyebrow">HotNow</p>
        <h1 class="app-shell__title">系统页构建骨架</h1>
        <p class="app-shell__description">Vue 3 + Ant Design Vue 的首阶段入口。</p>
      </div>

      <nav class="app-shell__nav" aria-label="系统页导航">
        <RouterLink
          v-for="page in shellPages"
          :key="page.key"
          class="app-shell__nav-link"
          :data-shell-nav="page.key"
          :to="page.to"
        >
          {{ page.label }}
        </RouterLink>
      </nav>
    </a-layout-sider>

    <a-layout class="app-shell__main">
      <a-layout-header class="app-shell__header">
        <a-typography-title :level="2" class="app-shell__header-title">
          HotNow 系统页
        </a-typography-title>
        <a-typography-text class="app-shell__header-note">
          这是一层可继续扩展的前端骨架。
        </a-typography-text>
      </a-layout-header>

      <a-layout-content class="app-shell__content">
        <a-card class="app-shell__card" :bordered="false">
          <RouterView />
        </a-card>
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>
