import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
export default function AdminRoute() {
  const { role, loading } = useAuth();
  if (loading || role === null) return <div className="screen-center"><div className="spinner" /><p>Checking administrator access…</p></div>;
  return role === "admin" ? <Outlet /> : <Navigate to="/books" replace />;
}
