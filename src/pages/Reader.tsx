import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ArrowLeft, Download, Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Book } from "../types";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure PDF.js to use its worker with Vite.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

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
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, url]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      setUrl("");
      setBook(null);

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
    };
  }, [id]);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: totalPages }: { numPages: number }) => {
      setNumPages(totalPages);
      setPageNumber(1);
      setPdfLoading(false);
      setError("");
    },
    [],
  );

  const onDocumentLoadError = useCallback((cause: Error) => {
    console.error("PDF rendering failed:", cause);
    setPdfLoading(false);
    setError(
      "The PDF could not be displayed. Check your connection and try again.",
    );
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

    // Only the explicit Download action initiates a download.
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

              <span>
                Page {pageNumber} of {numPages}
              </span>

              <button
                className="icon-button"
                onClick={() =>
                  setPageNumber((p) => Math.min(numPages, p + 1))
                }
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
          </div>
        </>
      )}
    </div>
  );
}