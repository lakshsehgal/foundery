# Foundery

Neuroid's founders dashboard. Clients, costs, invoices, onboarding and profit
in one place, with a line down the middle: the operator runs the day, the
founder sees the money.

<!-- Screens: Today · Clients · Costs · Invoices · Onboarding · Founder · P&L -->

## Running it

```bash
npm install
cp .env.example .env      # then edit it — see below
npm run seed              # optional: fills the database with a sample agency
npm run dev               # http://localhost:3000
```

`.env` is the whole configuration. Nothing in it is stored in the database, so
nobody can read the passcodes back out of the running app:

| Variable | What it does |
|---|---|
| `FOUNDERY_FOUNDER_PASSCODE` | Signs you in as the founder. Sees everything. |
| `FOUNDERY_OPERATOR_PASSCODE` | Signs you in as the operator. The day-to-day view. |
| `FOUNDERY_SESSION_SECRET` | Signs session cookies. Change it and everyone is signed out. |
| `FOUNDERY_DB_PATH` | Where the SQLite file lives. Defaults to `data/foundery.db`. |
| `FOUNDERY_PUBLIC_URL` | Base for the shareable onboarding links. |
| `FOUNDERY_CURRENCY` | `INR` (default), `USD`, `GBP`, `EUR` or `AED`. |

Generate a real secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Before this leaves your machine:** change both passcodes and the session
secret, and serve it over HTTPS — session cookies are only marked `secure` in
production, and a passcode over plain HTTP is a passcode in the open.

### The rest of the commands

```bash
npm run build      # production build
npm start          # serve the build
npm test           # the redaction, money and session suites
npm run typecheck  # tsc, no emit
npm run seed       # seed if the database is empty
npm run seed -- --force   # wipe and re-seed
npm run reset      # delete the database file and seed from scratch
```

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
| Invoice dates, terms, status, days overdue | ✅ | ✅ |
| Invoice amounts | switch, on by default | ✅ |
| Onboarding forms, public links and replies | ✅ | ✅ |
| Margins, revenue projection, risk report | ❌ | ✅ |
| Profit tracker and P&L | ❌ | ✅ |
| Settings and the activity log | ❌ | ✅ |

The two switches live on **Settings**. The row that isn't a switch is
individual pay: the operator sees that the team costs, say, ₹2.8L a month
across four people — which is the number they need to price work — and never
sees what any one of them earns. There is no setting for it, by design.

Writes are gated too, not just reads. The operator can add and edit clients,
raise invoices, chase them, and build onboarding forms. They cannot set a
client's value, an invoice amount, or any cost — those fields are only read
off the submitted form when a founder submits it, so a forged post gets
nowhere. Deleting anything is founder-only.

Every write is recorded in an activity log with the role that made it,
readable on Settings.

## How it fits together

```
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
  db.ts           SQLite, schema, migrations, audit log
  taxonomy.ts     the vocabulary of the business, and the fixed colour per
                  cost category

src/app/
  (app)/          everything behind a passcode
  onboard/[token] the public client form — the only unauthenticated write
  actions/        server actions, each re-checking the role at its boundary

src/components/ui/   the Neuroid UI kit primitives (docs/NEUROID-UI-KIT.md)
```

### Some decisions worth knowing about

**A project is spread across the months it runs.** A ₹3L build over three
months shows as ₹1L a month next to a ₹1L retainer, with the contract total in
the sub-line. Otherwise a one-off looks like the biggest client you have, and
its margin can't be compared with anything.

**The P&L uses the cost base as it stood in that month**, not today's — a cost
that started in March isn't charged against February. A month with no invoices
and no costs shows a dash, not a zero: "we have no figures" and "we earned
nothing" are different statements.

**Invoiced vs collected** is a toggle on the P&L, because in a month where a
client pays late they are two different businesses.

**The reminder that matters most is for an invoice that doesn't exist.**
Foundery checks each active retainer against its billing day and tells you
when this month's invoice hasn't gone out — the failure that costs a month of
cash and never appears on an invoice list, because the missing invoice isn't
there to be listed.

**Runway is blank until you enter a cash balance** on Settings. A made-up
runway is worse than no runway.

## Onboarding links

Building a form gives you a public URL like `/onboard/xK3f…`. The token is 18
random bytes, not derived from the row id, so one link can never be guessed
from another. The client needs no account. A form can be closed to new replies,
and **Generate a new link** rotates the token, killing the old one immediately.

The public endpoint accepts nothing but answers to the questions that form
actually declares — unknown keys are dropped rather than stored, answers are
length-capped, and a hidden honeypot field silently swallows bots.

## Deploying

SQLite means one writer and a real filesystem, so Foundery wants a small
persistent box — a VPS, a Fly volume, a Pi in the office — not a serverless
platform with an ephemeral disk. Put it behind HTTPS, keep `data/` on a disk
that gets backed up, and that is the whole operation.

Back up by copying the database file:

```bash
sqlite3 data/foundery.db ".backup 'backup-$(date +%F).db'"
```

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
