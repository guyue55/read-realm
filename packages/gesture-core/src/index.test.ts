import { describe, it, expect } from "vitest";
import { GestureRecognizer } from "./index";

describe("GestureRecognizer", () => {
  describe("Tap regions", () => {
    it("should return correct actions with default config", () => {
      const recognizer = new GestureRecognizer();
      const width = 400;

      // Left 25% (0 to 100)
      expect(recognizer.getTapAction(50, width)).toBe("prev");
      expect(recognizer.getTapAction(99, width)).toBe("prev");

      // Center 50% (100 to 300)
      expect(recognizer.getTapAction(100, width)).toBe("menu");
      expect(recognizer.getTapAction(200, width)).toBe("menu");
      expect(recognizer.getTapAction(300, width)).toBe("menu");

      // Right 25% (300 to 400)
      expect(recognizer.getTapAction(301, width)).toBe("next");
      expect(recognizer.getTapAction(350, width)).toBe("next");
    });

    it("should handle custom config thresholds", () => {
      const recognizer = new GestureRecognizer({
        tapLeftThreshold: 0.2,
        tapRightThreshold: 0.8,
      });
      const width = 1000;

      expect(recognizer.getTapAction(150, width)).toBe("prev"); // 15%
      expect(recognizer.getTapAction(250, width)).toBe("menu"); // 25%
      expect(recognizer.getTapAction(750, width)).toBe("menu"); // 75%
      expect(recognizer.getTapAction(850, width)).toBe("next"); // 85%
    });

    it("should return menu if width is invalid", () => {
      const recognizer = new GestureRecognizer();
      expect(recognizer.getTapAction(50, 0)).toBe("menu");
    });
  });

  describe("Swipe actions", () => {
    const recognizer = new GestureRecognizer({
      swipeThreshold: 50,
      swipeVelocityThreshold: 0.3,
    });

    it("should return null for short movements", () => {
      const start = { x: 100, y: 100 };
      const end = { x: 140, y: 100 }; // 40px, threshold is 50px
      expect(recognizer.getSwipeAction(start, end)).toBeNull();
    });

    it("should detect swipeLeft", () => {
      const start = { x: 200, y: 100 };
      const end = { x: 130, y: 100 }; // -70px
      expect(recognizer.getSwipeAction(start, end)).toBe("swipeLeft");
    });

    it("should detect swipeRight", () => {
      const start = { x: 100, y: 100 };
      const end = { x: 170, y: 100 }; // +70px
      expect(recognizer.getSwipeAction(start, end)).toBe("swipeRight");
    });

    it("should detect swipeUp", () => {
      const start = { x: 100, y: 200 };
      const end = { x: 100, y: 130 }; // -70px
      expect(recognizer.getSwipeAction(start, end)).toBe("swipeUp");
    });

    it("should detect swipeDown", () => {
      const start = { x: 100, y: 100 };
      const end = { x: 100, y: 170 }; // +70px
      expect(recognizer.getSwipeAction(start, end)).toBe("swipeDown");
    });

    it("should return null for mixed diagonal swipe with angle > 45 deg range", () => {
      const start = { x: 100, y: 100 };
      const end = { x: 160, y: 160 }; // perfectly diagonal, absX === absY
      expect(recognizer.getSwipeAction(start, end)).toBeNull();
    });

    it("should check velocity threshold if duration is provided", () => {
      const start = { x: 100, y: 100 };
      const end = { x: 170, y: 100 }; // 70px

      // Fast swipe: 70px / 100ms = 0.7 px/ms (> 0.3)
      expect(recognizer.getSwipeAction(start, end, 100)).toBe("swipeRight");

      // Slow swipe: 70px / 300ms = 0.23 px/ms (< 0.3)
      expect(recognizer.getSwipeAction(start, end, 300)).toBeNull();
    });
  });
});
