export function documentType(file) {
  if (file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name || ""))
    return "pdf";
  if (
    file.mimeType === "application/epub+zip" ||
    /\.epub$/i.test(file.name || "")
  )
    return "epub";
  return null;
}
export function clampPage(page, count) {
  return Math.max(1, Math.min(count || 1, Math.trunc(Number(page)) || 1));
}
export function stored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function remember(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
