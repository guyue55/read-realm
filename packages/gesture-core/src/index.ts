/**
 * @file index.ts
 * @description 墨问 (Read Realm) 纯手势与翻页点击区计算核心模块。
 * 遵循跨端通用设计，不直接依赖于特定浏览器 DOM/React API。
 */

export interface TouchPosition {
  x: number;
  y: number;
}

export interface GestureConfig {
  /**
   * 左侧点击翻页判定区域比例（0.0 到 1.0）。默认 0.25 (即左侧 25%)。
   */
  tapLeftThreshold?: number;
  /**
   * 右侧点击翻页判定区域比例（0.0 到 1.0）。默认 0.75 (即右侧 25%)。
   */
  tapRightThreshold?: number;
  /**
   * 触发滑动的最小位移像素。默认 50。
   */
  swipeThreshold?: number;
  /**
   * 触发滑动的最小速度像素/毫秒（可选）。默认 0.3。
   */
  swipeVelocityThreshold?: number;
}

export type TapAction = "prev" | "menu" | "next";
export type SwipeAction = "swipeLeft" | "swipeRight" | "swipeUp" | "swipeDown";

export class GestureRecognizer {
  private config: Required<GestureConfig>;

  constructor(config?: GestureConfig) {
    this.config = {
      tapLeftThreshold: config?.tapLeftThreshold ?? 0.25,
      tapRightThreshold: config?.tapRightThreshold ?? 0.75,
      swipeThreshold: config?.swipeThreshold ?? 50,
      swipeVelocityThreshold: config?.swipeVelocityThreshold ?? 0.3,
    };
  }

  /**
   * 根据点击横坐标与容器宽度，计算点击翻页/菜单行为。
   *
   * @param x 点击事件相对于阅读区域容器的 X 坐标 (clientX - bounds.left)
   * @param width 容器的总宽度
   * @returns TapAction ('prev' | 'menu' | 'next')
   */
  getTapAction(x: number, width: number): TapAction {
    if (width <= 0) return "menu";

    const ratio = x / width;
    if (ratio < this.config.tapLeftThreshold) {
      return "prev";
    }
    if (ratio > this.config.tapRightThreshold) {
      return "next";
    }
    return "menu";
  }

  /**
   * 根据起点、终点和触摸时长，判定滑动手势。
   *
   * @param start 触摸起点坐标 {x, y}
   * @param end 触摸终点坐标 {x, y}
   * @param durationMs 触摸持续时间（毫秒），用于速度计算。若不需要速度过滤，可传入 0。
   * @returns SwipeAction | null (未触发则返回 null)
   */
  getSwipeAction(
    start: TouchPosition,
    end: TouchPosition,
    durationMs: number = 0,
  ): SwipeAction | null {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // 1. 过滤未达到滑动距离阈值的位移
    if (Math.max(absX, absY) < this.config.swipeThreshold) {
      return null;
    }

    // 2. 如果提供了耗时，计算滑动速度进行防误触过滤
    if (durationMs > 0) {
      const distance = Math.sqrt(absX * absX + absY * absY);
      const velocity = distance / durationMs;
      if (velocity < this.config.swipeVelocityThreshold) {
        return null;
      }
    }

    // 3. 判定滑动主方向，带有 1.15 倍的倾斜防误触容差
    if (absX > absY * 1.15) {
      // 横向滑动：左滑转下一页，右滑转上一页
      return deltaX < 0 ? "swipeLeft" : "swipeRight";
    }

    if (absY > absX * 1.15) {
      // 纵向滑动
      return deltaY < 0 ? "swipeUp" : "swipeDown";
    }

    return null;
  }
}
