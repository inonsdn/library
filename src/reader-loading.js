// Reserve the image's real display height before fetching its bytes.
export function pageRatio(file) {
  const { width, height } = file.imageMediaMetadata || {};
  return width > 0 && height > 0 ? width / height : 2 / 3;
}
export function preloadMargin(viewportHeight) {
  const screen = Math.max(1, viewportHeight);
  return `${screen}px 0px ${screen * 3}px 0px`;
}
// Limit Drive downloads so nearby pages do not compete with the whole chapter.
// Priority is evaluated when a slot opens, so a fast scroll overtakes old work.
export function createDownloadQueue(limit = 4) {
  let running = 0;
  const pending = [];
  function pump() {
    pending.sort((a, b) => a.priority() - b.priority());
    while (running < limit && pending.length) {
      const job = pending.shift();
      if (job.signal.aborted) {
        job.reject(new DOMException("Cancelled", "AbortError"));
        continue;
      }
      running++;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          running--;
          pump();
        });
    }
  }
  return (run, signal, priority = () => 0) =>
    new Promise((resolve, reject) => {
      const job = { run, signal, priority, resolve, reject };
      pending.push(job);
      signal.addEventListener(
        "abort",
        () => {
          const index = pending.indexOf(job);
          if (index >= 0) {
            pending.splice(index, 1);
            reject(new DOMException("Cancelled", "AbortError"));
          }
        },
        { once: true },
      );
      pump();
    });
}
