# Neuroid Cortex

Neuroid's founders dashboard. Clients, costs, invoice reminders, onboarding and profit
in one place, with a line down the middle: the operator runs the day, the
founder sees the money.

**Live:** [foundery-laksh-sehgals-projects.vercel.app](https://foundery-laksh-sehgals-projects.vercel.app)
— Vercel (`foundery`, auto-deploys from `main`) + Supabase.

<!-- Screens: Today · Clients · Costs · Invoices · Onboarding · Founder · P&L -->

## Running it locally

```bash
npm install
cp .env.example .env      # then edit it — see below
npm run seed              # optional: fills the database with a sample agency
npm run dev               # http://localhost:3000
```

No database to install. With `DATABASE_URL` empty, Cortex runs on **PGlite** —
Postgres compiled to WASM — against a local `.pglite/` directory. It is the same
engine and the same SQL that runs on Supabase, so local development and the test
suite exercise the real thing rather than a stand-in.

`.env` is the whole configuration. Nothing in it is stored in the database, so
nobody can read the passcodes back out of the running app:

| Variable | What it does |
|---|---|
| `FOUNDERY_FOUNDER_PASSCODE` | Signs you in as the founder. Sees everything. |
| `FOUNDERY_OPERATOR_PASSCODE` | Signs you in as the operator. The day-to-day view. |
| `FOUNDERY_SESSION_SECRET` | Signs session cookies. Change it and everyone is signed out. |
| `DATABASE_URL` | Supabase connection string. Empty = local PGlite. |
| `FOUNDERY_DB_CA_CERT` | Optional: Supabase's CA certificate, to verify TLS properly. |
| `FOUNDERY_PUBLIC_URL` | Base for the shareable onboarding links. |
| `FOUNDERY_CURRENCY` | `INR` (default), `USD`, `GBP`, `EUR` or `AED`. |

Generate a real secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Before this leaves your machine:** change both passcodes and the session
secret. Session cookies are only marked `secure` in production, and a passcode
over plain HTTP is a passcode in the open.

### The rest of the commands

```bash
npm run build      # production build
npm start          # serve the build
npm test           # redaction, money and session suites, on real Postgres
npm run typecheck  # tsc, no emit
npm run lint       # eslint
npm run db:setup   # apply db/schema.sql to whatever DATABASE_URL points at
npm run seed       # seed if the database is empty
npm run seed -- --force   # wipe and re-seed
npm run reset      # delete the local database and seed from scratch
```

One caveat on the local backend: **PGlite is single-process.** The dev server
holds `.pglite/`, so a second process (a seed script, a psql-style query) can't
open it at the same time. Stop the dev server first. Supabase has no such
limitation.

## Who sees what

Two passcodes, two views. The important part is *where* that is enforced: the
query layer drops anything the signed-in role isn't cleared for **before it
leaves the server**, so a redacted figure never reaches the browser to be
un-hidden by anyone reading the page source.

| | Operator | Founder |
|---|---|---|
| Client names, services, retainer vs project, VIP, billing dates | ✅ | ✅ |
| Retainer size, project value, cost to serve, account health | switch, off by default | ✅ |
| Cost **category** totals — including what salaries cost in total | ✅ | ✅ |
| Individual salary lines: who, and how much | **never** | ✅ |
| Tools, contractor, marketing, charity line items | ✅ | ✅ |
| Invoice raise-tasks: billing days, raised/unraised, marking | ✅ | ✅ |
| Onboarding forms, public links and replies | ✅ | ✅ |
| Margins, revenue projection, risk report | ❌ | ✅ |
| Profit tracker and P&L | ❌ | ✅ |
| Settings and the activity log | ❌ | ✅ |

The switch lives on **Settings**. The row that isn't a switch is
individual pay: the operator sees that the team costs, say, ₹2.8L a month
across four people — which is the number they need to price work — and never
sees what any one of them earns. There is no setting for it, by design.

Writes are gated too, not just reads. The operator can add and edit clients,
mark invoices raised, and build onboarding forms. They cannot set a
client's value or any cost — those fields are only read
off the submitted form when a founder submits it, so a forged post gets
nowhere. Deleting anything is founder-only.

Every write is recorded in an activity log with the role that made it,
readable on Settings.

## How it fits together

```
db/schema.sql     the whole database, idempotent. Run it with `npm run db:setup`.

src/lib/          the part worth reading first
  session.ts      passcodes → signed role token, and back. No framework imports,
                  so the security core is testable on its own.
  auth.ts         request-scoped glue: currentRole, requireRole, requireFounder
  policy.ts       ONE object answering "can this role see X". Every redaction
                  in the app resolves through it.
  queries.ts      role-aware reads. Redaction happens here, at the source.
  analytics.ts    founder-only maths: margins, projection, risk, P&L
  economics.ts    how a contract becomes a monthly number — shared by the
                  clients table and the founder dashboard so they agree
  db.ts           Postgres (`pg`) or PGlite behind one interface, plus the
                  type parsers, the `@name` bind helper and the audit log
  taxonomy.ts     the vocabulary of the business, and the fixed colour per
                  cost category

src/app/
  (app)/          everything behind a passcode
  onboard/[token] the public client form — the only unauthenticated write
  actions/        server actions, each re-checking the role at its boundary

src/components/ui/   the Neuroid UI kit primitives (docs/NEUROID-UI-KIT.md)
```

### Some decisions worth knowing about

**Dates are calendar days, and stay that way.** `date` columns come back from
both drivers as plain `YYYY-MM-DD` strings rather than `Date` objects. A due
date that shifts by a day because the function ran in a different timezone is
the kind of bug that quietly corrupts a P&L, and this closes the door on it.

**Money is `numeric(14,2)`, parsed to a JavaScript number.** Postgres hands
`numeric` back as a string to protect precision; the largest realistic figure
here is a few crore, which a double holds exactly to the paisa.

**A project is spread across the months it runs.** A ₹3L build over three
months shows as ₹1L a month next to a ₹1L retainer, with the contract total in
the sub-line. Otherwise a one-off looks like the biggest client you have, and
its margin can't be compared with anything.

**The P&L uses the cost base as it stood in that month**, not today's — a cost
that started in March isn't charged against February. A month with no contracts
and no costs shows a dash, not a zero: "we have no figures" and "we earned
nothing" are different statements.

**P&L revenue reads off the contracted book**, not off invoices: each month
carries every retainer live in it plus each project's monthly slice, bounded
by the contract's dates. The actual billing and collection happen in Zoho
Books, which stays the accounting system of record.

**The reminder that matters most is for an invoice that doesn't exist.**
Cortex checks each active retainer against its billing day and tells you
when this month's invoice hasn't been raised in Zoho yet — the failure that
costs a month of cash and never appears on an invoice list, because the
missing invoice isn't there to be listed.

**Runway is blank until you enter a cash balance** on Settings. A made-up
runway is worse than no runway.

## Guided client onboarding

"Start onboarding" on a client's card creates a **personalised link**
(`/welcome/…`) to send that client. They see "Hello, {their name}" and a
two-step flow: a fixed details form (contact, authorised signatory, GST
certificate, Shopify domain, Google Ads ID), then an access checklist (Meta
Business Manager partner access, Meta ad account, Shopify collaborator,
Google Ads, Merchant Center, GA4) they tick off as they grant each one, with
partial saves. When every box is ticked the onboarding flips to **Onboarded**
on their card, and everything they entered is readable on the Onboarding page.

Set the settings keys `neuroid_meta_bm_id`, `neuroid_shopify_collab`,
`neuroid_google_mcc`, `neuroid_gmc_email` and `neuroid_ga_email` and the
checklist instructions include your actual IDs.

## Sign-in

Passwordless, two ways: **Continue with Google** (through Supabase Auth), or
a **6-digit code emailed** to you — generated and verified by Cortex
itself and delivered by **Resend**, so the email contains the code and never
a link. Who gets in is managed on the **Team card** (Settings): add or
remove founder/operator emails from the dashboard. The environment lists
(`FOUNDERY_FOUNDER_EMAILS`, default the founder's address) remain the floor
beneath the table, so the founder can never be locked out. The list is
checked *before* any code is sent — a stranger's address never receives
mail. After identity is verified, Cortex mints its own signed 12-hour role
cookie, so the role/redaction layer is identical across every sign-in path.

Resend setup is one card: paste an API key from resend.com, optionally a
from-address on a domain you've verified there (until then, Resend's test
sender delivers only to your own inbox). Google needs one-time setup in
Supabase: Authentication → Providers → Google, with an OAuth client from
Google Cloud Console (redirect URI
`https://<project-ref>.supabase.co/auth/v1/callback`).

Local development, with neither configured, falls back to the passcode form;
`/login?method=passcode` reaches it anywhere passcodes are set in the
environment.

## Invoices

Invoicing lives in **Zoho Books** — amounts, PDFs, payment chasing, all of it.
Cortex keeps exactly one fact per retainer per month: **did the invoice go
out?** The Invoices page lists every active retainer in billing-day order for
the current month (and anything missed last month, on top); you raise the
invoice in Zoho, then hit **Mark raised**. Unticked past the billing day shows
up on Today and in the founder risk report. Undo puts a mistaken mark back on
the list. One-off project invoices are raised straight in Zoho as milestones
land — Cortex doesn't track those.

## Onboarding links

Building a form gives you a public URL like `/onboard/xK3f…`. The token is 18
random bytes, not derived from the row id, so one link can never be guessed
from another. The client needs no account. A form can be closed to new replies,
and **Generate a new link** rotates the token, killing the old one immediately.

The public endpoint accepts nothing but answers to the questions that form
actually declares — unknown keys are dropped rather than stored, answers are
length-capped, and a hidden honeypot field silently swallows bots.

## Deploying to Vercel + Supabase

**1. Create the Supabase project**, then apply the schema. Either paste
`db/schema.sql` into the Supabase SQL editor, or run it from here:

```bash
DATABASE_URL="postgresql://..." npm run db:setup
```

Both are safe to re-run — the file is idempotent.

**2. Get the right connection string.** In Supabase: *Connect → Transaction
pooler*, port **6543**. This matters. Serverless functions open many
short-lived connections; the transaction pooler is built for exactly that,
while the direct connection on 5432 will run out of slots under any real load.

**3. Set the environment variables** in Vercel (Project → Settings →
Environment Variables):

| Variable | Value |
|---|---|
| `DATABASE_URL` | The transaction-pooler string, port 6543 |
| `FOUNDERY_FOUNDER_PASSCODE` | Your passcode |
| `FOUNDERY_OPERATOR_PASSCODE` | Your operator's passcode |
| `FOUNDERY_SESSION_SECRET` | 32 random bytes, generated as above |
| `FOUNDERY_CURRENCY` | `INR` |
| `FOUNDERY_PUBLIC_URL` | Your domain, e.g. `https://foundery.neuroidmedia.com` |

`FOUNDERY_PUBLIC_URL` only affects the onboarding links you copy out of the
app; left unset, it falls back to the Vercel production domain.

**4. Deploy.** No `vercel.json` is needed — the build is a standard Next.js
build and touches no database, because every page is `force-dynamic`.

**5. Seed it, if you want the sample data to look at first:**

```bash
DATABASE_URL="postgresql://..." npm run seed
```

Then delete the sample clients and put your own in.

### Put the functions next to the database

Vercel defaults to `iad1` (Washington DC). If your Supabase project is in
Mumbai, every single query crosses the Atlantic and back — on a page that runs
five queries, that is most of the page load. Set the function region to match
your Supabase region under **Project → Settings → Functions**. For a Mumbai
Supabase, that is `bom1`.

### Backups

Supabase takes daily backups on paid plans. On the free plan, take your own:

```bash
pg_dump "$DATABASE_URL" --schema=foundery --no-owner -f "foundery-$(date +%F).sql"
```

### A note on Supabase's REST API

Supabase auto-generates a public REST API over the `public` schema, reachable
with the anon key. Cortex's tables hold salaries and client revenue, so they
live in a **`foundery` schema instead** — PostgREST never sees them. Row level
security is switched on underneath as a second lock, and the app connects as
the owner role, which bypasses RLS by design. Don't move these tables into
`public`.

### TLS

Without `FOUNDERY_DB_CA_CERT`, the database connection is encrypted but the
certificate chain isn't verified — that is what `sslmode=require` means, and
what Supabase's own quickstarts use. To verify properly, copy the certificate
from *Supabase → Settings → Database → SSL configuration* into that variable.

## Branding

The design system is `docs/NEUROID-UI-KIT.md`, used as written — its tokens are
`src/app/globals.css` verbatim, and every screen is built from the primitives
in `src/components/ui/`. No hex outside `globals.css`. Both themes are wired up;
the toggle is at the foot of the sidebar.

Two font files ship in `public/fonts/`: DM Sans, and **PP Editorial New**, which
is commercially licensed — it is here because Neuroid holds a licence for it.
Anyone forking this needs their own, or the display stack falls back to Georgia
and everything still works.

The logo is one PNG. On dark it's knocked out to solid white by
`.logo-adaptive` in `globals.css`; dropping a real light-on-dark lockup in and
pointing that rule at it is the upgrade when the artwork exists.
