import { useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { FileUp, FileText, X, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const categories = ["Fiction", "Education", "Business", "Technology", "Biography", "History", "Self-development", "Science", "Other"];

export default function Upload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Education");
  const [pageCount, setPageCount] = useState(1);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    if (chosen.type !== "application/pdf" && !chosen.name.toLowerCase().endsWith(".pdf")) { setError("Choose a PDF file."); return; }
    if (chosen.size > MAX_FILE_SIZE) { setError("This starter version supports PDFs up to 50 MB."); return; }
    setError(""); setFile(chosen);
    if (!title) setTitle(chosen.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!user) { setError("Sign in before uploading a book."); return; }
    if (!file) { setError("Choose a PDF to upload."); return; }
    if (!rightsConfirmed) { setError("Confirm that you have the right to distribute this book."); return; }
    setBusy(true);
    const id = crypto.randomUUID();
    const filePath = `${user.id}/${id}.pdf`;
    const { error: uploadError } = await supabase.storage.from("book-pdfs").upload(filePath, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
  setBusy(false);
  setError(`PDF storage upload failed: ${uploadError.message}`);
  return;
}
    const { data, error: insertError } = await supabase.from("books").insert({
      id, uploader_id: user.id, title: title.trim(), author: author.trim(), description: description.trim() || null,
      category, page_count: pageCount, file_path: filePath, file_size: file.size, allow_reading: true, allow_download: true, status: "published",
    }).select("id").single();
    if (insertError) {
      await supabase.storage.from("book-pdfs").remove([filePath]);
      setBusy(false); setError(insertError.message); return;
    }
    navigate(`/books/${data.id}`);
  }

  return (
    <div className="content-page narrow-page">
      <div className="page-heading"><div><span className="eyebrow">GROW THE COLLECTION</span><h1>Share a book<span className="title-period">.</span></h1><p>Every good book deserves another reader.</p></div></div>
      <form className="upload-form" onSubmit={submit}>
        <div className="form-section"><div className="section-heading"><span className="section-index">01</span><div><h2>Your PDF</h2><p>PDF files only · 50 MB maximum</p></div></div>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={chooseFile} hidden />
          {file ? <div className="selected-file"><span className="file-icon"><FileText size={21} /></span><div className="file-meta"><strong>{file.name}</strong><span>{(file.size / (1024 * 1024)).toFixed(2)} MB · PDF document</span></div><button type="button" className="icon-button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }} aria-label="Remove selected file"><X size={17} /></button></div> : <button type="button" className="dropzone" onClick={() => inputRef.current?.click()}><span className="upload-icon"><FileUp size={23} /></span><strong>Choose a PDF file</strong><span>Browse your device to select a book</span><small>PDF · Up to 50 MB</small></button>}
        </div>
        <div className="form-section"><div className="section-heading"><span className="section-index">02</span><div><h2>Book details</h2><p>Help readers know what they are opening.</p></div></div>
          <div className="form-stack">
            <label>Book title<input required maxLength={180} value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter the book title" /></label>
            <label>Author or creator<input required maxLength={160} value={author} onChange={e => setAuthor(e.target.value)} placeholder="Who wrote this book?" /></label>
            <label>Number of pages<input required type="number" min={1} max={100000} value={pageCount} onChange={e => setPageCount(Math.max(1, Number(e.target.value) || 1))} /></label>
            <label>Category<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
            <label>Description <span className="optional-label">OPTIONAL</span><textarea rows={4} maxLength={1500} value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this book about?" /></label>
          </div>
        </div>
        <div className="form-section"><div className="section-heading"><span className="section-index">03</span><div><h2>Sharing declaration</h2><p>Published books are available to signed-in Elibrary users for reading and downloading.</p></div></div><label className="rights-check"><input type="checkbox" checked={rightsConfirmed} onChange={e => setRightsConfirmed(e.target.checked)} /><span>I own this content or have permission to distribute it, and I agree to Elibrary's content rules.</span></label></div>
        {error && <div className="alert error">{error}</div>}
        <div className="upload-submit"><span><ShieldCheck size={16} /> Your upload is tied to your account.</span><button className="button button-primary" disabled={busy || !file || !rightsConfirmed || !title.trim() || !author.trim() || pageCount < 1}>{busy ? "Uploading…" : "Publish book"} <span>↗</span></button></div>
      </form>
    </div>
  );
}