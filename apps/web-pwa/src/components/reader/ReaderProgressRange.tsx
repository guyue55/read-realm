"use client";

import { useRef, type KeyboardEvent, type TouchEvent } from "react";

interface ReaderProgressRangeProps {
  value: number;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  className?: string;
}

const MIN = 0;
const MAX = 100;
const STEP = 0.1;

function valueAtClientX(input: HTMLInputElement, clientX: number) {
  const bounds = input.getBoundingClientRect();
  if (bounds.width <= 0) return Number(input.value);
  const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
  return Math.round((MIN + ratio * (MAX - MIN)) / STEP) * STEP;
}

const commitKeys = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export function ReaderProgressRange({
  value,
  onPreview,
  onCommit,
  className,
}: ReaderProgressRangeProps) {
  const currentValueRef = useRef(value);
  const touchActiveRef = useRef(false);
  currentValueRef.current = value;

  const previewAtTouch = (event: TouchEvent<HTMLInputElement>) => {
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (!touch) return currentValueRef.current;
    const nextValue = valueAtClientX(event.currentTarget, touch.clientX);
    currentValueRef.current = nextValue;
    onPreview(nextValue);
    return nextValue;
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (commitKeys.has(event.key)) onCommit(currentValueRef.current);
  };

  return (
    <input
      aria-label="拖动阅读进度"
      data-reader-control
      type="range"
      min={MIN}
      max={MAX}
      step={STEP}
      value={value}
      onChange={(event) => {
        const nextValue = Number(event.currentTarget.value);
        currentValueRef.current = nextValue;
        onPreview(nextValue);
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== "touch") onCommit(currentValueRef.current);
      }}
      onTouchStart={(event) => {
        touchActiveRef.current = true;
        previewAtTouch(event);
      }}
      onTouchMove={(event) => {
        if (!touchActiveRef.current) return;
        event.preventDefault();
        previewAtTouch(event);
      }}
      onTouchEnd={(event) => {
        if (!touchActiveRef.current) return;
        touchActiveRef.current = false;
        onCommit(previewAtTouch(event));
      }}
      onTouchCancel={() => {
        touchActiveRef.current = false;
      }}
      onKeyUp={handleKeyUp}
      className={className}
      style={{ touchAction: "none" }}
    />
  );
}
