# Provident Field Sales Map

PWA for the salesmen — a map defaulting to their current location, showing
deduped pins from Deals, Old Cashflow, Pipedrive Archive, and SalesRabbit,
with tap-to-view and tap-to-create-lead.

## Setup

1. `npm install`
2. Push this repo to GitHub (`ysteinberg1/field-sales-map` to match your
   naming convention).
3. Import into Vercel. Add these environment variables:
   - `MONDAY_API_TOKEN` — your Monday API v2 token
   - `CRON_SECRET` — any random string, used to authorize the weekly cron
   - `BLOB_READ_WRITE_TOKEN` — created automatically when you add Vercel Blob
     storage to the project (Storage tab → create a Blob store)
4. Deploy. Then hit `https://<your-url>/api/sync` once (in a browser) to do
   the first full pull from Monday.
5. On the phone: open the URL in Safari/Chrome → Share → Add to Home Screen.

## Still to finish before real use

- `src/app/api/create-deal/route.ts` has a placeholder
  `SALESRABBIT_SALESMAN_COL` — needs the real column ID for SalesRabbit's
  Salesman field.
- Register the webhook on the SalesRabbit board (Monday → Integrations →
  Webhooks, or via API) pointing at `/api/webhook` so new/edited items push
  instantly instead of waiting for the weekly cron.
- The map style is MapLibre's free demo tiles — fine for launch, but a
  MapTiler or similar key would look sharper.
- No address-search box yet (needs a geocoding key — see the cost note
  Claude gave in chat re: Google Places billing).
- Icon design pass: currently a colored dot per source board. Sit down
  together and design a status-based icon set once the data flow is proven.
- `/icon-192.png` and `/icon-512.png` referenced in the manifest don't exist
  yet — add real app icons or the home-screen icon will be blank.
