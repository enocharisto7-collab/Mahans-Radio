MAHANS RADIO 97.9 — FULL RADIO PORTAL PACKAGE

WHAT'S INCLUDED
- Responsive public website for Android, iPhone and desktop
- Live player configured with the station's supplied MP3 endpoint
- Programme, presenter, newsroom, podcast and advertising sections
- Listener message form (stores to Supabase when configured; WhatsApp fallback otherwise)
- Admin sign-in and station dashboard
- Programme/presenter/news/podcast/advertisement publishing
- Media upload to Supabase Storage (images, audio, video, PDF)
- Listener message inbox and basic dashboard counts
- PWA manifest and offline caching for the shell

IMPORTANT CURRENT BACKEND STATUS
This package is prepared for Supabase, but it has NOT been connected to or migrated into a live database yet.
The only linked Supabase project found is the existing Creative Minds Production project, with marketplace tables.
Do not run supabase/schema.sql in that shared project unless you deliberately want both apps in one database.
Create a separate Supabase project for Mahans Radio, or explicitly approve using the existing project.

SETUP
1. Extract the ZIP.
2. Open config.js and replace:
   PASTE_YOUR_SUPABASE_PROJECT_URL
   PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY
   with the URL and publishable key for the dedicated Mahans Radio Supabase project.
   Never paste a service_role or secret key into config.js.
3. In that Mahans Radio project's SQL Editor, run supabase/schema.sql.
4. Create an administrator account in Supabase Authentication (email/password).
5. In SQL Editor, authorise the admin account:
   insert into public.radio_admins(user_id)
   select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
   on conflict do nothing;
6. Host the folder on an HTTPS static host. Opening index.html from a file manager is not a proper published deployment.
7. Visit the site, choose STAFF LOGIN and sign in.

LIVE STREAM
The player is configured with:
http://135.181.212.132:6950/radio.mp3
This endpoint was supplied earlier, but its live audio reachability is not verified here.
On an HTTPS site, browser mixed-content rules may block HTTP audio. Ask the stream host for an HTTPS endpoint or deploy a secure audio relay.

CURRENT LIMITATIONS / PRODUCTION CHECKLIST
- Dashboard content publishing and upload flows are wired to Supabase once schema and keys are configured.
- Public homepage uses attractive starter content; live database content loading into the public cards is a next integration step.
- Listener event table is ready; analytics charts and automatic play tracking need further implementation.
- No payment gateway, advertising billing, or automated ad insertion is configured.
- Protect admin accounts with strong passwords and enable email confirmation / MFA in Supabase.
- Use a trusted HTTPS host and custom domain. Domain DNS and hosting account access are still needed for publication.
