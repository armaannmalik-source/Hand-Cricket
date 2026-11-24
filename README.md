# Hand Cricket Online — PWA starter

A mobile-first, room-code-only hand cricket game. Two players create/join a private room and play a two-innings match.

## 1. Set up the online backend

1. Create a free project at https://supabase.com/.
2. In the Supabase dashboard, open **SQL Editor** and run all of `schema.sql`.
3. Open **Project Settings → API**. Copy the Project URL and anon/public key.
4. Paste them into `config.js` as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
5. Keep the anon key in the browser only. Never put a `service_role` key in this project.

## 2. Run locally

PWAs and service workers need HTTPS or localhost.

- Easiest: use VS Code with the Live Server extension and open the local URL.
- Or run `python -m http.server 8000` in this folder, then open `http://localhost:8000`.

Open the same hosted URL on two different phones/browsers. One creates a room; the other enters the six-digit code.

## 3. Deploy

Upload the folder to a static host such as Netlify or Vercel. Add your deployed domain to Supabase **Authentication → URL Configuration** if you later add authentication. HTTPS is required for installability/service workers.

## Important security note

This is a functional prototype scaffold, not a hardened public launch. The included SQL policies allow anonymous clients to read and update room records. A room code is not strong access control. Before sharing widely, replace the open policies with authenticated player identities and server-side validation (for example, Supabase Edge Functions) so clients cannot impersonate players or rewrite scores.

## Game rules in this version

- Each player chooses 1–6 each ball.
- During batting, equal numbers mean a wicket; otherwise the batter's number is added.
- Six wickets or the selected over limit ends an innings.
- Players switch roles for the second innings.
- The second innings ends when the target is reached or the innings ends.
- Overs are shown in cricket notation (e.g. 2.3 = 2 overs and 3 balls).
