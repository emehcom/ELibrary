
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowLeft,
  Minus,
  Plus,
  Volume2,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Book } from "../types";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type SpeechChunk = {
  page: number;
  text: string;
};

type SpeechStatus = "idle" | "speaking" | "paused";

type ActiveReadingContext = {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  currentPage: number;
  pageText: string;
};

const MAX_SPEECH_CHUNK_LENGTH = 1400;

function splitTextIntoChunks(
  text: string,
  maxLength = MAX_SPEECH_CHUNK_LENGTH
) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) return [];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(". ", maxLength);

    if (splitAt < maxLength * 0.5) {
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }

    if (splitAt < 1) splitAt = maxLength;

    const end = splitAt + (remaining[splitAt] === "." ? 1 : 0);

    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }

  if (remaining) chunks.push(remaining);

  return chunks;
}

function publishReadingContext(
  context: ActiveReadingContext | null
) {
  window.dispatchEvent(
    new CustomEvent("elibrary:reading-context", {
      detail: context,
    })
  );
}

export default function Reader() {
  const { id } = useParams();

  const [book, setBook] = useState<Book | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [stageWidth, setStageWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(true);

  const [speechStatus, setSpeechStatus] =
    useState<SpeechStatus>("idle");

  const [speechPreparing, setSpeechPreparing] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollThumbHeight, setScrollThumbHeight] = useState(18);

  const stageRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());

  const speechQueueRef = useRef<SpeechChunk[]>([]);
  const speechIndexRef = useRef(0);
  const speechSessionRef = useRef(0);

  const pointerStartRef = useRef<{
    x: number;
    y: number;
  } | null>(null);

  const fastScrollDraggingRef = useRef(false);
  const fastScrollTrackRef = useRef<HTMLDivElement>(null);

  const stopSpeaking = useCallback(() => {
  // Invalidate any currently running speech callback.
  speechSessionRef.current += 1;

  window.speechSynthesis.cancel();

  speechQueueRef.current = [];
  speechIndexRef.current = 0;

  setSpeechStatus("idle");
  setSpeechPreparing(false);
  setSpeechError("");
}, []);

  useEffect(() => {
    let active = true;

    async function load() {
      stopSpeaking();

      pdfRef.current = null;
      pageRefs.current.clear();

      setLoading(true);
      setError("");
      setSpeechError("");
      setUrl("");
      setBook(null);
      setNumPages(0);
      setPageNumber(1);
      setPdfLoading(true);
      setControlsVisible(true);

      if (!id) {
        setError("Book not found.");
        setLoading(false);
        return;
      }

      const { data: found, error: findError } =
        await supabase
          .from("books")
          .select("*")
          .eq("id", id)
          .eq("status", "published")
          .maybeSingle();

      if (!active) return;

      if (findError || !found) {
        setError(
          findError?.message || "This book is not available."
        );
        setLoading(false);
        return;
      }

      const item = found as Book;

      setBook(item);

      if (!item.allow_reading) {
        setError(
          "The uploader has not enabled online reading for this book."
        );
        setLoading(false);
        return;
      }

      const { data, error: signedError } =
        await supabase.functions.invoke("get-book-url", {
          body: {
            bookId: item.id,
            action: "read",
          },
        });

      if (!active) return;

      if (signedError || !data?.signedUrl) {
        setError(
          signedError?.message ||
            "Could not prepare the PDF."
        );
      } else {
        setUrl(data.signedUrl);
      }

      setLoading(false);
    }

    void load();

    return () => {
      active = false;
      stopSpeaking();
      publishReadingContext(null);
    };
  }, [id, stopSpeaking]);

  useEffect(() => {
    const element = stageRef.current;

    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [url, loading]);

  const speakChunk = useCallback(
    (index: number, session: number) => {
      const chunk = speechQueueRef.current[index];

      if (
        !chunk ||
        session !== speechSessionRef.current
      ) {
        if (session === speechSessionRef.current) {
          speechQueueRef.current = [];
          speechIndexRef.current = 0;
          setSpeechStatus("idle");
        }

        return;
      }

      speechIndexRef.current = index;
      setPageNumber(chunk.page);

      pageRefs.current
        .get(chunk.page)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

      const utterance = new SpeechSynthesisUtterance(
        chunk.text
      );

      utterance.rate = 1;
      utterance.pitch = 1;

      utterance.onend = () => {
        if (session === speechSessionRef.current) {
          speakChunk(index + 1, session);
        }
      };

      utterance.onerror = (event) => {
        if (session !== speechSessionRef.current) return;

        if (
          event.error !== "canceled" &&
          event.error !== "interrupted"
        ) {
          setSpeechError(
            "Audio reading stopped unexpectedly. Try again."
          );

          speechQueueRef.current = [];
          speechIndexRef.current = 0;
          setSpeechStatus("idle");
        }
      };

      window.speechSynthesis.speak(utterance);
    },
    []
  );

  const startSpeaking = useCallback(async () => {
    if (!pdfRef.current || speechPreparing) return;

    if (
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      setSpeechError(
        "Your browser does not support audio reading."
      );
      return;
    }

    setSpeechError("");
    setSpeechPreparing(true);

    try {
      const pdf = pdfRef.current;
      const queue: SpeechChunk[] = [];

      for (
        let pageIndex = 1;
        pageIndex <= pdf.numPages;
        pageIndex += 1
      ) {
        const page = await pdf.getPage(pageIndex);
        const content = await page.getTextContent();

        const pageText = content.items
          .map((item) =>
            "str" in item ? item.str : ""
          )
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        for (const chunk of splitTextIntoChunks(pageText)) {
          queue.push({
            page: pageIndex,
            text: chunk,
          });
        }
      }

      if (!queue.length) {
        setSpeechError(
          "No selectable text was found. Scanned PDFs need OCR before they can be read aloud."
        );

        setSpeechPreparing(false);
        return;
      }

      speechQueueRef.current = queue;
      speechIndexRef.current = 0;

      window.speechSynthesis.cancel();

      const session = ++speechSessionRef.current;

      setSpeechPreparing(false);
      setSpeechStatus("speaking");

      speakChunk(0, session);
    } catch (cause) {
      console.error(
        "Could not extract PDF text:",
        cause
      );

      setSpeechError(
        "Could not prepare this PDF for audio reading."
      );

      setSpeechPreparing(false);
      setSpeechStatus("idle");
    }
  }, [speechPreparing, speakChunk]);

  const pauseOrResume = useCallback(() => {
  if (!("speechSynthesis" in window)) return;

  const synthesis = window.speechSynthesis;

  if (synthesis.speaking && !synthesis.paused) {
    synthesis.pause();
    setSpeechStatus("paused");
  } else if (synthesis.paused) {
    synthesis.resume();
    setSpeechStatus("speaking");
  }
}, []);

  const handleAudioButtonClick = useCallback(() => {
    if (speechPreparing) return;

    if (speechStatus === "idle") {
      void startSpeaking();
    } else {
      pauseOrResume();
    }
  }, [
    speechPreparing,
    speechStatus,
    startSpeaking,
    pauseOrResume,
  ]);

  const restartSpeaking = useCallback(() => {
  if (!speechQueueRef.current.length) return;

  // Invalidate the previous utterance before cancelling it.
  const session = ++speechSessionRef.current;

  window.speechSynthesis.cancel();

  speechIndexRef.current = 0;
  setSpeechError("");
  setSpeechPreparing(false);
  setSpeechStatus("speaking");

  // Give the browser time to clear the previous speech session.
  window.setTimeout(() => {
    if (session === speechSessionRef.current) {
      speakChunk(0, session);
    }
  }, 150);
}, [speakChunk]);

  const onDocumentLoadSuccess = useCallback(
    (pdf: PDFDocumentProxy) => {
      pdfRef.current = pdf;
      setNumPages(pdf.numPages);
      setPageNumber(1);
      setPdfLoading(false);
      setError("");
    },
    []
  );

  const onDocumentLoadError = useCallback(
    (cause: Error) => {
      console.error("PDF rendering failed:", cause);

      pdfRef.current = null;
      setPdfLoading(false);

      setError(
        "The PDF could not be displayed. Check your connection and try again."
      );
    },
    []
  );

  const handleStageScroll = useCallback(() => {
    const stage = stageRef.current;

    if (!stage) return;

    const maxScroll = Math.max(
      1,
      stage.scrollHeight - stage.clientHeight
    );

    setScrollProgress(stage.scrollTop / maxScroll);

    setScrollThumbHeight(
      Math.max(
        9,
        (stage.clientHeight / stage.scrollHeight) * 100
      )
    );

    let closestPage = 1;
    let closestDistance = Number.POSITIVE_INFINITY;

    pageRefs.current.forEach((element, page) => {
      const distance = Math.abs(
        element.getBoundingClientRect().top -
          stage.getBoundingClientRect().top
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = page;
      }
    });

    setPageNumber(closestPage);
  }, []);

  useEffect(() => {
    if (
      !book ||
      !url ||
      pdfLoading ||
      !pdfRef.current ||
      !pageNumber
    ) {
      return;
    }

    let cancelled = false;

    async function updateContext() {
      try {
        const page =
          await pdfRef.current!.getPage(pageNumber);

        const content = await page.getTextContent();

        const pageText = content.items
          .map((item) =>
            "str" in item ? item.str : ""
          )
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        if (cancelled) return;

        publishReadingContext({
          bookId: book!.id,
          bookTitle: book!.title,
          bookAuthor: book!.author ?? "Unknown author",
          currentPage: pageNumber,
          pageText: pageText.slice(0, 12000),
        });
      } catch (cause) {
        console.error(
          "Could not extract current page for Favour:",
          cause
        );
      }
    }

    void updateContext();

    return () => {
      cancelled = true;
    };
  }, [book, url, pdfLoading, pageNumber]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("elibrary:reader-controls", {
        detail: controlsVisible,
      })
    );
  }, [controlsVisible]);

  useEffect(
    () => () => {
      publishReadingContext(null);

      window.dispatchEvent(
        new CustomEvent("elibrary:reader-controls", {
          detail: true,
        })
      );
    },
    []
  );

  function handleStagePointerDown(
    event: PointerEvent<HTMLDivElement>
  ) {
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handleStageClick(
    event: MouseEvent<HTMLDivElement>
  ) {
    if (
      event.target instanceof Element &&
      event.target.closest(".reader-overlay-control")
    ) {
      return;
    }

    const start = pointerStartRef.current;
    pointerStartRef.current = null;

    if (!start) return;

    if (
      Math.hypot(
        event.clientX - start.x,
        event.clientY - start.y
      ) > 10
    ) {
      return;
    }

    setControlsVisible((current) => !current);
  }

  function updateFastScroll(clientY: number) {
    const stage = stageRef.current;
    const track = fastScrollTrackRef.current;

    if (!stage || !track) return;

    const rect = track.getBoundingClientRect();

    const fraction = Math.max(
      0,
      Math.min(1, (clientY - rect.top) / rect.height)
    );

    stage.scrollTop =
      fraction *
      Math.max(
        0,
        stage.scrollHeight - stage.clientHeight
      );
  }

  function handleFastScrollPointerDown(
    event: PointerEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    fastScrollDraggingRef.current = true;

    event.currentTarget.setPointerCapture(
      event.pointerId
    );

    updateFastScroll(event.clientY);
  }

  function handleFastScrollPointerMove(
    event: PointerEvent<HTMLDivElement>
  ) {
    if (!fastScrollDraggingRef.current) return;

    event.stopPropagation();
    updateFastScroll(event.clientY);
  }

  function handleFastScrollPointerUp(
    event: PointerEvent<HTMLDivElement>
  ) {
    fastScrollDraggingRef.current = false;

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    }
  }

  const pageWidth = Math.max(1, stageWidth * scale);

  return (
    <div className="reader-page reader-page-modern">
      {controlsVisible && pageNumber === 1 && (
        <header className="reader-toolbar reader-toolbar-modern">
          <Link
            to={`/books/${id}`}
            className="reader-back reader-back-modern"
            aria-label="Back to book details"
          >
            <ArrowLeft size={18} />
          </Link>

          <div className="reader-title reader-title-modern">
            {book?.title || "PDF reader"}
          </div>

          <div className="reader-controls reader-controls-modern">
            <button
              className="icon-button"
              onClick={() =>
                setScale((value) =>
                  Math.max(0.6, value - 0.1)
                )
              }
              title="Zoom out"
              aria-label="Zoom out"
              disabled={!url}
            >
              <Minus size={17} />
            </button>

            <span className="zoom-value">
              {Math.round(scale * 100)}%
            </span>

            <button
              className="icon-button"
              onClick={() =>
                setScale((value) =>
                  Math.min(1.6, value + 0.1)
                )
              }
              title="Zoom in"
              aria-label="Zoom in"
              disabled={!url}
            >
              <Plus size={17} />
            </button>

            <span className="reader-toolbar-divider" />

            <button
              className="icon-button reader-audio-button"
              onClick={handleAudioButtonClick}
              disabled={
                !url || pdfLoading || speechPreparing
              }
              title={
                speechPreparing
                  ? "Preparing audio"
                  : speechStatus === "idle"
                    ? "Read the entire PDF aloud"
                    : speechStatus === "paused"
                      ? "Resume reading"
                      : "Pause reading"
              }
              aria-label={
                speechPreparing
                  ? "Preparing PDF audio"
                  : speechStatus === "idle"
                    ? "Read PDF aloud"
                    : speechStatus === "paused"
                      ? "Resume PDF reading"
                      : "Pause PDF reading"
              }
            >
              {speechPreparing ? (
                <span className="reader-audio-loading" />
              ) : speechStatus === "idle" ? (
                <Volume2 size={21} />
              ) : speechStatus === "paused" ? (
                <Play size={21} />
              ) : (
                <Pause size={21} />
              )}
            </button>
          </div>
        </header>
      )}

      {loading ? (
        <div className="screen-center">
          <div className="spinner" />
          <p>Preparing your reading space…</p>
        </div>
      ) : error && !url ? (
        <div className="empty-state reader-error-state">
          <h3>Unable to open this book</h3>
          <p>{error}</p>

          <Link
            className="button button-secondary"
            to="/books"
          >
            Back to books
          </Link>
        </div>
      ) : (
        <div className="reader-content">
          {pdfLoading && (
            <div className="pdf-loading reader-loading">
              <div className="spinner" />
              <p>Loading PDF for online reading…</p>
            </div>
          )}

          <div
            className={`pdf-stage pdf-stage-continuous${
              controlsVisible
                ? ""
                : " reader-controls-hidden"
            }`}
            ref={stageRef}
            onScroll={handleStageScroll}
            onPointerDown={handleStagePointerDown}
            onClick={handleStageClick}
          >
            {url && (
              <Document
                file={url}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading=""
                error=""
                noData="No PDF was provided."
              >
                {numPages > 0 &&
                  stageWidth > 0 &&
                  Array.from(
                    { length: numPages },
                    (_, index) => {
                      const page = index + 1;

                      return (
                        <div
                          className="pdf-page-wrap"
                          key={page}
                          ref={(element) => {
                            if (element) {
                              pageRefs.current.set(
                                page,
                                element
                              );
                            } else {
                              pageRefs.current.delete(page);
                            }
                          }}
                        >
                          <Page
                            pageNumber={page}
                            width={pageWidth}
                            renderTextLayer
                            renderAnnotationLayer
                            loading={
                              <div className="pdf-page-loading">
                                Rendering page {page}…
                              </div>
                            }
                          />

                          <span className="pdf-page-number">
                            {page}
                          </span>
                        </div>
                      );
                    }
                  )}
              </Document>
            )}
          </div>

          {controlsVisible && numPages > 1 && (
            <div
              className="reader-fast-scroll reader-overlay-control"
              ref={fastScrollTrackRef}
              onPointerDown={handleFastScrollPointerDown}
              onPointerMove={handleFastScrollPointerMove}
              onPointerUp={handleFastScrollPointerUp}
              onPointerCancel={handleFastScrollPointerUp}
              role="scrollbar"
              aria-label="Fast PDF page navigation"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(
                scrollProgress * 100
              )}
              tabIndex={0}
              onKeyDown={(event) => {
                const stage = stageRef.current;

                if (!stage) return;

                if (event.key === "ArrowDown") {
                  stage.scrollBy({
                    top: stage.clientHeight * 0.6,
                  });
                }

                if (event.key === "ArrowUp") {
                  stage.scrollBy({
                    top: -stage.clientHeight * 0.6,
                  });
                }
              }}
            >
              <span
                className="reader-fast-scroll-thumb"
                style={{
                  height: `${scrollThumbHeight}%`,
                  top: `${
                    scrollProgress *
                    (100 - scrollThumbHeight)
                  }%`,
                }}
              />
            </div>
          )}

          {speechStatus !== "idle" && controlsVisible && (
  <div
    className="reader-speech-extra reader-overlay-control"
    onPointerDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
  >
    <button
      type="button"
      onClick={pauseOrResume}
      title={speechStatus === "paused" ? "Resume reading" : "Pause reading"}
      aria-label={speechStatus === "paused" ? "Resume reading" : "Pause reading"}
    >
      {speechStatus === "paused" ? <Play size={18} /> : <Pause size={18} />}
    </button>

    <button
      type="button"
      onClick={restartSpeaking}
      title="Restart from beginning"
      aria-label="Restart reading"
    >
      <RotateCcw size={18} />
    </button>

    <button
      type="button"
      onClick={stopSpeaking}
      title="Exit audio reading"
      aria-label="Exit audio reading"
    >
      <X size={18} />
    </button>
  </div>
)}

          {speechPreparing && controlsVisible && (
            <div className="reader-speech-preparing reader-overlay-control">
              Preparing full PDF audio…
            </div>
          )}

          {speechError && controlsVisible && (
            <div
              className="pdf-speech-error reader-overlay-control"
              role="alert"
            >
              {speechError}

              <button
                type="button"
                onClick={() => setSpeechError("")}
                aria-label="Dismiss audio error"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
