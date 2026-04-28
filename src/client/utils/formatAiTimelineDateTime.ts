const aiTimelineDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

// AI 时间线面向国内阅读，统一把 feed 时间转成短时间，减少时间轴左侧的字符占位。
export function formatAiTimelineDateTime(value: string | null | undefined): string {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间无效";
  }

  const parts = Object.fromEntries(aiTimelineDateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]));

  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
