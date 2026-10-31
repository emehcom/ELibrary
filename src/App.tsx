import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import AdminDashboard from "./pages/AdminDashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Books from "./pages/Books";
import Upload from "./pages/Upload";
import Dashboard from "./pages/Dashboard";
import BookDetail from "./pages/BookDetail";
import Reader from "./pages/Reader";
import ResetPassword from "./pages/ResetPassword";
import { isSupabaseConfigured } from "./lib/supabase";

function LandingRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="screen-center elibrary-loading">
        <div className="elibrary-loader">
          <div className="elibrary-loader-ring" />
          <img
            src={`${import.meta.env.BASE_URL}elibrary-icon.png`}
            alt="Elibrary"
            className="elibrary-loader-icon"
          />
        </div>
      </div>
    );
  }

  return <Navigate to={user ? "/books" : "/login"} replace />;
}

export default function App() {
  return (
    <>
      {!isSupabaseConfigured && (
        <div className="config-banner">
          Setup required: add your Supabase URL and anon key in{" "}
          <code>.env.local</code> to enable accounts and book storage.
        </div>
      )}

      <Routes>
        <Route path="/" element={<LandingRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/books" element={<Books />} />
            <Route path="/books/:id" element={<BookDetail />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/read/:id" element={<Reader />} />

            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<LandingRedirect />} />
      </Routes>
    </>
  );
}