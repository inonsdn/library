import React, { useState, useEffect, useRef } from "react";
import ePub from "epubjs";
import { driveRequest } from "./drive";
import { stored, remember } from "./document-settings";
export default function EpubReader({
  file,
  token,
  mode,
  scale,
  onReconnect,
  onRetry,
}) {
  const host = useRef(null),
    rendition = useRef(null),
    position = useRef(stored(`folio-epub-${file.id}`, null));
  const [book, setBook] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [toc, setToc] = useState([]),
    [location, setLocation] = useState(null);
  useEffect(() => {
    let active = true,
      opened;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    driveRequest(token, `files/${file.id}`, { alt: "media" }, controller.signal)
      .then((r) => r.arrayBuffer())
      .then(async (data) => {
        if (!active) return;
        opened = ePub(undefined, { replacements: "blobUrl" });
        await opened.open(data, "binary");
        await opened.ready;
        if (active) {
          setBook(opened);
          const navigation = await opened.loaded.navigation;
          if (active) setToc(navigation.toc);
        }
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
      opened?.destroy();
    };
  }, [file.id, token]);
  useEffect(() => {
    if (!book || !host.current) return;
    let active = true;
    setLoading(true);
    setError("");
    const view = book.renderTo(host.current, {
      width: "100%",
      height: "100%",
      flow: mode === "vertical" ? "scrolled-continuous" : "paginated",
      manager: mode === "vertical" ? "continuous" : "default",
      spread: "none",
      allowScriptedContent: false,
      allowPopups: false,
    });
    rendition.current = view;
    view.hooks.content.register((contents) => {
      const doc = contents.document;
      doc
        .querySelectorAll("script,object,embed,form")
        .forEach((el) => el.remove());
      doc.querySelectorAll("*").forEach((el) => {
        for (const attr of [...el.attributes]) {
          if (
            /^on/i.test(attr.name) ||
            /^(javascript|vbscript):/i.test(attr.value)
          )
            el.removeAttribute(attr.name);
        }
      });
      const csp = doc.createElement("meta");
      csp.httpEquiv = "Content-Security-Policy";
      csp.content =
        "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob:; font-src blob: data:; media-src blob: data:;";
      doc.head.prepend(csp);
      contents.addStylesheetRules({
        body: {
          "font-family": "system-ui, sans-serif !important",
          "line-height": "1.8 !important",
          color: "#44394f !important",
        },
        img: { "max-width": "100% !important" },
      });
      contents.on("keydown", key);
    });
    function key(e) {
      if (
        mode === "horizontal" &&
        !/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName || "")
      ) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          view.next().catch(fail);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          view.prev().catch(fail);
        }
      }
    }
    function fail(e) {
      if (active) setError(e.message || "Could not display this EPUB section.");
    }
    view.on("relocated", (loc) => {
      if (active) {
        setLocation(loc);
        position.current = loc.start.cfi;
        remember(`folio-epub-${file.id}`, loc.start.cfi);
      }
    });
    view.on("displayError", fail);
    view.themes.fontSize(`${scale}%`);
    view
      .display(position.current || undefined)
      .catch(() => view.display())
      .then(() => {
        if (active) setLoading(false);
      })
      .catch(fail);
    const observer = new ResizeObserver(() => {
      if (active && view.manager && host.current)
        view.resize(host.current.clientWidth, host.current.clientHeight);
    });
    observer.observe(host.current);
    window.addEventListener("keydown", key);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("keydown", key);
      if (view.book) view.destroy();
      rendition.current = null;
      host.current?.replaceChildren();
    };
  }, [book, mode]);
  useEffect(() => {
    rendition.current?.themes.fontSize(`${scale}%`);
  }, [scale]);
  function move(direction) {
    const view = rendition.current;
    if (view) view[direction]().catch((e) => setError(e.message));
  }
  function flatten(items, depth = 0) {
    return items.flatMap((item) => [
      { ...item, label: `${"— ".repeat(depth)}${item.label}` },
      ...flatten(item.subitems || [], depth + 1),
    ]);
  }
  return (
    <div className="epub-reader">
      <div className="document-pagination">
        <button
          disabled={!book || location?.atStart}
          onClick={() => move("prev")}
        >
          ← Previous {mode === "vertical" ? "section" : "page"}
        </button>
        <label className="epub-toc">
          Contents
          <select
            aria-label="EPUB table of contents"
            value=""
            onChange={(e) =>
              rendition.current
                ?.display(e.target.value)
                .catch((err) => setError(err.message))
            }
          >
            <option value="">Choose section…</option>
            {flatten(toc).map((entry, i) => (
              <option key={`${entry.href}-${i}`} value={entry.href}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!book || location?.atEnd}
          onClick={() => move("next")}
        >
          Next {mode === "vertical" ? "section" : "page"} →
        </button>
      </div>
      {error && (
        <div className="document-error" role="alert">
          {error}
          <button onClick={onRetry}>Retry EPUB</button>
          {/expired|401|permission/i.test(error) && (
            <button onClick={onReconnect}>Reconnect Drive</button>
          )}
        </div>
      )}
      {loading && (
        <div className="document-loading" role="status">
          Loading EPUB…
        </div>
      )}
      <div
        ref={host}
        className="epub-viewport"
        style={{ visibility: loading ? "hidden" : "visible" }}
      />
      <div className="epub-location">
        {location?.start?.displayed
          ? `Section page ${location.start.displayed.page} of ${location.start.displayed.total}`
          : ""}
      </div>
    </div>
  );
}
