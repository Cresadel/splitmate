# SplitMate
SplitMate is a bill splitter for roommates sharing an apartment or boarding house.

## Features
- **Budget**: plan monthly bills and see how much each roommate pays.
- **Payments**: track who has paid their share with Paid, Partial, Unpaid or Advance status.
- **Expenses**: record shared costs and choose who shares them.
- **Balances**: see the simplest way to settle up with "Who pays whom".
- **Settlements**: record payments made to settle debts.
- **Roommates**: add and remove roommates.
- **How to use**: open the in-app guide from the header.

## Rules
- One account can belong to only one active apartment.
- Only the owner can add roommates by email.
- A roommate who leaves stays in the history until their balance is settled.

## Tech stack
React, Vite, Tailwind CSS, React Router, and Supabase (Auth, PostgreSQL, Row Level Security, SQL functions).

## Setup
1. Create a Supabase project.
2. Run the SQL files in `supabase/migrations` in the SQL Editor.
3. Copy `.env.example` to `.env` and fill in the project URL and publishable key. Never use the service role key.
4. Run `npm install`.
5. Run `npm run dev`.

## Project structure
- `src/pages` — page-level views such as the welcome screen, authentication, and apartment details.
- `src/components` — reusable UI and apartment features such as budget, payments, and the guide modal.
- `src/utils` — shared helpers for money, payment calculations, and UI utilities.
- `src/lib` — Supabase client and authentication context.
