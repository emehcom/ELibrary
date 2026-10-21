import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
export default function ProtectedRoute() {
  const { user, loading, accountStatus } = useAuth();
  const location = useLocation();
  if (loading) return <div className="screen-center"><div className="spinner" /><p>Opening your library…</p></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (accountStatus === "deactivated") return <div className="screen-center"><h2>Account deactivated</h2><p>Your access to Elibrary has been suspended. Contact support if you believe this is an error.</p><button className="button button-secondary" onClick={async () => { await supabase.auth.signOut(); window.location.assign("/login"); }}>Sign out</button></div>;
  return <Outlet />;
}
