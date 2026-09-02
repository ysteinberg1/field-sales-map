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
| Pipedrive Archive | 5102614839 | `location_mm6g6z07` (plain Location — NOT `location_mm6kpjx2` "Dedup Location") | Stage `status`, Salesman `color_mm6dw3r2`, Deal Created `date4` |
| SalesRabbit Leads | 5099562913 | `location_mm6g8ayt` (plain Location — NOT `location_mm6kf638` "Dedup Location") | Lead Owner `color_mm4v4hed`, Status `color_mm4vht3r`, Note `long_text_mm4v6hdv`, Created `date_mm6mgd2r` |

**Why the raw Location column and not "Dedup Location" (changed 2026-09):**
An earlier migration pass deduplicated addresses across all four boards, and
this app originally read the "Dedup Location" columns so a lower-tier board
would have no coordinate (and no pin) wherever a higher-tier board already
had that address. That hid real information — e.g. a Pipedrive "not
qualified" note sitting at the same address as a live Deals record would
just disappear — so the app was switched to the raw Location column on
every board; every item with a location gets a pin now, full stop. The
"Dedup Location" columns still exist on Pipedrive/SalesRabbit but the app no
longer reads them.

Each pin still carries its source board's `tier` (**Deals=0 > Old
Cashflow=1 > Pipedrive=2 > SalesRabbit=3**, lower wins) as metadata. It's
used only for the **"Show overlapping leads"** checkbox in the Filters
dropdown (`src/components/FieldMap.tsx`) — checked (the default) shows every
board's pin even when several land on the same address; unchecked collapses
each overlapping spot down to just the highest-tier pin. This is a
display-time filter only, computed client-side from the already-fetched
pins — it does not affect what's fetched, stored, or synced.

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

## Known open items (as of 2026-09-02)
- Register the SalesRabbit board webhook so sync happens live, not just weekly
- Pin icon design pass — currently a plain colored dot per source board
- Unresolved bug: on Yoel's work computer (managed Chrome profile with extensions), the map sometimes loads blank with no pins and a console error about a non-JS MIME type on a module script — suspected cause is a filter/monitoring tool (Teckloq) on that machine mangling JS chunk responses. `/api/pins` and `/api/sync` work correctly when hit directly; the mystery is specific to that one browser/machine. Diagnostic logging (`[field-map]`, `[pins]` prefixes) was added to isolate this if it recurs.

Resolved since the note above was written: app icons exist
(icon-192.png/icon-512.png) and the PWA installs standalone on iOS/Android;
Google Places/Geocoding billing is active and the search bar works
(Enter key or the ▶ button, not just picking a dropdown suggestion).

## Two Monday.com column-value gotchas learned the hard way
- Location-type columns must be written via GraphQL mutation with the
  variable typed as `JSON!`, not `String!` — using `String!` fails silently
  mid-batch with a type mismatch error. Label writes use
  `change_simple_column_value` (`String!` is correct there) and are unaffected.
- CSV import of a Location column: value must be a plain string
  `"lat lng full_address"`, not a JSON object.
