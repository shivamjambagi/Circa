export type CanvasResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const MIN_GROUP_WIDTH = 220;
export const MIN_GROUP_HEIGHT = 160;

type ResizeRectInput = {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: CanvasResizeDirection;
  screenDeltaX: number;
  screenDeltaY: number;
  zoom: number;
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
};

/** Converts pointer movement to canvas space and applies only the supplied bounds. */
export function resizeCanvasRect(input: ResizeRectInput) {
  const zoom = Number.isFinite(input.zoom) && input.zoom > 0 ? input.zoom : 1;
  const dx = input.screenDeltaX / zoom;
  const dy = input.screenDeltaY / zoom;
  const east = input.direction.includes("e");
  const west = input.direction.includes("w");
  const north = input.direction.includes("n");
  const south = input.direction.includes("s");
  const rawWidth = input.width + (east ? dx : west ? -dx : 0);
  const rawHeight = input.height + (south ? dy : north ? -dy : 0);
  const width = input.maxWidth === undefined ? Math.max(input.minWidth, rawWidth) : Math.min(input.maxWidth, Math.max(input.minWidth, rawWidth));
  const height = input.maxHeight === undefined ? Math.max(input.minHeight, rawHeight) : Math.min(input.maxHeight, Math.max(input.minHeight, rawHeight));
  return {
    x: west ? input.x + input.width - width : input.x,
    y: north ? input.y + input.height - height : input.y,
    width,
    height,
  };
}

export function calculateWorkspaceSize(
  rects: Array<{ x: number; y: number; width: number; height: number }>,
  minimumWidth: number,
  minimumHeight: number,
  padding = 160,
) {
  const valid = rects.filter((rect) => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite));
  if (!valid.length) return { width: minimumWidth, height: minimumHeight };
  const minX = Math.min(0, ...valid.map((rect) => rect.x));
  const minY = Math.min(0, ...valid.map((rect) => rect.y));
  const maxX = Math.max(minimumWidth - padding, ...valid.map((rect) => rect.x + rect.width));
  const maxY = Math.max(minimumHeight - padding, ...valid.map((rect) => rect.y + rect.height));
  return {
    width: Math.max(minimumWidth, maxX + padding, maxX - minX + padding * 2),
    height: Math.max(minimumHeight, maxY + padding, maxY - minY + padding * 2),
  };
}
