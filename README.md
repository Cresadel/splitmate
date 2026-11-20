# SplitMate (lean version)
React + Vite + Tailwind + Supabase bill splitter.

## Setup
1. Create a Supabase project. In the SQL Editor, run `supabase/migrations/001_schema.sql`.
2. (Optional, easier testing) Authentication > Providers > Email: turn off "Confirm email".
3. `cp .env.example .env`, then fill in your project URL and anon key (never the service role key).
4. `npm install` then `npm run dev`.

## Notes
- Expenses and settlements are created only through the `create_expense` / `create_settlement` database functions, so shares always add up and debts are validated.
- Balances are calculated live: Net = Paid - Shares + Settlements Paid - Settlements Received.
- Not included yet: group editing, images, expense editing, expense history page with filters, charts, activity feed.

## Demo seed (boarding house) — testing only
The seed script creates five demo users and a "Boarding House" group so you can test Balances and "Who pays whom".

1. Turn off "Confirm email" (Authentication > Providers > Email) so the script can sign in the demo users.
2. Run `npm run seed:boardinghouse`.
3. Log in as any demo user, for example `mia.demo@splitmate.test` / `SplitMateDemo123!`.

Demo emails: `mia.demo@splitmate.test`, `joy.demo@splitmate.test`, `karl.demo@splitmate.test`, `ben.demo@splitmate.test`, `lea.demo@splitmate.test`. Password for all: `SplitMateDemo123!`.

Expected balances: Mia +₱335.00, Joy -₱2,065.00, Karl +₱35.00, Lea +₱3,535.00, Ben -₱1,840.00.

Expected simplified payments: Joy pays Lea ₱2,065.00, Ben pays Lea ₱1,470.00, Ben pays Mia ₱335.00, Ben pays Karl ₱35.00.

Re-running is safe: if Mia's "Boarding House" group already exists, the script exits without adding duplicates.
