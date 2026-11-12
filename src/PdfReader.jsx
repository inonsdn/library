import React, { useState, useEffect, useRef } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { driveRequest } from "./drive";
import { clampPage, stored, remember } from "./document-settings";
GlobalWorkerOptions.workerSrc = workerUrl;
function PdfPage({ pdf, number, mode, scale, onVisible }) {
  const container = useRef(null),
    canvas = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  useEffect(() => {
    const resize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const [width, setWidth] = useState(800),
    [near, setNear] = useState(mode === "horizontal"),
    [ratio, setRatio] = useState(0.707),
    [error, setError] = useState("");
  useEffect(() => {
    const el = container.current;
    const resize = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    resize.observe(el);
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((e) => e.isIntersecting)),
      { rootMargin: `${window.innerHeight * 3}px 0px` },
    );
    observer.observe(el);
    const visible = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onVisible(number);
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    visible.observe(el);
    return () => {
      resize.disconnect();
      observer.disconnect();
      visible.disconnect();
    };
  }, [number, onVisible]);
  useEffect(() => {
    if (!near) return;
    let active = true,
      render;
    setError("");
    pdf
      .getPage(number)
      .then(async (page) => {
        if (!active) return;
        const base = page.getViewport({ scale: 1 });
        setRatio(base.width / base.height);
        const fit =
          mode === "horizontal"
            ? Math.min(
                width / base.width,
                Math.max(250, viewportHeight - 260) / base.height,
              )
            : width / base.width;
        const viewport = page.getViewport({
          scale: Math.max(0.1, (fit * scale) / 100),
        });
        const pixel = Math.min(window.devicePixelRatio || 1, 2);
        const el = canvas.current;
        el.width = Math.ceil(viewport.width * pixel);
        el.height = Math.ceil(viewport.height * pixel);
        el.style.width = `${viewport.width}px`;
        el.style.height = `${viewport.height}px`;
        render = page.render({
          canvasContext: el.getContext("2d"),
          viewport,
          transform: pixel !== 1 ? [pixel, 0, 0, pixel, 0, 0] : null,
        });
        await render.promise;
      })
      .catch((e) => {
        if (active && e.name !== "RenderingCancelledException")
          setError(e.message);
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [pdf, number, width, near, scale, mode, viewportHeight]);
  useEffect(() => {
    if (!near && canvas.current) {
      canvas.current.width = 0;
      canvas.current.height = 0;
    }
  }, [near]);
  return (
    <div
      ref={container}
      id={`pdf-page-${number}`}
      className={`pdf-page ${mode}`}
      style={
        mode === "vertical"
          ? { aspectRatio: ratio / (scale / 100) }
          : { minHeight: "60vh" }
      }
      aria-label={`Page ${number}`}
    >
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <canvas ref={canvas} role="img" aria-label={`PDF page ${number}`} />
      )}
    </div>
  );
}
export default function PdfReader({
  file,
  token,
  mode,
  scale,
  onReconnect,
  onRetry,
}) {
  const [pdf, setPdf] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(() => stored(`folio-pdf-${file.id}`, 1)),
    [password, setPassword] = useState("");
  const pageRef = useRef(page),
    passwordCallback = useRef(null),
    touch = useRef(null);
  useEffect(() => {
    let active = true,
      task;
    const controller = new AbortController();
    setPdf(null);
    setError("");
    const open = async () => {
      task = getDocument({
        url: `/api/image?id=${encodeURIComponent(file.id)}`,
        withCredentials: true,
        isEvalSupported: false,
        cMapUrl: "/pdf-assets/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdf-assets/standard_fonts/",
      });
      task.onPassword = (update, reason) => {
        if (active) {
          passwordCallback.current = update;
          setPassword(
            reason === 2
              ? "Incorrect password. Try again."
              : "This PDF needs a password.",
          );
        }
      };
      let doc;
      try {
        doc = await task.promise;
      } catch (e) {
        if (!active) return;
        await task.destroy();
        const r = await driveRequest(
          token,
          `files/${file.id}`,
          { alt: "media" },
          controller.signal,
        );
        const data = await r.arrayBuffer();
        if (!active) return;
        task = getDocument({
          data,
          isEvalSupported: false,
          cMapUrl: "/pdf-assets/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf-assets/standard_fonts/",
        });
        task.onPassword = (update) => {
          if (active) {
            passwordCallback.current = update;
            setPassword("This PDF needs a password.");
          }
        };
        doc = await task.promise;
      }
      if (active) {
        setPdf(doc);
        setPage((p) => {
          const next = clampPage(p, doc.numPages);
          pageRef.current = next;
          return next;
        });
      }
    };
    open().catch((e) => {
      if (active && e.name !== "AbortError") setError(e.message);
    });
    return () => {
      active = false;
      controller.abort();
      task?.destroy();
      passwordCallback.current = null;
    };
  }, [file.id, token]);
  const rememberVisible = useRef((n) => {
    setPage(n);
    pageRef.current = n;
    remember(`folio-pdf-${file.id}`, n);
  }).current;
  function go(n) {
    const next = clampPage(n, pdf?.numPages);
    setPage(next);
    pageRef.current = next;
    remember(`folio-pdf-${file.id}`, next);
    if (mode === "vertical")
      document
        .getElementById(`pdf-page-${next}`)
        ?.scrollIntoView({ block: "start", behavior: "auto" });
  }
  useEffect(() => {
    const current = pageRef.current;
    setPage(current);
    if (mode === "vertical" && pdf) {
      const frame = requestAnimationFrame(() =>
        document
          .getElementById(`pdf-page-${current}`)
          ?.scrollIntoView({ block: "start" }),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [mode, pdf]);
  useEffect(() => {
    if (mode !== "horizontal" || !pdf) return;
    const key = (e) => {
      if (
        /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPage((p) => {
          const n = clampPage(p + 1, pdf.numPages);
          pageRef.current = n;
          remember(`folio-pdf-${file.id}`, n);
          return n;
        });
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPage((p) => {
          const n = clampPage(p - 1, pdf.numPages);
          pageRef.current = n;
          remember(`folio-pdf-${file.id}`, n);
          return n;
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mode, pdf, file.id]);
  if (error)
    return (
      <div className="document-error" role="alert">
        {error}
        <button onClick={onRetry}>Retry PDF</button>
        {/expired|401|permission/i.test(error) && (
          <button onClick={onReconnect}>Reconnect Drive</button>
        )}
      </div>
    );
  if (password)
    return (
      <form
        className="document-password"
        onSubmit={(e) => {
          e.preventDefault();
          passwordCallback.current?.(
            new FormData(e.currentTarget).get("password"),
          );
          setPassword("");
        }}
      >
        <p>{password}</p>
        <input
          name="password"
          type="password"
          aria-label="PDF password"
          required
        />
        <button>Unlock PDF</button>
      </form>
    );
  if (!pdf)
    return (
      <div className="document-loading" role="status">
        Loading PDF…
      </div>
    );
  return (
    <div
      className="pdf-reader"
      onTouchStart={(e) => {
        touch.current = [e.touches[0].clientX, e.touches[0].clientY];
      }}
      onTouchEnd={(e) => {
        if (mode !== "horizontal" || !touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current[0],
          dy = e.changedTouches[0].clientY - touch.current[1];
        if (
          Math.abs(dx) > 70 &&
          Math.abs(dx) > Math.abs(dy) * 1.5 &&
          scale <= 100
        )
          go(page + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
    >
      <div className="document-pagination">
        <button onClick={() => go(page - 1)} disabled={page <= 1}>
          ← Previous page
        </button>
        <label>
          Page{" "}
          <input
            type="number"
            aria-label="PDF page number"
            min="1"
            max={pdf.numPages}
            value={page}
            onChange={(e) => go(e.target.value)}
          />{" "}
          / {pdf.numPages}
        </label>
        <button onClick={() => go(page + 1)} disabled={page >= pdf.numPages}>
          Next page →
        </button>
      </div>
      <div className={`pdf-pages ${mode}`}>
        {(mode === "vertical"
          ? Array.from({ length: pdf.numPages }, (_, i) => i + 1)
          : [page]
        ).map((n) => (
          <PdfPage
            key={n}
            pdf={pdf}
            number={n}
            mode={mode}
            scale={scale}
            onVisible={rememberVisible}
          />
        ))}
      </div>
      {mode === "horizontal" && (
        <div className="document-pagination">
          <button onClick={() => go(page - 1)} disabled={page <= 1}>
            ← Previous page
          </button>
          <span>
            {page} / {pdf.numPages}
          </span>
          <button onClick={() => go(page + 1)} disabled={page >= pdf.numPages}>
            Next page →
          </button>
        </div>
      )}
    </div>
  );
}
