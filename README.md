# GEC Sheikhpura Hostel Care

Digital complaint register replacing the paper notebook — fans, lights, chairs, doors, taps, coolers, washrooms, mess.

**Stack:** TanStack Start + Cloudflare Workers/D1/R2 + Better Auth + Drizzle.

## Quick start

```bash
npm install
npm run db:apply:local     # create local D1 tables (drizzle/0000_init.sql)
npm run dev                # http://localhost:3000
```

Sign up as a student, then promote yourself to warden/admin:

```bash
npm run promote -- you@college.ac.in admin BH1
npm run promote -- warden@gec.ac.in warden BH1
```

Create staff logins from `/admin` (admin only).

## Demo accounts

Load the demo hostel (requires the dev server running on port 3000):

```bash
npm run dev            # in one terminal
npm run seed:demo      # in another
```

| Role | Email | Password | Lands on |
|---|---|---|---|
| student | `student@gec.edu` | `student123` | `/bulletin` |
| staff (Electrician) | `gaurav@gec.edu` | `staff12345` | `/queue` |
| staff (Caretaker) | `kanhaiya@gec.edu` | `staff12345` | `/queue` |
| warden (Boys Hostel 1) | `kamal@gec.edu` | `warden12345` | `/attention` |
| warden (Boys Hostel 2) | `zaki@gec.edu` | `warden12345` | `/attention` |
| admin (Chief Warden) | `chitranjan@gec.edu` | `admin12345` | `/attention` |

These are demo-only credentials against local seed data — rotate or delete before any real deployment. Signup cannot set a role, so the seed script promotes each account directly in the local D1 database.

Sign-in requires a valid session for every page except `/login` and `/signup`; unauthenticated requests are redirected to `/login`.

## Roles

| role | sees |
|---|---|
| student | own complaints, file new, verify+rate |
| staff | assigned queue, status steps |
| warden | whole hostel triage, assign, notices, SLA sweep |
| admin | everything + users + analytics |

## Flows

`submitted → acknowledged → in_progress → resolved → closed`, with `rejected` / `reopened` branches. Every transition writes to `activities` (audit register). Students `+1` duplicates via upvotes; add comments; upload before/after photos (R2, local `.data/uploads` in dev).

SLA defaults per category live in `sla_policies`; wardens run **Run SLA check** to mark overdue.

## Deploy (Cloudflare)

```bash
npx wrangler d1 create gec-hostel-db   # put id in wrangler.jsonc
npx wrangler r2 bucket create gec-hostel-photos
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler d1 migrations apply gec-hostel-db --remote
npm run deploy
```

Env: `BETTER_AUTH_URL=https://<your-domain>`, `BETTER_AUTH_SECRET` (32+ chars).
