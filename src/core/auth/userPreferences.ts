export const writeQueueWidths = [250, 350, 450, 550] as const;

export type WriteQueueWidth = (typeof writeQueueWidths)[number];

export type WriteQueuePreferences = {
  embedded: boolean;
  width: WriteQueueWidth;
  expanded: boolean;
};

/** 校验客户端提交的队列偏好，避免未受信输入进入账号设置 JSON。 */
export function isWriteQueuePreferences(value: unknown): value is WriteQueuePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preferences = value as Record<string, unknown>;
  return typeof preferences.embedded === "boolean"
    && typeof preferences.expanded === "boolean"
    && writeQueueWidths.some((width) => width === preferences.width);
}
