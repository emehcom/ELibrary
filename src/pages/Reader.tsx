import { useCallback, useEffect, useRef, useState } from "react";
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
  import.meta.url,
).toString();

type SpeechChunk = { page: number; text: string };
type SpeechStatus = "idle" | "speaking" | "paused";
type ActiveReadingContext = {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  currentPage: number;
  pageText: string;
};

const MAX_SPEECH_CHUNK_LENGTH = 1100;

function splitTextIntoChunks(text: string, maxLength = MAX_SPEECH_CHUNK_LENGTH) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(". ", maxLength);
    if (splitAt < maxLength * 0.45) {
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

function publishReadingContext(context: ActiveReadingContext | null) {
  window.dispatchEvent(
    new CustomEvent("elibrary:reading-context", { detail: context }),
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
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>("idle");
  const [speechPreparing, setSpeechPreparing] = useState(false);
  const [speechError, setSpeechError] = useState("");

  const stageRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const speechQueueRef = useRef<SpeechChunk[]>([]);
  const speechSessionRef = useRef(0);

  const stopSpeaking = useCallback(() => {
    // Invalidate callbacks belonging to the previous speech session.
    speechSessionRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    speechQueueRef.current = [];
    setSpeechStatus("idle");
    setSpeechPreparing(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadBook() {
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
      setScale(1);

      if (!id) {
        setError("Book not found.");
        setLoading(false);
        return;
      }

      const { data: found, error: findError } = await supabase
        .from("books")
        .select("*")
        .eq("id", id)
        .eq("status", "published")
        .maybeSingle();

      if (!active) return;
      if (findError || !found) {
        setError(findError?.message || "This book is not available.");
        setLoading(false);
        return;
      }

      const item = found as Book;
      setBook(item);

      if (!item.allow_reading) {
        setError("The uploader has not enabled online reading for this book.");
        setLoading(false);
        return;
      }

      const { data, error: signedError } = await supabase.functions.invoke(
        "get-book-url",
        { body: { bookId: item.id, action: "read" } },
      );

      if (!active) return;
      if (signedError || !data?.signedUrl) {
        setError(signedError?.message || "Could not prepare the PDF.");
      } else {
        setUrl(data.signedUrl);
      }
      setLoading(false);
    }

    void loadBook();
    return () => {
      active = false;
      stopSpeaking();
      publishReadingContext(null);
    };
  }, [id, stopSpeaking]);

  // Measure the actual PDF viewport. The observer is reattached when the PDF loads.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateWidth = () => setStageWidth(stage.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [url, loading, pdfLoading]);

  const speakChunk = useCallback((index: number, session: number) => {
    const chunk = speechQueueRef.current[index];

    if (session !== speechSessionRef.current) return;
    if (!chunk) {
      speechQueueRef.current = [];
      setSpeechStatus("idle");
      return;
    }

    setPageNumber(chunk.page);
    pageRefs.current.get(chunk.page)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    const utterance = new SpeechSynthesisUtterance(chunk.text);
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => {
      if (session === speechSessionRef.current) {
        speakChunk(index + 1, session);
      }
    };

    utterance.onerror = (event) => {
      if (session !== speechSessionRef.current) return;
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setSpeechError("Audio reading stopped unexpectedly. Try again.");
        speechQueueRef.current = [];
        setSpeechStatus("idle");
      }
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const startSpeaking = useCallback(async () => {
    if (!pdfRef.current || speechPreparing || pdfLoading) return;
    if (!("speechSynthesis" in window)) {
      setSpeechError("This browser does not support audio reading.");
      return;
    }

    const session = ++speechSessionRef.current;
    setSpeechError("");
    setSpeechPreparing(true);

    try {
      const pdf = pdfRef.current;
      const queue: SpeechChunk[] = [];

      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
        if (session !== speechSessionRef.current) return;

        const page = await pdf.getPage(pageIndex);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        for (const chunk of splitTextIntoChunks(pageText)) {
          queue.push({ page: pageIndex, text: chunk });
        }
      }

      if (session !== speechSessionRef.current) return;

      if (!queue.length) {
        setSpeechError(
          "No selectable text was found. Scanned PDFs need OCR before they can be read aloud.",
        );
        setSpeechPreparing(false);
        return;
      }

      speechQueueRef.current = queue;
      window.speechSynthesis.cancel();
      setSpeechPreparing(false);
      setSpeechStatus("speaking");
      speakChunk(0, session);
    } catch (cause) {
      console.error("Could not extract PDF text for audio reading:", cause);
      if (session === speechSessionRef.current) {
        setSpeechError("Could not prepare this PDF for audio reading.");
        setSpeechPreparing(false);
        setSpeechStatus("idle");
      }
    }
  }, [pdfLoading, speechPreparing, speakChunk]);

  const pauseOrResume = useCallback(() => {
    if (!("speechSynthesis" in window)) return;

    if (speechStatus === "speaking") {
      window.speechSynthesis.pause();
      setSpeechStatus("paused");
    } else if (speechStatus === "paused") {
      window.speechSynthesis.resume();
      setSpeechStatus("speaking");
    }
  }, [speechStatus]);

  const restartSpeaking = useCallback(() => {
    if (!speechQueueRef.current.length) return;
    window.speechSynthesis.cancel();
    const session = ++speechSessionRef.current;
    setSpeechError("");
    setSpeechStatus("speaking");
    speakChunk(0, session);
  }, [speakChunk]);

  const onDocumentLoadSuccess = useCallback((pdf: PDFDocumentProxy) => {
    pdfRef.current = pdf;
    setNumPages(pdf.numPages);
    setPageNumber(1);
    setPdfLoading(false);
    setError("");
  }, []);

  const onDocumentLoadError = useCallback((cause: Error) => {
    console.error("PDF rendering failed:", cause);
    pdfRef.current = null;
    setPdfLoading(false);
    setError("The PDF could not be displayed. Check your connection and try again.");
  }, []);

  const handleStageScroll = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const stageTop = stage.getBoundingClientRect().top;
    let closestPage = 1;
    let closestDistance = Number.POSITIVE_INFINITY;

    pageRefs.current.forEach((element, page) => {
      const distance = Math.abs(element.getBoundingClientRect().top - stageTop);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = page;
      }
    });

    setPageNumber((current) => (current === closestPage ? current : closestPage));
  }, []);

  useEffect(() => {
    if (!book || !url || pdfLoading || !pdfRef.current || !pageNumber) return;

    let cancelled = false;

    async function updateReadingContext() {
      try {
        const page = await pdfRef.current!.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
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
        console.error("Could not extract current page for Favour:", cause);
      }
    }

    void updateReadingContext();
    return () => {
      cancelled = true;
    };
  }, [book, url, pdfLoading, pageNumber]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("elibrary:reader-controls", { detail: true }),
    );
    return () => {
      publishReadingContext(null);
      window.dispatchEvent(
        new CustomEvent("elibrary:reader-controls", { detail: true }),
      );
    };
  }, []);

  const pageWidth = Math.max(1, stageWidth * scale);

  return (
    <div className="reader-page reader-page-modern">
      {loading ? (
        <div className="screen-center">
          <div className="spinner" />
          <p>Preparing your reading space…</p>
        </div>
      ) : error && !url ? (
        <div className="empty-state reader-error-state">
          <h3>Unable to open this book</h3>
          <p>{error}</p>
          <Link className="button button-secondary" to="/books">
            Back to books
          </Link>
        </div>
      ) : (
        <>
          <header className="reader-toolbar reader-toolbar-modern">
            <Link
              to={`/books/${id}`}
              className="reader-back reader-back-modern reader-overlay-control"
              aria-label="Back to book details"
              title="Back to book details"
            >
              <ArrowLeft size={19} />
            </Link>

            <div className="reader-title reader-title-modern">
              {book?.title || "PDF reader"}
            </div>

            <div className="reader-controls reader-controls-modern">
              <button
                type="button"
                className="icon-button reader-overlay-control"
                onClick={() => setScale((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))}
                title="Zoom out"
                aria-label="Zoom out"
                disabled={!url || pdfLoading || scale <= 0.6}
              >
                <Minus size={17} />
              </button>

              <span className="zoom-value" aria-live="polite">
                {Math.round(scale * 100)}%
              </span>

              <button
                type="button"
                className="icon-button reader-overlay-control"
                onClick={() => setScale((value) => Math.min(1.8, Number((value + 0.1).toFixed(2))))}
                title="Zoom in"
                aria-label="Zoom in"
                disabled={!url || pdfLoading || scale >= 1.8}
              >
                <Plus size={17} />
              </button>

              <span className="reader-toolbar-divider" />

              <button
                type="button"
                className="icon-button reader-audio-button reader-overlay-control"
                onClick={() => {
                  if (speechStatus === "idle") void startSpeaking();
                  else pauseOrResume();
                }}
                disabled={!url || pdfLoading || speechPreparing}
                title={
                  speechPreparing
                    ? "Preparing audio"
                    : speechStatus === "idle"
                      ? "Read PDF aloud"
                      : speechStatus === "paused"
                        ? "Resume reading"
                        : "Pause reading"
                }
                aria-label={
                  speechStatus === "idle"
                    ? "Read PDF aloud"
                    : speechStatus === "paused"
                      ? "Resume reading"
                      : "Pause reading"
                }
              >
                {speechStatus === "idle" ? (
                  <Volume2 size={21} />
                ) : speechStatus === "paused" ? (
                  <Play size={21} />
                ) : (
                  <Pause size={21} />
                )}
              </button>

              {(speechStatus !== "idle" || speechPreparing) && (
                <>
                  <button
                    type="button"
                    className="icon-button reader-audio-extra reader-overlay-control"
                    onClick={restartSpeaking}
                    disabled={speechPreparing || !speechQueueRef.current.length}
                    title="Restart reading"
                    aria-label="Restart reading"
                  >
                    <RotateCcw size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button reader-audio-extra reader-audio-exit reader-overlay-control"
                    onClick={() => {
                      stopSpeaking();
                      setSpeechError("");
                    }}
                    title="Exit read aloud mode"
                    aria-label="Exit read aloud mode"
                  >
                    <X size={18} />
                  </button>
                </>
              )}
            </div>
          </header>

          <main className="reader-content">
            {pdfLoading && (
              <div className="pdf-loading reader-loading">
                <div className="spinner" />
                <p>Loading PDF for online reading…</p>
              </div>
            )}

            <div
              className="pdf-stage pdf-stage-continuous"
              ref={stageRef}
              onScroll={handleStageScroll}
              aria-label="PDF pages. Swipe or scroll vertically to read."
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
                  {numPages > 0 && stageWidth > 0 &&
                    Array.from({ length: numPages }, (_, index) => {
                      const page = index + 1;
                      return (
                        <div
                          className="pdf-page-wrap"
                          key={page}
                          ref={(element) => {
                            if (element) pageRefs.current.set(page, element);
                            else pageRefs.current.delete(page);
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
                          <span className="pdf-page-number">{page}</span>
                        </div>
                      );
                    })}
                </Document>
              )}
            </div>

            {speechError && (
              <div className="pdf-speech-error reader-overlay-control" role="alert">
                {speechError}
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}
