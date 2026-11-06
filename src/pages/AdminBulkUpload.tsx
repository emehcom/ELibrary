import { useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, X, UploadCloud } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const categories = [
  "Fiction",
  "Education",
  "Business",
  "Technology",
  "Biography",
  "History",
  "Self-development",
  "Science",
  "Other",
];

type UploadStatus = "pending" | "uploading" | "success" | "error";

type BookDraft = {
  id: string;
  file: File;
  title: string;
  author: string;
  description: string;
  category: string;
  pageCount: string;
  status: UploadStatus;
  error?: string;
};

type EditableField =
  | "title"
  | "author"
  | "description"
  | "category"
  | "pageCount";

export default function AdminBulkUpload() {
  const { user } = useAuth();
  const [books, setBooks] = useState<BookDraft[]>([]);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const additions: BookDraft[] = [];
    const rejected: string[] = [];

    for (const file of selected) {
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

      if (!isPdf) {
        rejected.push(`${file.name}: not a PDF`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name}: exceeds the 50 MB limit`);
        continue;
      }

      const suggestedTitle = file.name
        .replace(/\.pdf$/i, "")
        .replace(/[_-]+/g, " ")
        .trim();

      additions.push({
        id: crypto.randomUUID(),
        file,
        title: suggestedTitle,
        author: "",
        description: "",
        category: "Education",
        pageCount: "",
        status: "pending",
      });
    }

    setBooks((current) => [...current, ...additions]);
    setError(rejected.length ? rejected.join("; ") : "");
    // Reset so a user can select the same file again after removing it.
    event.target.value = "";
  }

  function updateBook(id: string, field: EditableField, value: string) {
    setBooks((current) =>
      current.map((book) =>
        book.id === id ? { ...book, [field]: value } : book
      )
    );
  }

  function removeBook(id: string) {
    setBooks((current) => current.filter((book) => book.id !== id));
  }

  async function uploadAll() {
    if (!user) {
      setError("Your session is missing. Sign in again before uploading.");
      return;
    }

    if (!rightsConfirmed) {
      setError("Confirm that you have permission to distribute these PDFs.");
      return;
    }

    const pending = books.filter(
      (book) => book.status === "pending" || book.status === "error"
    );

    if (pending.length === 0) {
      setError("There are no books waiting to be uploaded.");
      return;
    }

    const invalid = pending.find(
      (book) =>
        !book.title.trim() ||
        !book.author.trim() ||
        !Number.isInteger(Number(book.pageCount)) ||
        Number(book.pageCount) < 1
    );

    if (invalid) {
      setError(
        `Complete the title, author, and valid page count for "${invalid.file.name}".`
      );
      return;
    }

    setError("");
    setUploading(true);

    // Sequential uploads reduce simultaneous Storage and database requests.
    for (const book of pending) {
      const filePath = `${user.id}/${book.id}.pdf`;
      let storageUploaded = false;

      setBooks((current) =>
        current.map((item) =>
          item.id === book.id
            ? { ...item, status: "uploading", error: undefined }
            : item
        )
      );

      try {
        const { error: storageError } = await supabase.storage
          .from("book-pdfs")
          .upload(filePath, book.file, {
            contentType: "application/pdf",
            upsert: false,
          });

        if (storageError) throw storageError;
        storageUploaded = true;

        const { error: insertError } = await supabase.from("books").insert({
          id: book.id,
          uploader_id: user.id,
          title: book.title.trim(),
          author: book.author.trim(),
          description: book.description.trim() || null,
          category: book.category,
          page_count: Number(book.pageCount),
          file_path: filePath,
          file_size: book.file.size,
          allow_reading: true,
          allow_download: true,
          status: "published",
        });

        if (insertError) throw insertError;

        setBooks((current) =>
          current.map((item) =>
            item.id === book.id ? { ...item, status: "success" } : item
          )
        );
      } catch (caught) {
        let message =
          caught instanceof Error ? caught.message : "Unknown upload error.";

        if (storageUploaded) {
          const { error: cleanupError } = await supabase.storage
            .from("book-pdfs")
            .remove([filePath]);

          if (cleanupError) {
            message += ` Cleanup also failed: ${cleanupError.message}`;
          }
        }

        setBooks((current) =>
          current.map((item) =>
            item.id === book.id
              ? { ...item, status: "error", error: message }
              : item
          )
        );
      }
    }

    setUploading(false);
  }

  const successCount = books.filter((book) => book.status === "success").length;
  const failedCount = books.filter((book) => book.status === "error").length;
  const waitingCount = books.filter(
    (book) => book.status === "pending" || book.status === "uploading"
  ).length;

  return (
    <div className="content-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ELIBRARY COLLECTION MANAGEMENT</span>
          <h1>
            Bulk PDF upload<span className="title-period">.</span>
          </h1>
          <p>Select several PDFs, review their details, then publish them.</p>
        </div>
      </div>

      <div className="form-section">
        <div className="section-heading">
          <span className="section-index">01</span>
          <div>
            <h2>Select PDF files</h2>
            <p>PDF only · Maximum 50 MB per file</p>
          </div>
        </div>

        <label className="dropzone" htmlFor="bulk-pdf-input">
          <span className="upload-icon">
            <UploadCloud size={23} />
          </span>
          <strong>Choose multiple PDF files</strong>
          <span>Select more than one PDF from your device</span>
          <small>Each file must be 50 MB or smaller</small>
        </label>
        <input
          id="bulk-pdf-input"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          disabled={uploading}
          onChange={chooseFiles}
        />
      </div>

      {error && <div className="alert error">{error}</div>}

      {books.length > 0 && (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-label">SELECTED</span>
              <strong>{books.length}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">UPLOADED</span>
              <strong>{successCount}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">FAILED</span>
              <strong>{failedCount}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">WAITING / ACTIVE</span>
              <strong>{waitingCount}</strong>
            </div>
          </div>

          <div className="section-title-row">
            <div>
              <span className="eyebrow">REVIEW METADATA</span>
              <h2>Books to publish</h2>
            </div>
          </div>

          <div className="admin-list">
            {books.map((book) => (
              <div className="admin-row bulk-book-row" key={book.id}>
                <div className="bulk-book-content">
                  <div className="bulk-file-heading">
                    <FileText size={19} />
                    <div>
                      <strong>{book.file.name}</strong>
                      <small>
                        {(book.file.size / (1024 * 1024)).toFixed(2)} MB ·{" "}
                        {book.status === "pending" && "Waiting"}
                        {book.status === "uploading" && "Uploading…"}
                        {book.status === "success" && "Published"}
                        {book.status === "error" && "Failed"}
                      </small>
                    </div>
                    {book.status !== "success" && !uploading && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove ${book.file.name}`}
                        onClick={() => removeBook(book.id)}
                      >
                        <X size={17} />
                      </button>
                    )}
                  </div>

                  <div className="form-stack bulk-metadata-grid">
                    <label>
                      Book title
                      <input
                        required
                        maxLength={180}
                        value={book.title}
                        disabled={uploading || book.status === "success"}
                        onChange={(event) =>
                          updateBook(book.id, "title", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Author or creator
                      <input
                        required
                        maxLength={160}
                        placeholder="Author's name"
                        value={book.author}
                        disabled={uploading || book.status === "success"}
                        onChange={(event) =>
                          updateBook(book.id, "author", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Number of pages
                      <input
                        required
                        type="number"
                        min={1}
                        max={100000}
                        step={1}
                        placeholder="Page count"
                        value={book.pageCount}
                        disabled={uploading || book.status === "success"}
                        onChange={(event) =>
                          updateBook(book.id, "pageCount", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Category
                      <select
                        value={book.category}
                        disabled={uploading || book.status === "success"}
                        onChange={(event) =>
                          updateBook(book.id, "category", event.target.value)
                        }
                      >
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="bulk-description">
                      Description <span className="optional-label">OPTIONAL</span>
                      <textarea
                        rows={3}
                        maxLength={1500}
                        value={book.description}
                        disabled={uploading || book.status === "success"}
                        onChange={(event) =>
                          updateBook(book.id, "description", event.target.value)
                        }
                      />
                    </label>
                  </div>

                  {book.error && (
                    <div className="alert error">{book.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <label className="rights-check">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              disabled={uploading}
              onChange={(event) => setRightsConfirmed(event.target.checked)}
            />
            <span>
              I own these contents or have permission to distribute them, and
              they comply with Elibrary's content rules.
            </span>
          </label>

          <div className="upload-submit">
            <span>{successCount} of {books.length} books published</span>
            <button
              className="button button-primary"
              type="button"
              disabled={uploading || !rightsConfirmed || waitingCount === 0}
              onClick={() => void uploadAll()}
            >
              {uploading ? "Uploading…" : "Upload all books"} <span>↗</span>
            </button>
          </div>
        </>
      )}

      <p>
        <Link to="/admin">
          <ArrowLeft size={15} /> Back to admin dashboard
        </Link>
      </p>
    </div>
  );
}
