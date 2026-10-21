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
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
  const userId = authData.user.id;
  const { data: files } = await adminClient.from("books").select("file_path").eq("uploader_id", userId);
  const paths = (files ?? []).map((row: { file_path: string }) => row.file_path);
  if (paths.length) {
    const { error: removeError } = await adminClient.storage.from("book-pdfs").remove(paths);
    if (removeError) return Response.json({ error: "Could not clean up uploaded PDFs. Account was not deleted." }, { status: 500, headers: corsHeaders });
  }
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) return Response.json({ error: "Account deletion failed" }, { status: 500, headers: corsHeaders });
  return Response.json({ success: true }, { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
