import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowLeft,
  Download,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
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

function splitTextIntoChunks(text: string, maxLength = MAX_SPEECH_CHUNK_LENGTH) {
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

    const includeBoundary = remaining[splitAt] === ". " ? 1 : 0;
    chunks.push(remaining.slice(0, splitAt + includeBoundary).trim());
    remaining = remaining.slice(splitAt + includeBoundary).trim();
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
  const speechQueueRef = useRef<SpeechChunk[]>([]);
  const speechIndexRef = useRef(0);
  const speechSessionRef = useRef(0);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, url]);

  const stopSpeaking = useCallback(() => {
    speechSessionRef.current += 1;
    window.speechSynthesis?.cancel();
    speechQueueRef.current = [];
    speechIndexRef.current = 0;
    setSpeechStatus("idle");
    setSpeechPreparing(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      stopSpeaking();
      pdfRef.current = null;
      publishReadingContext(null);
      setLoading(true);
      setError("");
      setSpeechError("");
      setUrl("");
      setBook(null);
      setPdfLoading(true);

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
        setPdfLoading(true);
        setPageNumber(1);
        setNumPages(0);
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

  // Publish the text and metadata for the page currently displayed in Reader.
  useEffect(() => {
    let cancelled = false;

    async function updateReadingContext() {
      const pdf = pdfRef.current;

      if (!book || !url || pdfLoading || !pdf) {
        publishReadingContext(null);
        return;
      }

      try {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        if (cancelled) return;

        publishReadingContext({
          bookId: book.id,
          bookTitle: book.title,
          bookAuthor: book.author ?? "Unknown author",
          currentPage: pageNumber,
          pageText: pageText.slice(0, 12000),
        });
      } catch (cause) {
        if (!cancelled) {
          console.error("Could not extract the current reading page:", cause);
          publishReadingContext({
            bookId: book.id,
            bookTitle: book.title,
            bookAuthor: book.author ?? "Unknown author",
            currentPage: pageNumber,
            pageText: "",
          });
        }
      }
    }

    void updateReadingContext();

    return () => {
      cancelled = true;
    };
  }, [book, url, pdfLoading, pageNumber]);

  const speakChunk = useCallback((index: number, session: number) => {
    const chunk = speechQueueRef.current[index];

    if (!chunk || session !== speechSessionRef.current) {
      if (session === speechSessionRef.current) {
        setSpeechStatus("idle");
        speechQueueRef.current = [];
        speechIndexRef.current = 0;
      }
      return;
    }

    speechIndexRef.current = index;
    setPageNumber(chunk.page);

    const utterance = new SpeechSynthesisUtterance(chunk.text);
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => {
      if (session !== speechSessionRef.current) return;
      speakChunk(index + 1, session);
    };

    utterance.onerror = (event) => {
      if (session !== speechSessionRef.current) return;
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setSpeechError("Audio reading stopped unexpectedly. Try speaking again.");
        setSpeechStatus("idle");
      }
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const startSpeaking = useCallback(async () => {
    if (!pdfRef.current || speechPreparing) return;

    if (!("speechSynthesis" in window)) {
      setSpeechError("Your browser does not support audio reading.");
      return;
    }

    setSpeechError("");
    setSpeechPreparing(true);

    try {
      const pdf = pdfRef.current;
      const queue: SpeechChunk[] = [];

      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        for (const text of splitTextIntoChunks(pageText)) {
          queue.push({ page: pageIndex, text });
        }
      }

      if (queue.length === 0) {
        setSpeechError(
          "No selectable text was found in this PDF. Scanned PDFs need OCR before they can be read aloud.",
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
      console.error("Could not extract PDF text for audio reading:", cause);
      setSpeechError("Could not prepare this PDF for audio reading.");
      setSpeechPreparing(false);
      setSpeechStatus("idle");
    }
  }, [speechPreparing, speakChunk]);

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
    if (speechQueueRef.current.length === 0) return;

    window.speechSynthesis.cancel();
    const session = ++speechSessionRef.current;
    speechIndexRef.current = 0;
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
    publishReadingContext(null);
  }, []);

  const pageWidth = Math.max(
    1,
    Math.min(Math.max(stageWidth - 32, 280), 850) * scale,
  );

  async function downloadPdf() {
    if (!book?.allow_download) return;

    setError("");

    const { data, error: downloadError } =
      await supabase.functions.invoke("get-book-url", {
        body: { bookId: book.id, action: "download" },
      });

    if (downloadError || !data?.signedUrl) {
      setError(downloadError?.message || "Download unavailable.");
      return;
    }

    window.location.assign(data.signedUrl);
  }

  return (
    <div className="reader-page">
      <header className="reader-toolbar">
        <Link to={`/books/${id}`} className="reader-back">
          <ArrowLeft size={17} />
          <span>Book details</span>
        </Link>

        <div className="reader-title">{book?.title || "PDF reader"}</div>

        <div className="reader-controls">
          <button
            className="icon-button"
            onClick={() => setScale((v) => Math.max(0.6, v - 0.1))}
            title="Zoom out"
            aria-label="Zoom out"
            disabled={!url}
          >
            <Minus size={17} />
          </button>

          <span className="zoom-value">{Math.round(scale * 100)}%</span>

          <button
            className="icon-button"
            onClick={() => setScale((v) => Math.min(1.6, v + 0.1))}
            title="Zoom in"
            aria-label="Zoom in"
            disabled={!url}
          >
            <Plus size={17} />
          </button>

          {book?.allow_download && url && (
            <button
              className="icon-button"
              onClick={() => void downloadPdf()}
              title="Download PDF"
              aria-label="Download PDF"
            >
              <Download size={17} />
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="screen-center">
          <div className="spinner" />
          <p>Preparing your reading space…</p>
        </div>
      ) : error && !url ? (
        <div className="empty-state">
          <h3>Unable to open this book</h3>
          <p>{error}</p>
          <Link className="button button-secondary" to="/books">
            Back to books
          </Link>
        </div>
      ) : (
        <>
          {numPages > 0 && (
            <div className="pdf-navigation">
              <button
                className="icon-button"
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                disabled={pageNumber <= 1}
                aria-label="Previous page"
                title="Previous page"
              >
                <ChevronLeft size={19} />
              </button>

              <span>Page {pageNumber} of {numPages}</span>

              <button
                className="icon-button"
                onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                disabled={pageNumber >= numPages}
                aria-label="Next page"
                title="Next page"
              >
                <ChevronRight size={19} />
              </button>
            </div>
          )}

          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}

          <div className="pdf-stage" ref={stageRef}>
            {pdfLoading && (
              <div className="pdf-loading">
                <div className="spinner" />
                <p>Loading PDF for online reading…</p>
              </div>
            )}

            {url && (
              <div className="pdf-document">
                <Document
                  file={url}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading=""
                  error=""
                  noData="No PDF was provided."
                >
                  {numPages > 0 && stageWidth > 0 && (
                    <Page
                      key={`${pageNumber}-${Math.round(pageWidth)}`}
                      pageNumber={pageNumber}
                      width={pageWidth}
                      renderTextLayer
                      renderAnnotationLayer
                      loading={<p>Rendering page…</p>}
                    />
                  )}
                </Document>
              </div>
            )}

            {url && !pdfLoading && !error && (
              <div className="pdf-speech-widget">
                {speechStatus === "idle" ? (
                  <button
                    type="button"
                    className="pdf-speak-button"
                    onClick={() => void startSpeaking()}
                    disabled={speechPreparing}
                  >
                    <Volume2 size={18} />
                    <span>{speechPreparing ? "Preparing audio…" : "Speak PDF"}</span>
                  </button>
                ) : (
                  <div className="pdf-speech-controls" aria-label="PDF audio controls">
                    <button
                      type="button"
                      className="pdf-speech-control"
                      onClick={pauseOrResume}
                      title={speechStatus === "paused" ? "Resume reading" : "Pause reading"}
                      aria-label={speechStatus === "paused" ? "Resume reading" : "Pause reading"}
                    >
                      {speechStatus === "paused" ? <Play size={18} /> : <Pause size={18} />}
                      <span>{speechStatus === "paused" ? "Resume" : "Pause"}</span>
                    </button>

                    <button
                      type="button"
                      className="pdf-speech-control"
                      onClick={restartSpeaking}
                      title="Restart reading"
                      aria-label="Restart reading"
                    >
                      <RotateCcw size={18} />
                      <span>Restart</span>
                    </button>

                    <button
                      type="button"
                      className="pdf-speech-control pdf-speech-exit"
                      onClick={stopSpeaking}
                      title="Exit audio reading"
                      aria-label="Exit audio reading"
                    >
                      <X size={18} />
                      <span>Exit</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {speechError && (
              <div className="pdf-speech-error" role="alert">
                {speechError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
