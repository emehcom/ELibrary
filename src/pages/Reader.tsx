import { useEffect, useState } from "react";
import { ArrowLeft, Download, ExternalLink, Minus, Plus } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Book } from "../types";

export default function Reader() {
  const { id } = useParams();
  const [book, setBook] = useState<Book | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!id) return;
      const { data: found, error: findError } = await supabase.from("books").select("*").eq("id", id).eq("status", "published").maybeSingle();
      if (!active) return;
      if (findError || !found) { setError(findError?.message || "This book is not available."); setLoading(false); return; }
      const item = found as Book;
      setBook(item);
      if (!item.allow_reading) { setError("The uploader has not enabled online reading for this book."); setLoading(false); return; }
      const { data, error: signedError } = await supabase.functions.invoke("get-book-url", { body: { bookId: item.id, action: "read" } });
      if (!active) return;
      if (signedError) setError(signedError.message);
      else setUrl(data.signedUrl);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [id]);

  return (
    <div className="reader-page">
      <header className="reader-toolbar"><Link to={`/books/${id}`} className="reader-back"><ArrowLeft size={17} /><span>Book details</span></Link><div className="reader-title">{book?.title || "PDF reader"}</div><div className="reader-controls"><button className="icon-button" onClick={() => setScale(v => Math.max(.6, v - .1))} title="Zoom out" aria-label="Zoom out"><Minus size={17} /></button><span className="zoom-value">{Math.round(scale * 100)}%</span><button className="icon-button" onClick={() => setScale(v => Math.min(1.6, v + .1))} title="Zoom in" aria-label="Zoom in"><Plus size={17} /></button>{book?.allow_download && url && <button className="icon-button" onClick={async () => { const { data, error } = await supabase.functions.invoke("get-book-url", { body: { bookId: book.id, action: "download" } }); if (error || !data?.signedUrl) { setError(error?.message || "Download unavailable."); return; } window.location.assign(data.signedUrl); }} title="Download PDF" aria-label="Download PDF"><Download size={17} /></button>}<a className="icon-button" href={url || undefined} target="_blank" rel="noreferrer" title="Open PDF in new tab" aria-label="Open PDF in new tab"><ExternalLink size={17} /></a></div></header>
      {loading ? <div className="screen-center"><div className="spinner" /><p>Preparing your reading space…</p></div> : error ? <div className="empty-state"><h3>Unable to open this book</h3><p>{error}</p><Link className="button button-secondary" to="/books">Back to books</Link></div> : <div className="pdf-stage"><div className="pdf-frame" style={{ width: `${100 * scale}%` }}><iframe src={url} title={`Reading ${book?.title}`} /></div></div>}
    </div>
  );
}