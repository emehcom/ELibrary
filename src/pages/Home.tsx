import { ArrowRight, BookOpen, Search, ShieldCheck, UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> A DIGITAL LIBRARY, REIMAGINED</span>
          <h1>Find your next<br /> <em>good read.</em></h1>
          <p>A quiet corner of the internet for curious minds. Discover books, read at your pace, and share what you love.</p>
          <div className="hero-actions"><Link to={user ? "/books" : "/signup"} className="button button-primary">Explore the library <ArrowRight size={17} /></Link><Link to={user ? "/upload" : "/signup"} className="button button-quiet"><UploadCloud size={17} /> Share a book</Link></div>
          <div className="hero-note"><ShieldCheck size={15} /> One account for reading and sharing</div>
        </div>
        <div className="hero-visual" aria-label="A curated arrangement of books">
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="floating-note note-top"><span className="note-dot" /> ROOM TO THINK</div>
          <div className="hero-book book-back"><span>FIELD NOTES</span><strong>ON<br />CURIOSITY</strong><small>VOL. 02</small></div>
          <div className="hero-book book-front"><div className="book-front-top">THE ART OF</div><strong>Slow<br /><i>Reading</i></strong><div className="book-line" /><small>A COLLECTION OF THOUGHTS</small><div className="book-seal">E.</div></div>
          <div className="floating-note note-bottom"><BookOpen size={15} /><span>YOUR NEXT CHAPTER</span></div>
        </div>
      </section>
      <section className="home-intro">
        <div><span className="eyebrow">MADE FOR READERS</span><h2>A library without<br />the noise.</h2></div>
        <p>From useful guides to stories that stay with you, Elibrary brings books into one simple, searchable space. Read online or download a copy when the uploader permits it.</p>
      </section>
      <section className="feature-grid">
        <div className="feature-card"><span className="feature-icon"><Search size={19} /></span><span className="feature-number">01 / DISCOVER</span><h3>Find what moves you.</h3><p>Explore books by title, author, or category. Your next favorite is closer than you think.</p><Link to="/books">Browse books <ArrowRight size={14} /></Link></div>
        <div className="feature-card"><span className="feature-icon"><BookOpen size={19} /></span><span className="feature-number">02 / READ</span><h3>Settle into a good read.</h3><p>Open PDF books in your browser and make reading fit your day.</p><Link to={user ? "/books" : "/signup"}>Start reading <ArrowRight size={14} /></Link></div>
        <div className="feature-card"><span className="feature-icon"><UploadCloud size={19} /></span><span className="feature-number">03 / SHARE</span><h3>Pass a book along.</h3><p>Upload PDFs you have the right to share and help the library grow.</p><Link to={user ? "/upload" : "/signup"}>Share a book <ArrowRight size={14} /></Link></div>
      </section>
      <section className="closing-cta"><div><span className="eyebrow light-eyebrow">YOUR READING SPACE AWAITS</span><h2>Turn a page.<br /><em>Open a possibility.</em></h2></div><Link to={user ? "/books" : "/signup"} className="button button-light">Enter Elibrary <ArrowRight size={17} /></Link></section>
    </div>
  );
}