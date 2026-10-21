import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Users, BookOpen, Download, Eye, Ban, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type ProfileRow = { id: string; display_name: string | null; email: string | null; status: "active" | "deactivated"; created_at: string; uploadedCount?: number; downloadCount?: number; readCount?: number };
type EventRow = { id: number; user_id: string; book_id: string; event_type: "read" | "download" | "upload"; created_at: string; books?: { title: string; description: string | null } | null };
export default function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState({ users: 0, books: 0, downloads: 0, reads: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [userResult, bookResult, eventResult, statsResult] = await Promise.all([
      supabase.from("profiles").select("id,display_name,email,status,created_at").order("created_at", { ascending: false }),
      supabase.from("books").select("id", { count: "exact", head: true }).neq("status", "removed"),
      supabase.from("book_events").select("id,user_id,book_id,event_type,created_at,books(title,description)").order("created_at", { ascending: false }).limit(100),
      supabase.rpc("get_admin_user_stats"),
    ]);
    if (userResult.error || bookResult.error || eventResult.error || statsResult.error) setError(userResult.error?.message || bookResult.error?.message || eventResult.error?.message || statsResult.error?.message || "Could not load admin data.");
    const loadedUsers = (userResult.data ?? []) as ProfileRow[];
    const loadedEvents = (eventResult.data ?? []) as unknown as EventRow[];
    const stats = (statsResult.data ?? []) as { user_id: string; uploaded_count: number; download_count: number; read_count: number }[];
    const statsByUser = new Map(stats.map(row => [row.user_id, row]));
    const enrichedUsers = loadedUsers.map(person => { const row = statsByUser.get(person.id); return { ...person, uploadedCount: Number(row?.uploaded_count ?? 0), downloadCount: Number(row?.download_count ?? 0), readCount: Number(row?.read_count ?? 0) }; });
    setUsers(enrichedUsers); setEvents(loadedEvents);
    setCounts({ users: loadedUsers.length, books: bookResult.count ?? 0, downloads: stats.reduce((sum, row) => sum + Number(row.download_count), 0), reads: stats.reduce((sum, row) => sum + Number(row.read_count), 0) });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function setStatus(target: ProfileRow) {
    const next = target.status === "active" ? "deactivated" : "active";
    const action = next === "deactivated" ? "deactivate" : "reactivate";
    if (!window.confirm(`Are you sure you want to ${action} this account?`)) return;
    setBusyUser(target.id); setError("");
    const { error: updateError } = await supabase.from("profiles").update({ status: next }).eq("id", target.id);
    setBusyUser(null);
    if (updateError) setError(updateError.message); else await load();
  }

  return <div className="content-page">
    <div className="dashboard-welcome"><div><span className="eyebrow">ELIBRARY CONTROL ROOM</span><h1>Admin dashboard<span className="title-period">.</span></h1><p>Monitor accounts and recorded library activity. User deletion is not available here.</p></div><span className="count-pill"><ShieldCheck size={16} /> Administrator</span></div>
    {error && <div className="alert error">{error}</div>}
    <div className="stats-row">
      <div className="stat-card"><span className="stat-icon"><Users size={18} /></span><span className="stat-label">REGISTERED USERS</span><strong>{loading ? "—" : counts.users}</strong><small>Including deactivated accounts</small></div>
      <div className="stat-card"><span className="stat-icon"><BookOpen size={18} /></span><span className="stat-label">BOOKS</span><strong>{loading ? "—" : counts.books}</strong><small>Published and pending</small></div>
      <div className="stat-card"><span className="stat-icon"><Download size={18} /></span><span className="stat-label">DOWNLOAD EVENTS</span><strong>{loading ? "—" : counts.downloads}</strong><small>All recorded events</small></div>
      <div className="stat-card"><span className="stat-icon"><Eye size={18} /></span><span className="stat-label">READ EVENTS</span><strong>{loading ? "—" : counts.reads}</strong><small>All recorded events</small></div>
    </div>
    <div className="section-title-row"><div><span className="eyebrow">ACCOUNT MANAGEMENT</span><h2>Users</h2></div></div>
    {loading ? <p>Loading accounts…</p> : <div className="admin-list">{users.map(person => <div className="admin-row" key={person.id}><div className="admin-row-main"><strong>{person.display_name || "Elibrary reader"}</strong><small>{person.email || person.id}</small><small>{person.uploadedCount} uploaded · {person.downloadCount} downloads · {person.readCount} reads</small><small>Joined {new Date(person.created_at).toLocaleDateString()}</small></div><span className={`status-pill ${person.status}`}>{person.status}</span><button className="button button-secondary" disabled={busyUser === person.id || user?.id === person.id} onClick={() => void setStatus(person)}>{person.status === "active" ? <><Ban size={15} /> Deactivate</> : <><CheckCircle2 size={15} /> Reactivate</>}</button></div>)}</div>}
    <div className="section-title-row admin-activity-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Book activity</h2></div></div>
    {loading ? <p>Loading activity…</p> : events.length === 0 ? <div className="empty-state"><h3>No recorded activity yet</h3><p>Reading and download events will appear here when the backend event endpoint is connected.</p></div> : <div className="admin-list">{events.map(event => <div className="admin-row" key={event.id}><div className="admin-row-main"><strong>{event.books?.title || "Book unavailable"}</strong><small>{users.find(person => person.id === event.user_id)?.display_name || users.find(person => person.id === event.user_id)?.email || "Reader"} · {event.event_type}</small><small>{event.books?.description || "No description provided."}</small></div><time>{new Date(event.created_at).toLocaleString()}</time></div>)}</div>}
  </div>;
}
