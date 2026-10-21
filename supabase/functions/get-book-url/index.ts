import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return Response.json({ error: "Sign in required" }, { status: 401, headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
  const { data: profile } = await adminClient.from("profiles").select("status").eq("id", userData.user.id).maybeSingle();
  if (!profile || profile.status !== "active") return Response.json({ error: "Account is inactive" }, { status: 403, headers: corsHeaders });
  let body: { bookId?: string; action?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400, headers: corsHeaders }); }
  if (!body.bookId || !["read", "download"].includes(body.action ?? "")) return Response.json({ error: "Book and action are required" }, { status: 400, headers: corsHeaders });
  const { data: book } = await adminClient.from("books").select("id,file_path,title,status,allow_reading,allow_download").eq("id", body.bookId).maybeSingle();
  if (!book || book.status !== "published") return Response.json({ error: "Book is not available" }, { status: 404, headers: corsHeaders });
  if (body.action === "read" && !book.allow_reading) return Response.json({ error: "Online reading is not enabled" }, { status: 403, headers: corsHeaders });
  if (body.action === "download" && !book.allow_download) return Response.json({ error: "Downloads are not enabled" }, { status: 403, headers: corsHeaders });
  const { data: signed, error: signError } = await adminClient.storage.from("book-pdfs").createSignedUrl(book.file_path, 30 * 60, body.action === "download" ? { download: `${book.title}.pdf` } : undefined);
  if (signError || !signed?.signedUrl) return Response.json({ error: "Could not prepare the PDF" }, { status: 500, headers: corsHeaders });
  await adminClient.from("book_events").insert({ user_id: userData.user.id, book_id: book.id, event_type: body.action === "download" ? "download" : "read" });
  return Response.json({ signedUrl: signed.signedUrl }, { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
