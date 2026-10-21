import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, BookOpen } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Book } from "../types";
import BookCard from "../components/BookCard";

export default function Books() {
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.from("books").select("*").eq("status", "published").order("created_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) setError(fetchError.message);
        setBooks((data ?? []) as Book[]);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => ["All categories", ...Array.from(new Set(books.map(b => b.category).filter((v): v is string => Boolean(v))))], [books]);
  const filtered = useMemo(() => books.filter(book => {
    const text = `${book.title} ${book.author} ${book.description ?? ""}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (category === "All categories" || book.category === category);
  }), [books, query, category]);

  return (
    <div className="content-page">
      <div className="page-heading"><div><span className="eyebrow">THE COLLECTION</span><h1>Explore books<span className="title-period">.</span></h1><p>Find something worth your time.</p></div><span className="count-pill"><BookOpen size={15} /> {books.length} {books.length === 1 ? "book" : "books"}</span></div>
      <div className="filter-bar"><div className="search-field"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search titles, authors, or ideas…" aria-label="Search books" /></div><label className="select-wrap"><SlidersHorizontal size={16} /><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category">{categories.map(c => <option key={c}>{c}</option>)}</select></label></div>
      {error && <div className="alert error">{error}. Check that the database schema has been applied.</div>}
      {loading ? <div className="loading-grid">{[1,2,3,4].map(n => <div className="skeleton-card" key={n} />)}</div> : filtered.length ? <div className="book-grid">{filtered.map(book => <BookCard key={book.id} book={book} />)}</div> : <div className="empty-state"><span className="empty-icon"><BookOpen size={25} /></span><h3>{books.length ? "No books match that search" : "The shelves are ready"}</h3><p>{books.length ? "Try a different title, author, or category." : "The first book uploaded to Elibrary will appear here."}</p></div>}
    </div>
  );
}