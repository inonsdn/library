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
const readStorage = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
function Media({ file, token }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    let active = true,
      objectUrl;
    const controller = new AbortController();
    setUrl("");
    setError("");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          driveRequest(
            token,
            `files/${file.id}`,
            { alt: "media" },
            controller.signal,
          )
            .then((r) => r.blob())
            .then((blob) => {
              objectUrl = URL.createObjectURL(blob);
              if (active) setUrl(objectUrl);
              else URL.revokeObjectURL(objectUrl);
            })
            .catch((e) => {
              if (active && e.name !== "AbortError") setError(e.message);
            });
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(ref.current);
    return () => {
      active = false;
      controller.abort();
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, token, retry]);
  return (
    <div className="media" ref={ref}>
      {error ? (
        <div className="media-error">
          {error}
          <button onClick={() => setRetry((v) => v + 1)}>Retry page</button>
        </div>
      ) : !url ? (
        <div className="page-loading">Loading {file.name}…</div>
      ) : file.mimeType === "application/pdf" ? (
        <iframe title={file.name} src={url} />
      ) : (
        <img src={url} alt={file.name} />
      )}
    </div>
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
        callback: (r) => {
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
          setToken(r.access_token);
          loadBooks(r.access_token);
        },
        error_callback: () =>
          setError("Google sign-in was closed or blocked. Please try again."),
      })
      .requestAccessToken();
  }
  function disconnect() {
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
                  {pages.map((f) => (
                    <Media key={f.id} file={f} token={token} />
                  ))}
                  {!pages.length && (
                    <div className="empty">
                      No images or PDFs found in this chapter. Use “View in
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
            <section className="hero">
              <div className="eyebrow">
                <span /> THE PERSONAL LIBRARY
              </div>
              <h1>
                A good book.
                <br />A little <em>quiet.</em>
              </h1>
              <p>
                All your stories, in one considered space.
                <br />
                Pick up where you left off, or begin somewhere new.
              </p>
              {!token ? (
                <button className="primary" onClick={connect}>
                  Connect Google Drive <ArrowUpRight size={18} />
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={() => {
                    const b =
                      books
                        .filter((b) => progress[b.id])
                        .sort(
                          (a, b) => progress[b.id].at - progress[a.id].at,
                        )[0] || books[0];
                    if (b) openBook(b);
                  }}
                  disabled={!books.length}
                >
                  Find your next read <ArrowRight size={18} />
                </button>
              )}
              <div className="hero-art" aria-hidden="true">
                <div className="orbit" />
                <div className="art-book back-book">
                  <span>
                    THE ART
                    <br />
                    OF SLOW
                    <br />
                    LIVING
                  </span>
                </div>
                <div className="art-book front-book">
                  <small>THE FOLIO COLLECTION</small>
                  <span>
                    Somewhere
                    <br />
                    <em>between</em>
                    <br />
                    the pages.
                  </span>
                  <div className="sun" />
                  <small>A PLACE TO RETURN TO</small>
                </div>
                <span className="art-caption">
                  LESS SCROLLING. MORE STORIES.
                </span>
              </div>
            </section>
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
                          : "Add folders, images, or PDFs in Google Drive, then refresh."}
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
              private books. Your access token stays in memory.
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
