export const READING_LINE = 84;
export function captureAnchor(items, line = READING_LINE) {
  const item = items.find((item) => item.bottom > line) || items.at(-1);
  if (!item) return null;
  return {
    chapterId: item.chapterId,
    fileId: item.fileId,
    fraction: Math.max(
      0,
      Math.min(1, (line - item.top) / Math.max(1, item.height)),
    ),
  };
}
export function anchorScrollTop(rect, fraction, scrollY, line = READING_LINE) {
  return Math.max(
    0,
    scrollY +
      rect.top +
      Math.max(0, Math.min(1, fraction || 0)) * rect.height -
      line,
  );
}
