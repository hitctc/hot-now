export type LatestRequestGuard = {
  begin: () => number;
  isCurrent: (requestId: number) => boolean;
  invalidate: () => void;
};

/** 为同一交互通道生成递增请求号，过期响应不能再覆盖最新界面状态。 */
export function createLatestRequestGuard(): LatestRequestGuard {
  let currentRequestId = 0;

  return {
    begin: () => ++currentRequestId,
    isCurrent: (requestId) => requestId === currentRequestId,
    invalidate: () => {
      currentRequestId++;
    }
  };
}
