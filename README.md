# Elibrary MVP

Elibrary is a web-first PDF library. Registered users can browse and search published books, read PDFs in the browser, download PDFs, and upload PDFs with title, author, description, category, and page count. Admins can monitor accounts and recorded book activity and deactivate/reactivate accounts. Admins do not have a delete-user action.

## Stack

- React + Vite + TypeScript frontend
- Supabase Auth for email/password authentication and password recovery
- Supabase Postgres for profiles, roles, books, and activity records
- Private Supabase Storage bucket for PDFs
- Supabase Edge Functions for permission-checked PDF URLs and self-service account deletion

The authentication screens are Elibrary-branded. Supabase operates behind the scenes; the frontend must only contain the project's public/anon key, never the service-role key.

## Local development

Requirements: Node.js 20+ and npm.

1. Extract the project and open the folder in VS Code.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase Project Settings → API. These are public client values; do not put a service-role/secret key in a `VITE_` variable.
5. Run `npm run dev`.

## Day 1 — Supabase setup and connection

1. Create a Supabase project and save the database password securely.
2. Open SQL Editor and run `supabase/schema.sql`.
3. In Authentication → URL Configuration, set the local Site URL to `http://localhost:5173`. Add the production domain after deployment.
4. Configure email confirmation and password-reset redirect URLs. Use a reliable email provider before public launch; default testing email limits may be restrictive.
5. In Authentication security settings, enable appropriate password protections and MFA. **Admin MFA still needs to be configured and tested in Supabase before public launch.**
6. Deploy the Edge Functions from the project root using the Supabase CLI:

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy get-book-url
   supabase functions deploy delete-account
   ```

   Supabase Edge Functions use the project's server-side environment values. Never copy `SUPABASE_SERVICE_ROLE_KEY` into the frontend.

7. Create your intended admin account through the normal Elibrary sign-up page and confirm the email. In Supabase Dashboard → Authentication → Users, copy that user's UUID. In SQL Editor, run the following after replacing the placeholder:

   ```sql
   insert into public.user_roles (user_id, role)
   values ('YOUR-AUTH-USER-UUID', 'admin')
   on conflict (user_id) do update set role = 'admin';
   ```

   Do not create a public admin signup form or use a shared secret password to grant admin access.

8. Add your Supabase URL and public anon/publishable key to `.env.local`, restart Vite, then test sign-up, email confirmation, sign-in, upload, read, download, password reset, and account deletion.

## Security model and current limits

- Public visitors are sent to sign-in; browsing, uploads, the reader, and dashboards require authentication.
- Public sign-up creates only the `user` role. Admin roles are assigned through trusted SQL/provisioning.
- RLS protects database records. PDF objects are in a private bucket with no general authenticated read policy. `get-book-url` verifies the caller's session, active account, published book, and requested read/download permission before issuing a 30-minute signed URL and logging the event.
- Signed URLs are bearer links. They can be used by anyone who obtains them until expiry; do not post them publicly. Deactivation blocks future app requests but cannot instantly revoke a signed URL already issued.
- `delete-account` removes the user's uploaded PDFs and then deletes their Auth account. Their uploaded books and related activity are removed as part of that workflow. Test this carefully with disposable accounts before launch.
- Uploads have a 50 MB client/bucket limit and PDF MIME-type restriction. Client-side file checks are not malware scanning or deep file validation. A production launch should add server-side file validation, abuse controls, moderation/report handling, copyright takedown procedures, backups, and monitoring.
- A read event means the reader URL was requested, not proof that a person read every page. A download event means Elibrary issued a download URL, not proof the file was successfully saved.
- Browser-based PDF reading does not guarantee that PDF bytes are never temporarily cached on a device.
- Admin activity currently loads all event rows to calculate per-user counts, and displays the latest 100 events. Add pagination or aggregate database views before activity volume grows significantly.
- Admin MFA enforcement is not implemented in this frontend; configure it in Supabase and test the required assurance level before public launch.

## Day 2 — application testing

Test on mobile and desktop with separate regular-user and admin accounts:

- Logged-out visitors cannot access `/books`, `/upload`, `/dashboard`, `/admin`, or `/read/:id`.
- A regular user cannot access the admin page or update a role.
- User A can search, stream, and download a published PDF.
- User B can upload a PDF and required metadata; it becomes searchable to signed-in users.
- A book's read/download permissions are checked by the Edge Function, not only by the UI.
- An admin can view users and activity and deactivate/reactivate another user, but cannot delete accounts.
- A deactivated user cannot browse, upload, or request new PDF URLs.
- Password reset, email confirmation, sign-out, and account deletion work.
- Try invalid PDFs, oversize files, duplicate names, and failed uploads.
- Verify storage and database usage in the Supabase dashboard.

## Day 3 — deploy and host

Build with `npm run build`, host the generated `dist/` folder on a static host, configure SPA fallback to `index.html`, set the production environment variables, and add the production URL to Supabase Auth redirect settings. Run the full smoke test again on the production domain. The package build should be run locally after dependencies are installed; this source bundle has not been verified against a live Supabase project.

## Day 4 — awareness

Prepare a short product demo, clear upload/copyright rules, an onboarding guide, a contact/report channel, and a way to collect user feedback. Avoid promising unlimited downloads or permanent preservation until usage and operating costs are understood.

## Day 5 — scaling and improvements

Review real usage and costs before adding features. Priorities may include database pagination/search improvements, storage/bandwidth monitoring, better PDF rendering, moderation tools, analytics aggregation, automated backups, and later Android/iOS clients sharing the same Supabase backend.
