# E-commerce APP

React + TypeScrip + Vite frontend, Supabase (Postgres + Auth + Edge Functions)
backend, PayFast for payments (South Africa).

## Where everything going in the repo

```
e-commerce-app/
├── src/                          # React app
│   ├── lib/supabaseClient.ts
│   ├── context/AuthContext.tsx
│   ├── context/CartContext.tsx
│   ├── routes/ProtectedRoute.tsx
│   ├── components/Navbar.tsx
│   ├── pages/...
│   ├── types/index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   ├── migrations/0001_init.sql  # DB schema + RLS
│   └── functions/
│       ├── create-order/index.ts
│       ├── payfast-itn/index.ts
│       └── _shared/cors.ts
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── .env.example
└── .gitignore
```

## 1. Creation of Supabase Project

1. Go to https://supabase.com/dashboard → New Project. Note the project
   ref, the anon public key, and the service role key (Project Settings → API).
2. Install the Supabase CLI: `npm install -g supabase`
3. From the repo root: `supabase login` then `supabase link --project-ref YOUR-PROJECT-REF`

## 2. Apply the database schema

```bash
supabase db push
```
This runs `supabase/migrations/0001_init.sql` against your linked project —
creates every table, the `is_admin()` helper, and all RLS policies.

## Creation of first admin user

Sign up normally through the app once it's running (step 6), then in the
Supabase SQL editor run:

```sql
update profiles set role = 'admin' where id = 'the-user-uuid-from-auth-users';
```

## 4. Set up PayFast (sandbox)

1. Register a sandbox account at https://sandbox.payfast.co.za
2. Get the sandbox `merchant_id` and `merchant_key`.
3. Set an ITN passphrase in the PayFast sandbox account settings (optional
   but recommended — must match `PAYFAST_PASSPHRASE` below).

## 5. Configure environment variables

Frontend — copy `.env.example` to `.env.local` and fill in:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Edge Functions — these are **secrets**, set via the CLI, never committed:
```bash
supabase secrets set PAYFAST_MERCHANT_ID=your-sandbox-merchant-id
supabase secrets set PAYFAST_MERCHANT_KEY=your-sandbox-merchant-key
supabase secrets set PAYFAST_PASSPHRASE=your-passphrase
supabase secrets set PAYFAST_MODE=sandbox
supabase secrets set SITE_URL=http://localhost:5173
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
by Supabase inside Edge Functions — no need to be set.)

## 6. Deploy the Edge Functions

```bash
supabase functions deploy create-order
supabase functions deploy payfast-itn --no-verify-jwt
```

`--no-verify-jwt` is required on `payfast-itn` because PayFast calls it
directly, not through a logged-in Supabase session.

## 7. Install and run the frontend

```bash
npm install
npm run dev
```

Visit http://localhost:5173. Register an account, promote it to admin
(step 3), add a product from `/admin`, then shop → cart → checkout as a
normal customer in another browser/session to test the full flow.

