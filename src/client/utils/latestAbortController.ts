export type LatestAbortController = {
  begin: () => AbortController;
  isCurrent: (controller: AbortController) => boolean;
  finish: (controller: AbortController) => void;
  cancel: () => void;
};

/** 每次开始请求时取消上一请求，并让调用方只接收当前控制器的结果。 */
export function createLatestAbortController(): LatestAbortController {
  let activeController: AbortController | null = null;

  return {
    begin() {
      activeController?.abort();
      activeController = new AbortController();
      return activeController;
    },
    isCurrent(controller) {
      return activeController === controller && !controller.signal.aborted;
    },
    finish(controller) {
      if (activeController === controller) activeController = null;
    },
    cancel() {
      activeController?.abort();
      activeController = null;
    }
  };
}

/** 识别浏览器主动取消请求产生的标准 AbortError。 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
