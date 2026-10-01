/**
 * 全局禁止页面手势缩放（双指放大/缩小）。
 *
 * 为什么需要事件拦截：iOS Safari 从 10 起会忽略 viewport 的 `user-scalable=no`，
 * 只靠 meta 无法阻止双指缩放，必须同时拦截 `gesturestart`/`gesturechange`/`gestureend`；
 * 其他浏览器则通过多指 `touchmove` 拦截兜底。CSS 的 `touch-action` 由样式层设置。
 *
 * 副作用：在传入目标上注册全局监听，默认作用于 `document`。返回解绑函数，便于测试清理。
 * 单指触摸不做任何拦截，滚动、点击和长按保持原行为。
 */
export function disablePageZoom(target: Document | HTMLElement = document): () => void {
  /** 手势缩放事件没有可用的默认行为，直接阻止。 */
  const preventGesture = (event: Event): void => {
    event.preventDefault();
  };

  /** 只有两根及以上手指才算缩放，单指保持可滚动。 */
  const preventMultiTouch = (event: TouchEvent): void => {
    if (event.touches.length > 1) event.preventDefault();
  };

  const gestureEvents = ["gesturestart", "gesturechange", "gestureend"];

  for (const name of gestureEvents) {
    target.addEventListener(name, preventGesture, { passive: false });
  }
  target.addEventListener("touchmove", preventMultiTouch as EventListener, { passive: false });

  return () => {
    for (const name of gestureEvents) {
      target.removeEventListener(name, preventGesture);
    }
    target.removeEventListener("touchmove", preventMultiTouch as EventListener);
  };
}
