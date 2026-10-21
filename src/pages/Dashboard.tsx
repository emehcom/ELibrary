import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Clock3, FileText, Plus, UploadCloud, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import type { Book } from "../types";
import BookCard from "../components/BookCard";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (!user) return;
    supabase.from("books").select("*").eq("uploader_id", user.id).neq("status", "removed").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error(error.message);
        setBooks((data ?? []) as Book[]);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user]);

  async function deleteAccount() {
    const confirmed = window.confirm("Delete your Elibrary account permanently? Your uploaded books and associated activity will also be removed. This cannot be undone.");
    if (!confirmed) return;
    setDeleting(true); setAccountError("");
    const { error } = await supabase.functions.invoke("delete-account", { body: {} });
    setDeleting(false);
    if (error) { setAccountError(error.message); return; }
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="content-page">
      <div className="dashboard-welcome"><div><span className="eyebrow">YOUR SPACE</span><h1>Your library<span className="title-period">.</span></h1><p>Keep track of the books you bring to Elibrary.</p></div><Link to="/upload" className="button button-primary"><Plus size={17} /> Upload a book</Link></div>
      <div className="stats-row"><div className="stat-card"><span className="stat-icon"><FileText size={18} /></span><span className="stat-label">BOOKS SHARED</span><strong>{loading ? "—" : books.length}</strong><small>Your contributions</small></div><div className="stat-card"><span className="stat-icon"><BookOpen size={18} /></span><span className="stat-label">ACCOUNT</span><strong className="stat-account">Active</strong><small>{user?.email}</small></div><div className="stat-card"><span className="stat-icon"><Clock3 size={18} /></span><span className="stat-label">MEMBER SINCE</span><strong className="stat-account">{user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—"}</strong><small>Thanks for reading with us</small></div></div>
      <div className="section-title-row"><div><span className="eyebrow">YOUR CONTRIBUTIONS</span><h2>Books you've shared</h2></div><Link to="/upload" className="text-link">Add a book <ArrowRight size={15} /></Link></div>
      {accountError && <div className="alert error">{accountError}</div>}
      {loading ? <div className="loading-grid">{[1,2,3].map(n => <div className="skeleton-card" key={n} />)}</div> : books.length ? <div className="book-grid">{books.map(book => <BookCard key={book.id} book={book} />)}</div> : <div className="empty-state"><span className="empty-icon"><UploadCloud size={25} /></span><h3>Your shelf starts here</h3><p>Upload a PDF you have permission to share and make it available to other readers.</p><Link className="button button-primary" to="/upload">Upload your first book <ArrowRight size={16} /></Link></div>}
      <div className="account-danger-zone"><div><strong>Delete your account</strong><p>This permanently removes your account and your uploaded books.</p></div><button className="button button-danger" onClick={() => void deleteAccount()} disabled={deleting}><Trash2 size={16} /> {deleting ? "Deleting…" : "Delete account"}</button></div>
    </div>
  );
}