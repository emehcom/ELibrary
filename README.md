# Elibrary MVP

Elibrary is a web-first PDF library. Registered users can browse and search published books, read PDFs in the browser, download PDFs, and upload PDFs with a title, author, description, category, and page count. Admins can monitor accounts and recorded book activity and deactivate or reactivate accounts. Admins do not have a delete-user action.

## Tech Stack

- React, Vite, and TypeScript for the frontend
- Supabase Auth for email/password authentication and password recovery
- Supabase Postgres for profiles, roles, books, and activity records
- Private Supabase Storage bucket for PDFs
- Supabase Edge Functions for permission-checked PDF URLs and self-service account deletion

The authentication screens are Elibrary-branded. Supabase operates behind the scenes. The frontend must contain only the project's public/anon key, never the service-role key.

## Local Development

**Requirements:** Node.js 20+ and npm.

1. Open the project folder in VS Code.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a local `.env` file using your Supabase project credentials. Alternatively, copy `.env.example` to `.env.local` if that file exists.
4. Configure these variables using the names expected by `src/lib/supabase.ts`:

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_public_anon_key
   ```

   These are public client values. Never put a service-role or other secret key in a `VITE_` variable.

5. Start the development server:

   ```bash
   npm run dev
   ```

**Security:** Never commit `.env` or other files containing secrets. The `.gitignore` file should exclude local environment files.

## Supabase Setup and Connection

1. Create a Supabase project and save the database password securely.
2. Open the Supabase SQL Editor and run `supabase/schema.sql` if you are setting up a new project. Do not rerun it on an existing production database without reviewing the SQL first.
3. In **Authentication → URL Configuration**, configure the local Site URL as `http://localhost:5173`. Add your production URL after deployment.
4. Configure email confirmation and password-reset redirect URLs. Use a reliable email provider before public launch; default testing email limits may be restrictive.
5. Enable appropriate password protections and multifactor authentication (MFA). Admin MFA must be configured and tested in Supabase before public launch.
6. Deploy the Edge Functions from the project root using the Supabase CLI:

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy get-book-url
   supabase functions deploy delete-account
   ```

   Edge Functions should use server-side environment values. Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.

7. Create your intended admin account through the normal Elibrary sign-up page and confirm the email. In Supabase Dashboard → Authentication → Users, copy that user's UUID. In the SQL Editor, run the following after replacing the placeholder:

   ```sql
   insert into public.user_roles (user_id, role)
   values ('YOUR-AUTH-USER-UUID', 'admin')
   on conflict (user_id) do update set role = 'admin';
   ```

   Do not create a public admin signup form or use a shared secret password to grant admin access.

8. Configure your local environment variables, restart Vite, and test sign-up, email confirmation, sign-in, upload, reading, downloading, password reset, and account deletion.

## Security Model and Current Limitations

- Public visitors are sent to sign-in. Browsing, uploads, the reader, and dashboards require authentication.
- Public sign-up creates only the `user` role. Admin roles are assigned through trusted SQL or provisioning.
- Row Level Security (RLS) protects database records. PDF objects are stored in a private bucket without a general authenticated read policy. The `get-book-url` Edge Function verifies the caller's session, active account, published book, and requested read/download permission before issuing a 30-minute signed URL and logging the event.
- Signed URLs are bearer links. Anyone who obtains one may use it until it expires. Deactivation blocks future app requests but cannot instantly revoke an already-issued signed URL.
- The `delete-account` function removes a user's uploaded PDFs and then deletes their Auth account. Their uploaded books and related activity are removed as part of that workflow. Test carefully with disposable accounts before launch.
- Uploads have a 50 MB client/bucket limit and a PDF MIME-type restriction. Client-side file checks are not malware scanning or deep file validation. Production should add server-side file validation, abuse controls, moderation/report handling, copyright takedown procedures, backups, and monitoring.
- A read event means the reader URL was requested, not that a person read every page. A download event means Elibrary issued a download URL, not that the file was successfully saved.
- Browser-based PDF reading does not guarantee that PDF bytes are never temporarily cached on a device.
- Admin activity currently loads all event rows to calculate per-user counts and displays the latest 100 events. Add pagination or aggregate database views before activity volume grows significantly.
- Admin MFA enforcement is not implemented in this frontend. Configure it in Supabase and test the required assurance level before public launch.

## Application Testing

Test on mobile and desktop using separate regular-user and admin accounts.

- [ ] Logged-out visitors cannot access `/books`, `/upload`, `/dashboard`, `/admin`, or `/read/:id`.
- [ ] A regular user cannot access the admin page or update a role.
- [ ] User A can search, read, and download a published PDF.
- [ ] User B can upload a PDF and its required metadata; it becomes searchable to signed-in users.
- [ ] Read/download permissions are checked by the Edge Function, not only by the UI.
- [ ] An admin can view users and activity and deactivate/reactivate another user, but cannot delete accounts.
- [ ] A deactivated user cannot browse, upload, or request new PDF URLs.
- [ ] Password reset, email confirmation, sign-out, and account deletion work.
- [ ] Invalid PDFs, oversized files, duplicate names, and failed uploads are tested.
- [ ] Storage and database usage are reviewed in the Supabase dashboard.

## Deployment and Hosting

1. Install dependencies and run the production build:

   ```bash
   npm install
   npm run build
   ```

2. Deploy the generated `dist/` directory to a static hosting provider such as Vercel or Netlify.
3. Configure the production environment variables in the hosting provider's project settings.
4. Configure SPA fallback to `index.html` if required by the host.
5. Add the production URL to Supabase Auth Site URL and redirect settings.
6. Run the application smoke tests again on the deployed domain.

The build should be tested locally after dependencies are installed. The source code alone does not establish that the application has been verified against a live Supabase project.

## Awareness and Launch Preparation

Before promoting Elibrary publicly:

- Prepare a short product demo and onboarding guide.
- Publish clear upload and copyright rules.
- Provide a contact and content-reporting channel.
- Establish a process for collecting user feedback.
- Avoid promising unlimited downloads or permanent preservation until usage and operating costs are understood.

## Scaling and Future Improvements

Prioritize improvements based on real usage and costs. Potential areas include:

- Database pagination and search improvements
- Storage and bandwidth monitoring
- Improved PDF rendering
- Moderation and reporting tools
- Analytics aggregation
- Automated backups
- Android and iOS clients using the same Supabase backend
