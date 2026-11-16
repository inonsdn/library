import React, { useState, useEffect, useRef } from "react";
import { chapterFiles, FOLDER } from "./drive";
import { stored, remember } from "./document-settings";
import { captureAnchor, anchorScrollTop } from "./reading-position";
export default function ReaderStream({
  book,
  initialChapter,
  initialPages,
  chapters,
  token,
  continuous,
  renderFile,
  onActive,
}) {
  const [sections, setSections] = useState([
    { chapter: initialChapter, files: initialPages },
  ]);
  const [fetching, setFetching] = useState(false),
    [error, setError] = useState("");
  const root = useRef(null),
    sentinel = useRef(null),
    active = useRef(initialChapter.id),
    callback = useRef(onActive);
  callback.current = onActive;
  const shown = continuous ? sections : sections.slice(0, 1);
  const tail = sections.at(-1).chapter;
  const nextIndex = chapters.findIndex((c) => c.id === tail.id) + 1;
  const hasNext =
    chapters.some((c) => c.id === tail.id) && nextIndex < chapters.length;
  useEffect(() => {
    if (!continuous || !hasNext || error) return;
    let alive = true,
      started = false;
    const controller = new AbortController();
    const observer = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((e) => e.isIntersecting)) return;
        started = true;
        observer.disconnect();
        setFetching(true);
        const next = chapters[nextIndex];
        (next.mimeType === FOLDER
          ? chapterFiles(token, next.id, controller.signal)
          : Promise.resolve([next])
        )
          .then((files) => {
            if (alive)
              setSections((prev) => [...prev, { chapter: next, files }]);
          })
          .catch((e) => {
            if (alive && e.name !== "AbortError") setError(e.message);
          })
          .finally(() => {
            if (alive) setFetching(false);
          });
      },
      { rootMargin: `${window.innerHeight * 3}px 0px` },
    );
    observer.observe(sentinel.current);
    return () => {
      alive = false;
      controller.abort();
      observer.disconnect();
    };
  }, [continuous, hasNext, tail.id, token, error, chapters, nextIndex]);
  useEffect(() => {
    let timer,
      frame,
      restoring = true,
      paused = false,
      restoreTimer;
    const saved = stored(`folio-scroll-${book.id}-${initialChapter.id}`, null);
    function target() {
      return [...root.current.querySelectorAll("[data-reader-file]")].find(
        (el) =>
          el.dataset.readerFile === saved?.fileId &&
          el.dataset.readerChapter === saved?.chapterId,
      );
    }
    function restore() {
      const el = target();
      if (!el) return;
      window.scrollTo({
        top: anchorScrollTop(
          el.getBoundingClientRect(),
          saved.fraction,
          window.scrollY,
        ),
        behavior: "instant",
      });
    }
    function snapshot() {
      if (restoring || paused || !root.current) return;
      const elements = [...root.current.querySelectorAll("[data-reader-file]")];
      const anchor = captureAnchor(
        elements.map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            chapterId: el.dataset.readerChapter,
            fileId: el.dataset.readerFile,
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
          };
        }),
      );
      if (!anchor) return;
      remember(`folio-scroll-${book.id}-${anchor.chapterId}`, anchor);
      if (active.current !== anchor.chapterId) {
        active.current = anchor.chapterId;
        const ch = chapters.find((c) => c.id === anchor.chapterId);
        if (ch) callback.current(ch);
      }
    }
    function finishRestore() {
      if (!restoring) return;
      restoring = false;
      resize.disconnect();
      clearTimeout(restoreTimer);
    }
    function interact(e) {
      if (
        e.type === "keydown" &&
        ![
          "ArrowDown",
          "ArrowUp",
          "PageDown",
          "PageUp",
          "Home",
          "End",
          " ",
        ].includes(e.key)
      )
        return;
      finishRestore();
    }
    function scroll() {
      if (restoring) return;
      clearTimeout(timer);
      timer = setTimeout(snapshot, 150);
    }
    const resize = new ResizeObserver(() => {
      if (restoring && saved) restore();
    });
    resize.observe(root.current);
    frame = requestAnimationFrame(() => {
      if (saved) restore();
      else window.scrollTo({ top: 0, behavior: "instant" });
      if (saved) restoreTimer = setTimeout(finishRestore, 2500);
      else finishRestore();
    });
    function flush() {
      snapshot();
      paused = true;
    }
    window.addEventListener("folio-save-reading", flush);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", snapshot);
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"])
      window.addEventListener(event, interact, { passive: true });
    function hidden() {
      if (document.visibilityState === "hidden") snapshot();
    }
    document.addEventListener("visibilitychange", hidden);
    return () => {
      snapshot();
      clearTimeout(timer);
      clearTimeout(restoreTimer);
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("folio-save-reading", flush);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", snapshot);
      document.removeEventListener("visibilitychange", hidden);
      for (const event of ["wheel", "touchstart", "pointerdown", "keydown"])
        window.removeEventListener(event, interact);
    };
  }, [book.id, initialChapter.id, chapters]);
  return (
    <div className="episode-stream" ref={root}>
      {shown.map((section, index) => (
        <section
          className="stream-episode"
          key={section.chapter.id}
          aria-label={section.chapter.name}
        >
          {continuous && (
            <div className="episode-divider">
              <span>{section.chapter.name}</span>
              <small>{index === 0 ? "Reading" : "Next episode"}</small>
            </div>
          )}
          <div className="reading-pages">
            {section.files.map((file) => (
              <div
                className="reader-file-anchor"
                key={file.id}
                data-reader-file={file.id}
                data-reader-chapter={section.chapter.id}
              >
                {renderFile(file, section.chapter)}
              </div>
            ))}
            {!section.files.length && (
              <div className="empty">
                No readable content in {section.chapter.name}.
              </div>
            )}
          </div>
        </section>
      ))}
      {continuous && (
        <div ref={sentinel} className="episode-sentinel" role="status">
          {error ? (
            <>
              <p>{error}</p>
              <button onClick={() => setError("")}>Retry next episode</button>
            </>
          ) : hasNext ? (
            fetching ? (
              "Loading the next episode…"
            ) : (
              "Continue scrolling"
            )
          ) : (
            "You’ve reached the end of this book."
          )}
        </div>
      )}
    </div>
  );
}
