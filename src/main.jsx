import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  Library,
  Search,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Grid2X2,
  List,
  LogOut,
  RefreshCw,
  X,
  ChevronDown,
  Cloud,
  Settings,
} from "lucide-react";
import {
  ROOT,
  FOLDER,
  naturalSort,
  readable,
  listFolder,
  chapterFiles,
  driveRequest,
} from "./drive";
import "./style.css";
import {
  createDownloadQueue,
  pageRatio,
  preloadMargin,
} from "./reader-loading";
const downloadPage = createDownloadQueue(4);
const readStorage = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
function Media({ file, token }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [ratio, setRatio] = useState(() => pageRatio(file));
  const ref = useRef(null);
  const finishLoad = useRef(() => {});
  useEffect(() => {
    let active = true,
      observer,
      started = false;
    const controller = new AbortController();
    setUrl("");
    setError("");
    setRatio(pageRatio(file));
    const start = () => {
      if (started) return;
      started = true;
      observer?.disconnect();
      downloadPage(
        () =>
          new Promise((resolve, reject) => {
            if (!active) {
              resolve();
              return;
            }
            const source = `/api/image?id=${encodeURIComponent(file.id)}&attempt=${retry}`;
            finishLoad.current = resolve;
            controller.signal.addEventListener("abort", resolve, {
              once: true,
            });
            // The actual visible image owns the request and renders while streaming.
            setUrl(source);
            if (file.mimeType === "application/pdf") resolve();
          }),
        controller.signal,
        () => {
          const box = ref.current?.getBoundingClientRect();
          if (!box) return Infinity;
          if (box.bottom >= 0 && box.top <= window.innerHeight) return 0;
          return box.top > window.innerHeight
            ? box.top - window.innerHeight
            : Math.abs(box.bottom) + window.innerHeight;
        },
      ).catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      });
    };
    // Rebuild the buffer on resize/orientation change; the observer keeps
    // replenishing it as each new screen enters the three-screen lookahead.
    const observe = () => {
      if (started) return;
      observer?.disconnect();
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) start();
        },
        { rootMargin: preloadMargin(window.innerHeight) },
      );
      observer.observe(ref.current);
    };
    observe();
    window.addEventListener("resize", observe);
    return () => {
      active = false;
      controller.abort();
      observer?.disconnect();
      window.removeEventListener("resize", observe);
    };
  }, [file.id, token, retry]);
  const isPdf = file.mimeType === "application/pdf";
  return (
    <div
      className={`media ${!url && !error ? "buffering" : ""}`}
      ref={ref}
      style={isPdf ? { height: "85vh" } : { aspectRatio: ratio }}
      aria-busy={!url && !error}
    >
      {error ? (
        <div className="media-error">
          {error}
          <button onClick={() => setRetry((v) => v + 1)}>Retry page</button>
        </div>
      ) : !url ? (
        <div className="page-loading">
          <span className="page-spinner" />
          <span className="sr-only">Loading page</span>
        </div>
      ) : isPdf ? (
        <iframe title={file.name} src={url} />
      ) : (
        <img
          src={url}
          alt={file.name}
          decoding="async"
          onError={() => {
            setError(
              "Could not load this page. Retry, or reconnect Drive if your session expired.",
            );
            finishLoad.current();
          }}
          onLoad={(e) => {
            finishLoad.current();
            setRatio(
              e.currentTarget.naturalWidth / e.currentTarget.naturalHeight,
            );
          }}
        />
      )}
    </div>
  );
}
function FileContent({ file, token }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const plain =
    /^(text\/(plain|markdown|csv))$/.test(file.mimeType) ||
    /\.(txt|md|csv)$/i.test(file.name);
  useEffect(() => {
    if (!plain) return;
    const controller = new AbortController();
    setLoading(true);
    driveRequest(token, `files/${file.id}`, { alt: "media" }, controller.signal)
      .then(async (response) => {
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024) {
            await reader.cancel();
            throw new Error(
              "This text is too large for the inline reader. Open it in Drive.",
            );
          }
          chunks.push(value);
        }
        return new Blob(chunks).text();
      })
      .then(setText)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [file.id, token, plain]);
  const source = `/api/image?id=${encodeURIComponent(file.id)}`;
  return (
    <section className="file-content">
      <div className="file-heading">
        <h3>{file.name}</h3>
        <a
          href={`https://drive.google.com/file/d/${file.id}/view`}
          target="_blank"
          rel="noreferrer"
        >
          Open in Drive <ArrowUpRight size={14} />
        </a>
      </div>
      {plain ? (
        loading ? (
          <p>Loading document…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <pre>{text}</pre>
        )
      ) : file.mimeType.startsWith("audio/") ? (
        <audio controls preload="metadata" src={source} />
      ) : file.mimeType.startsWith("video/") ? (
        <video controls preload="metadata" src={source} />
      ) : (
        <>
          <iframe
            title={file.name}
            src={`https://drive.google.com/file/d/${file.id}/preview`}
            allow="fullscreen"
          />
          <p className="preview-note">
            If this format cannot be previewed, use Open in Drive to view or
            download it.
          </p>
        </>
      )}
    </section>
  );
}
function App() {
  const [token, setToken] = useState(""),
    [clientId, setClientId] = useState(
      import.meta.env.VITE_GOOGLE_CLIENT_ID ||
        localStorage.getItem("folio-client") ||
        "548264816971-pseuh8l23qtb35ft8oaj6ids4aalofbs.apps.googleusercontent.com",
    ),
    [settings, setSettings] = useState(false);
  const [books, setBooks] = useState([]),
    [selected, setSelected] = useState(null),
    [chapters, setChapters] = useState([]),
    [chapter, setChapter] = useState(null),
    [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("all"),
    [view, setView] = useState("grid");
  const [saved, setSaved] = useState(() => readStorage("folio-saved", [])),
    [progress, setProgress] = useState(() => readStorage("folio-progress", {}));
  const request = useRef(0);
  const saveProgress = (book, ch) =>
    setProgress((p) => {
      const next = {
        ...p,
        [book.id]: { chapterId: ch.id, chapterName: ch.name, at: Date.now() },
      };
      localStorage.setItem("folio-progress", JSON.stringify(next));
      return next;
    });
  async function loadBooks(access = token) {
    const n = ++request.current;
    setLoading(true);
    setError("");
    try {
      const files = await listFolder(access, ROOT);
      if (n === request.current)
        setBooks(files.filter((f) => f.mimeType === FOLDER || readable(f)));
    } catch (e) {
      if (n === request.current) setError(e.message);
    } finally {
      if (n === request.current) setLoading(false);
    }
  }
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    let active = true;
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : {}))
      .then((session) => {
        if (active && session.token) {
          setToken(session.token);
          loadBooks(session.token);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, []);
  function connect() {
    setError("");
    if (!clientId) {
      setSettings(true);
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      setError(
        "Google sign-in is still loading. Please try again, or check your connection.",
      );
      return;
    }
    window.google.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.readonly",
        callback: async (r) => {
          if (r.error) {
            setError(r.error_description || r.error);
            return;
          }
          if (
            !window.google.accounts.oauth2.hasGrantedAllScopes(
              r,
              "https://www.googleapis.com/auth/drive.readonly",
            )
          ) {
            setError("Read-only Drive access is needed to load your books.");
            return;
          }
          try {
            const saved = await fetch("/api/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: r.access_token,
                expiresIn: r.expires_in,
              }),
            });
            if (!saved.ok)
              throw new Error(
                "Could not save your Drive connection. Please try again.",
              );
          } catch (e) {
            setError(e.message);
            return;
          }
          setToken(r.access_token);
          loadBooks(r.access_token);
        },
        error_callback: () =>
          setError("Google sign-in was closed or blocked. Please try again."),
      })
      .requestAccessToken();
  }
  async function disconnect() {
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      setError(
        "Could not clear the saved connection. Please try disconnecting again.",
      );
      return;
    }
    request.current++;
    setToken("");
    setBooks([]);
    setSelected(null);
    setChapter(null);
    setPages([]);
    setError("");
    setLoading(false);
  }
  async function openBook(book) {
    const n = ++request.current;
    setSelected(book);
    setChapter(null);
    setChapters([]);
    setPages([]);
    setLoading(true);
    setError("");
    try {
      if (book.mimeType !== FOLDER) {
        setChapters([book]);
        setChapter(book);
        setPages([book]);
        saveProgress(book, book);
        return;
      }
      const files = await listFolder(token, book.id);
      if (n !== request.current) return;
      const folders = files.filter(
        (f) => f.mimeType === FOLDER && !/^images?$/i.test(f.name),
      );
      setChapters(folders);
      const resume = folders.find((c) => c.id === progress[book.id]?.chapterId);
      if (resume) {
        setChapter(resume);
        const p = await chapterFiles(token, resume.id);
        if (n === request.current) {
          setPages(p);
          saveProgress(book, resume);
        }
      } else if (!folders.length) {
        const p = await chapterFiles(token, book.id);
        if (n === request.current) {
          setChapter(book);
          setPages(p);
          saveProgress(book, book);
        }
      }
    } catch (e) {
      if (n === request.current) setError(e.message);
    } finally {
      if (n === request.current) setLoading(false);
    }
  }
  async function openChapter(ch) {
    const n = ++request.current;
    setChapter(ch);
    setPages([]);
    setError("");
    setLoading(true);
    window.scrollTo(0, 0);
    try {
      const p =
        ch.mimeType === FOLDER ? await chapterFiles(token, ch.id) : [ch];
      if (n === request.current) {
        setPages(p);
        saveProgress(selected, ch);
      }
    } catch (e) {
      if (n === request.current) setError(e.message);
    } finally {
      if (n === request.current) setLoading(false);
    }
  }
  function toggleSave(id) {
    setSaved((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      localStorage.setItem("folio-saved", JSON.stringify(next));
      return next;
    });
  }
  const shown = books.filter(
    (b) =>
      b.name.toLowerCase().includes(query.toLowerCase()) &&
      (tab === "all" ||
        (tab === "saved" && saved.includes(b.id)) ||
        (tab === "recent" && progress[b.id])),
  );
  const lastRead = books
    .filter((b) => progress[b.id])
    .sort((a, b) => progress[b.id].at - progress[a.id].at)[0];
  const chapterIndex = chapters.findIndex((c) => c.id === chapter?.id);
  return (
    <div className={chapter ? "app reading" : "app"}>
      <aside>
        <a
          className="brand"
          href="#"
          onClick={() => {
            request.current++;
            setSelected(null);
            setChapter(null);
            setLoading(false);
          }}
        >
          <BookOpen size={28} />
          <span>
            folio<span className="dot">.</span>
          </span>
        </a>
        <div className="side-label">YOUR SPACE</div>
        {[
          ["all", Library, "All books"],
          ["recent", BookOpen, "Continue reading"],
          ["saved", Bookmark, "Saved books"],
        ].map(([id, Icon, label]) => (
          <button
            key={id}
            className={`nav ${tab === id ? "active" : ""}`}
            onClick={() => {
              request.current++;
              setTab(id);
              setSelected(null);
              setChapter(null);
              setLoading(false);
              setError("");
            }}
          >
            <Icon size={19} />
            {label}
            {id === "all" && token && <small>{books.length}</small>}
          </button>
        ))}
        <div className="side-bottom">
          <div className="drive-note">
            <Cloud size={20} />
            <div>
              Made for your Drive<small>Your books stay yours.</small>
            </div>
          </div>
          <button className="nav" onClick={() => setSettings(true)}>
            <Settings size={18} />
            Connection settings
          </button>
          {token && (
            <button className="nav" onClick={disconnect}>
              <LogOut size={18} />
              Disconnect
            </button>
          )}
          <small className="edition">A LITTLE SPACE TO GET LOST IN.</small>
        </div>
      </aside>
      <main>
        <header>
          <span className="breadcrumb">
            My library {selected && <> / {selected.name}</>}
          </span>
          <div className="header-right">
            <span className={`status ${token ? "connected" : ""}`}>
              <i />
              {token ? "Drive connected" : "Private reading room"}
            </span>
            <button
              aria-label="Connection settings"
              onClick={() => setSettings(true)}
            >
              <Settings size={17} />
            </button>
            <span className="avatar">F</span>
          </div>
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={18} />
            </button>
          </div>
        )}
        {selected ? (
          <>
            <div className="reader-heading">
              <button
                className="back"
                onClick={() => {
                  request.current++;
                  if (
                    chapter &&
                    selected.mimeType === FOLDER &&
                    chapters.length
                  ) {
                    setChapter(null);
                    setPages([]);
                  } else {
                    setSelected(null);
                    setChapter(null);
                  }
                  setLoading(false);
                  setError("");
                }}
              >
                <ArrowLeft size={18} />{" "}
                {chapter ? "Back to books / chapters" : "Back to library"}
              </button>
              <h1>{selected.name}</h1>
              <div className="reader-tools">
                {chapter ? (
                  <>
                    <select
                      aria-label="Select chapter"
                      value={chapter.id}
                      onChange={(e) =>
                        openChapter(
                          chapters.find((c) => c.id === e.target.value),
                        )
                      }
                    >
                      {(chapters.length ? chapters : [chapter]).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span>{pages.length} pages</span>
                  </>
                ) : (
                  <p>Choose a chapter and settle in.</p>
                )}
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://drive.google.com/${selected.mimeType === FOLDER ? "drive/folders/" : "file/d/"}${selected.id}`}
                >
                  View in Drive <ArrowUpRight size={15} />
                </a>
              </div>
            </div>
            {loading ? (
              <div className="empty">Opening your reading room…</div>
            ) : chapter ? (
              <>
                <div className="reading-pages">
                  {pages.map((f) =>
                    f.mimeType.startsWith("image/") ||
                    f.mimeType === "application/pdf" ? (
                      <Media
                        key={`${chapter.id}-${f.id}`}
                        file={f}
                        token={token}
                      />
                    ) : (
                      <FileContent
                        key={`${chapter.id}-${f.id}`}
                        file={f}
                        token={token}
                      />
                    ),
                  )}
                  {!pages.length && (
                    <div className="empty">
                      No readable files found in this chapter. Use “View in
                      Drive” to inspect its contents.
                    </div>
                  )}
                </div>
                <div className="chapter-navigation">
                  <button
                    disabled={chapterIndex <= 0}
                    onClick={() => openChapter(chapters[chapterIndex - 1])}
                  >
                    <ArrowLeft size={18} /> Previous chapter
                  </button>
                  <button
                    disabled={
                      chapterIndex < 0 || chapterIndex >= chapters.length - 1
                    }
                    onClick={() => openChapter(chapters[chapterIndex + 1])}
                  >
                    Next chapter <ArrowRight size={18} />
                  </button>
                </div>
              </>
            ) : (
              <div className="chapter-grid">
                {chapters.map((c) => (
                  <button key={c.id} onClick={() => openChapter(c)}>
                    <BookOpen size={20} />
                    <span>{c.name}</span>
                    {progress[selected.id]?.chapterId === c.id ? (
                      <small>Last read</small>
                    ) : (
                      <ArrowRight size={16} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {token && lastRead && (
              <section className="last-read">
                <div>
                  <span className="eyebrow">LAST READ</span>
                  <h2>{lastRead.name}</h2>
                  <p>{progress[lastRead.id].chapterName}</p>
                </div>
                <button className="primary" onClick={() => openBook(lastRead)}>
                  Continue reading <ArrowRight size={16} />
                </button>
              </section>
            )}
            <section className="collection">
              <div className="collection-title">
                <div>
                  <div className="eyebrow">ON YOUR SHELF</div>
                  <h2>
                    {tab === "saved"
                      ? "Saved for later"
                      : tab === "recent"
                        ? "Your recent reads"
                        : "Your collection"}
                    <sup>{token ? shown.length : "—"}</sup>
                  </h2>
                </div>
                {token && (
                  <button
                    className="refresh"
                    onClick={() => loadBooks()}
                    disabled={loading}
                  >
                    <RefreshCw size={16} /> Refresh library
                  </button>
                )}
              </div>
              <div className="toolbar">
                <div className="tabs">
                  {[
                    ["all", "All books"],
                    ["recent", "Recently read"],
                    ["saved", "Saved"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={tab === id ? "chosen" : ""}
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="search-tools">
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search books"
                      placeholder="Search your books…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <button
                    aria-label="Grid view"
                    className={view === "grid" ? "chosen" : ""}
                    onClick={() => setView("grid")}
                  >
                    <Grid2X2 size={18} />
                  </button>
                  <button
                    aria-label="List view"
                    className={view === "list" ? "chosen" : ""}
                    onClick={() => setView("list")}
                  >
                    <List size={18} />
                  </button>
                </div>
              </div>
              {!token ? (
                <div className="connect-empty">
                  <div className="empty-icon">
                    <Library size={30} />
                  </div>
                  <h3>Your next chapter starts here.</h3>
                  <p>
                    Connect your Google Drive to bring your books onto the
                    shelf.
                    <br />
                    Only you can access the files you have permission to read.
                  </p>
                  <button onClick={connect}>
                    Connect your library <ArrowRight size={16} />
                  </button>
                  <small>READ-ONLY ACCESS · FILES STAY IN GOOGLE DRIVE</small>
                </div>
              ) : loading ? (
                <div className="empty" role="status">
                  Arranging your books…
                </div>
              ) : !shown.length ? (
                <div className="empty">
                  <h3>
                    {query
                      ? "No matching books"
                      : tab === "saved"
                        ? "Your saved shelf is empty"
                        : tab === "recent"
                          ? "Your story starts here"
                          : "This folder has no books yet"}
                  </h3>
                  <p>
                    {query
                      ? "Try a different title."
                      : tab === "saved"
                        ? "Use the bookmark on a book to save it."
                        : tab === "recent"
                          ? "Open a book to start your reading history."
                          : "Add books or folders in Google Drive, then refresh."}
                  </p>
                </div>
              ) : (
                <div className={`books ${view}`}>
                  {shown.map((b, i) => (
                    <article key={b.id}>
                      <button
                        className={`book-cover color-${i % 4}`}
                        onClick={() => openBook(b)}
                      >
                        <small>YOUR DRIVE COLLECTION</small>
                        <BookOpen size={28} />
                        <span>{b.name.replace(/-/g, " ")}</span>
                        <small>
                          {b.mimeType === FOLDER
                            ? "COLLECTED CHAPTERS"
                            : "DIGITAL EDITION"}{" "}
                          <ArrowUpRight size={16} />
                        </small>
                      </button>
                      <div className="book-details">
                        <button onClick={() => openBook(b)}>
                          <h3>{b.name}</h3>
                          <p>
                            {progress[b.id]
                              ? `Continue · ${progress[b.id].chapterName}`
                              : b.mimeType === FOLDER
                                ? "Series · Explore chapters"
                                : "Book · Read now"}
                          </p>
                        </button>
                        <button
                          className={saved.includes(b.id) ? "bookmarked" : ""}
                          aria-label={`${saved.includes(b.id) ? "Unsave" : "Save"} ${b.name}`}
                          onClick={() => toggleSave(b.id)}
                        >
                          <Bookmark
                            size={18}
                            fill={
                              saved.includes(b.id) ? "currentColor" : "none"
                            }
                          />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <footer>
              <span>
                folio. <span>A home for your stories.</span>
              </span>
              <span>Take your time. Stay a while.</span>
            </footer>
          </>
        )}
      </main>
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close settings"
              onClick={() => setSettings(false)}
            >
              <X size={20} />
            </button>
            <Cloud size={28} />
            <h2 id="settings-title">Connect your reading room</h2>
            <p>
              This site uses Google’s read-only authorization to load your
              private books. Your connection is remembered on this browser until
              Google’s access token expires.
            </p>
            <label>
              Google OAuth web client ID
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="…apps.googleusercontent.com"
              />
            </label>
            <p className="hint">
              Enable Google Drive API in your Google Cloud project. Add{" "}
              <code>{location.origin}</code> as an authorized JavaScript origin.
              No client secret is needed.
            </p>
            <button
              className="primary"
              disabled={!clientId.endsWith(".apps.googleusercontent.com")}
              onClick={() => {
                localStorage.setItem("folio-client", clientId.trim());
                setSettings(false);
              }}
            >
              Save connection settings <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
