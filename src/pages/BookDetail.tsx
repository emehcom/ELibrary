import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Download, FileText, UserRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import type { Book } from "../types";

export default function BookDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!id) return;
    supabase.from("books").select("*").eq("id", id).eq("status", "published").maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) setError(fetchError.message);
        setBook(data as Book | null);
        setBusy(false);
      });
    return () => { active = false; };
  }, [id]);

  async function downloadBook() {
    if (!book) return;
    const { data, error: signedError } = await supabase.functions.invoke("get-book-url", { body: { bookId: book.id, action: "download" } });
    if (signedError || !data?.signedUrl) { setError(signedError?.message || data?.error || "Could not prepare the download."); return; }
    window.location.assign(data.signedUrl);
  }

  if (busy) return <div className="screen-center"><div className="spinner" /><p>Opening book details…</p></div>;
  if (error || !book) return <div className="content-page"><Link to="/books" className="back-link"><ArrowLeft size={16} /> Back to explore</Link><div className="empty-state"><h3>We couldn't find that book</h3><p>{error || "It may have been removed or is no longer available."}</p></div></div>;

  return (
    <div className="content-page">
      <Link to="/books" className="back-link"><ArrowLeft size={16} /> Back to explore</Link>
      <div className="detail-layout">
        <div className={`detail-cover ${book.cover_url ? "has-image" : ""}`}>{book.cover_url ? <img src={book.cover_url} alt={`${book.title} cover`} /> : <div className="cover-placeholder"><span className="cover-kicker">{book.category || "ELIBRARY EDITION"}</span><BookOpen size={45} strokeWidth={1.1} /><span className="cover-title">{book.title}</span><span className="cover-author">{book.author}</span></div>}</div>
        <div className="detail-copy"><span className="eyebrow">{book.category || "GENERAL READING"}</span><h1>{book.title}<span className="title-period">.</span></h1><div className="detail-author"><UserRound size={16} /> {book.author}</div><p className="detail-description">{book.description || "A book shared with the Elibrary community."}</p>
          <div className="detail-meta"><span><FileText size={16} /> PDF document</span><span>{book.page_count || "—"} pages</span><span>{(book.file_size / (1024 * 1024)).toFixed(1)} MB</span></div>
          <div className="detail-actions">{book.allow_reading && <Link className="button button-primary" to={`/read/${book.id}`}><BookOpen size={17} /> Read online</Link>}{book.allow_download && <button className="button button-secondary" onClick={downloadBook}><Download size={17} /> Download PDF</button>}</div>
          <p className="detail-footnote">Available to signed-in readers. Please respect the author's rights.</p>
          {book.uploader_id === user?.id && <div className="owner-note">You uploaded this book.</div>}
        </div>
      </div>
    </div>
  );
}