import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import type { Book } from "../types";

export default function BookCard({ book }: { book: Book }) {
  return (
    <article className="book-card">
      <Link to={`/books/${book.id}`} className={`book-cover ${book.cover_url ? "has-image" : ""}`}>
        {book.cover_url ? <img src={book.cover_url} alt={`${book.title} cover`} /> : (
          <div className="cover-placeholder"><span className="cover-kicker">{book.category || "ELIBRARY EDITION"}</span><BookOpen size={34} strokeWidth={1.2} /><span className="cover-title">{book.title}</span><span className="cover-author">{book.author}</span></div>
        )}
      </Link>
      <div className="book-card-info">
        <div className="book-category">{book.category || "General"}</div>
        <Link to={`/books/${book.id}`} className="book-title">{book.title}</Link>
        <p className="book-author">{book.author}</p>
      </div>
    </article>
  );
}