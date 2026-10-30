import { BookOpen, LayoutDashboard, LogOut, Search, UploadCloud } from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import FavourChat from "./FavourChat";

export default function Layout() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Elibrary home">
          <span className="brand-mark"><BookOpen size={19} /></span>
          <span>elibrary<span className="brand-period">.</span></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/books"><Search size={16} /> Explore</NavLink>
          <NavLink to="/upload"><UploadCloud size={16} /> Upload</NavLink>
          <NavLink to="/dashboard"><LayoutDashboard size={16} /> My library</NavLink>
          {role === "admin" && <NavLink to="/admin"><LayoutDashboard size={16} /> Admin</NavLink>}
        </nav>
        <div className="account-area">
          <span className="avatar">{(user?.email?.[0] ?? "R").toUpperCase()}</span>
          <button className="icon-button" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>
        </div>
      </header>
      <main className="page-wrap">
  <Outlet />
</main>

<FavourChat userId={user?.id ?? null} />
      <footer className="footer"><span>© {new Date().getFullYear()} Elibrary</span><span>A little More Room to Read.</span></footer>
    </div>
  );
}