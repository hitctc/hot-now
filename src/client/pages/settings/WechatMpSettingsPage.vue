<!-- 公众号配置设置页 -->
<template>
  <div class="wechat-mp-settings-page">
    <WechatMpSettingsPanel />
  </div>
</template>

<script setup lang="ts">
import WechatMpSettingsPanel from "../../components/settings/wechatMp/WechatMpSettingsPanel.vue";
</script>

<style scoped>
.wechat-mp-settings-page {
  max-width: 960px;
  margin: 0 auto;
}
</style>
