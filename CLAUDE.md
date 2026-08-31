@AGENTS.md

# Field Sales Map — Project Context

## What this app is
A standalone PWA (not a native app) for Provident LED's salesmen. It shows all
current deals/leads as pins on a map and lets a salesman tap a spot to create
a new lead at that location — replacing a feature they used to have in
SalesRabbit. Deployed on Vercel, reads from and writes to Monday.com via its API.

- Repo: github.com/ysteinberg1/field-sales-map
- Deployed: field-sales-map-seven.vercel.app (Vercel team "CC view")
- Workflow: pushed via GitHub Desktop for multi-file changes, or direct
  paste-edit on github.com for single-file fixes
- Storage: Vercel Blob (must be created as **public** — a private store was
  tried first and had to be deleted/recreated; access mode can't be changed
  after creation)
- Env vars: MONDAY_API_TOKEN, CRON_SECRET

## The four Monday.com source boards (this is the part Claude Code is missing)
Company: Provident LED, providentled-company.monday.com. Deals/leads live
across four boards that were consolidated from a historical migration
project (SalesRabbit export + PipeDrive CRM export + legacy Google Sheet).
Each board has its own location column and its own relevant detail columns:

| Board | Board ID | Location column | Key detail columns |
|---|---|---|---|
| Deals | 1558281108 | `location_mkv04x3y` ("Facility Address") | Salesman `color_mkv0qrwq`, Stage `deal_stage`, Sales notes `long_text_mm6khzqt` |
| Old Cashflow | 5102612766 | `location_mm6gzddh` | Address `text_mm6dbpxy`, Salesman `color_mm6d1vdk` |
| Pipedrive Archive | 5102614839 | `location_mm6kpjx2` ("Dedup Location" — NOT the plain `location_mm6g6z07`) | Stage `status`, Salesman `color_mm6dw3r2`, Deal Created `date4` |
| SalesRabbit Leads | 5099562913 | `location_mm6kf638` ("Dedup Location") | Lead Owner `color_mm4v4hed`, Status `color_mm4vht3r`, Note `long_text_mm4v6hdv`, Created `date_mm6mgd2r` |

**Why "Dedup Location" and not the raw Location column on Pipedrive/SalesRabbit:**
A prior migration pass deduplicated addresses across all four boards. Tier
precedence is **Deals > Old Cashflow > Pipedrive > SalesRabbit** — if an
address already exists on a higher-tier board, it does NOT get a pin on the
lower-tier board (it's a duplicate, not unprocessed data). The "Dedup
Location" columns hold coordinates only for addresses that are genuinely new
at that tier. An item on Pipedrive/SalesRabbit with no Dedup Location value
is deliberately excluded from the map — that's correct behavior, not a bug.

## Salesmen
Six-person picker, matched to SalesRabbit's Lead Owner labels (edited to
first names only): **JJ, Yoel, Shragie, Chuny, Ari, Neil**. The app needs a
salesman picker so writes are attributed correctly — otherwise every
app-created deal shows up as Yoel's own Monday account.

## Write behavior
New leads created from the map go to the **SalesRabbit board**, not Deals.
A separate "Convert to Deal" automation/button in Monday handles promotion
from lead to deal — the app does not do that step.

## Sync
Currently weekly full resync via cron (webhook route exists at
`/api/webhook` but has never been registered with Monday, so live
webhook-based sync isn't active yet).

## Known open items (as of last session)
- Register the SalesRabbit board webhook so sync happens live, not just weekly
- Add real app icons (icon-192.png / icon-512.png referenced in manifest.json don't exist — harmless 404 in console)
- Address search box needs a Google Places API key/billing decision — not yet made
- Pin icon design pass — currently a plain colored dot per source board
- Unresolved bug: on Yoel's work computer (managed Chrome profile with extensions), the map sometimes loads blank with no pins and a console error about a non-JS MIME type on a module script — suspected cause is a filter/monitoring tool (Teckloq) on that machine mangling JS chunk responses. `/api/pins` and `/api/sync` work correctly when hit directly; the mystery is specific to that one browser/machine. Diagnostic logging (`[field-map]`, `[pins]` prefixes) was added to isolate this if it recurs.

## Two Monday.com column-value gotchas learned the hard way
- Location-type columns must be written via GraphQL mutation with the
  variable typed as `JSON!`, not `String!` — using `String!` fails silently
  mid-batch with a type mismatch error. Label writes use
  `change_simple_column_value` (`String!` is correct there) and are unaffected.
- CSV import of a Location column: value must be a plain string
  `"lat lng full_address"`, not a JSON object.
