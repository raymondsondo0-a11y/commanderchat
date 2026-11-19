# CommanderChat

WhatsApp-inspired real-time chat app built with React, Vite and Supabase.

## Supabase setup
1. Open the Supabase project SQL Editor.
2. Run the complete script in `supabase/schema.sql`.
3. In Authentication → URL Configuration, set the Site URL to your deployed Vercel URL after deployment.
4. For quick testing, disable email confirmation in Authentication → Providers → Email. Re-enable it before public launch if desired.

## Vercel setup
Import this repository as a Vite project. Add these Environment Variables:
- `VITE_SUPABASE_URL` = your Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase publishable key

Deploy. Never put a Supabase secret/service-role key in frontend environment variables.

## Local development
`npm install`
`npm run dev`
