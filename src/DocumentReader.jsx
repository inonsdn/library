import React, { lazy, Suspense, useState } from "react";
import { documentType, stored, remember } from "./document-settings";
const PdfReader = lazy(() => import("./PdfReader"));
const EpubReader = lazy(() => import("./EpubReader"));
export default function DocumentReader({ file, token, onReconnect }) {
  const [mode, setMode] = useState(() =>
    stored("folio-document-mode", "vertical") === "horizontal"
      ? "horizontal"
      : "vertical",
  );
  const [scale, setScale] = useState(100);
  const [retry, setRetry] = useState(0);
  const type = documentType(file);
  return (
    <section
      className={`document-reader ${mode}`}
      aria-label={`${type?.toUpperCase()} reader`}
    >
      <div className="document-toolbar">
        <span className="document-name">{file.name}</span>
        <div
          className="reading-mode"
          role="group"
          aria-label="Reading direction"
        >
          <button
            aria-pressed={mode === "vertical"}
            onClick={() => {
              setMode("vertical");
              remember("folio-document-mode", "vertical");
            }}
          >
            Vertical scroll
          </button>
          <button
            aria-pressed={mode === "horizontal"}
            onClick={() => {
              setMode("horizontal");
              remember("folio-document-mode", "horizontal");
            }}
          >
            Horizontal pages
          </button>
        </div>
        <label className="document-scale">
          {type === "pdf" ? "Zoom" : "Text size"}
          <select
            aria-label={type === "pdf" ? "PDF zoom" : "EPUB text size"}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          >
            {[75, 90, 100, 110, 125, 150, 175, 200].map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <Suspense
        fallback={
          <div className="document-loading" role="status">
            Opening {type?.toUpperCase()} reader…
          </div>
        }
      >
        {type === "pdf" ? (
          <PdfReader
            key={`${file.id}-${retry}`}
            file={file}
            token={token}
            mode={mode}
            scale={scale}
            onReconnect={onReconnect}
            onRetry={() => setRetry((r) => r + 1)}
          />
        ) : (
          <EpubReader
            key={`${file.id}-${retry}`}
            file={file}
            token={token}
            mode={mode}
            scale={scale}
            onReconnect={onReconnect}
            onRetry={() => setRetry((r) => r + 1)}
          />
        )}
      </Suspense>
    </section>
  );
}
