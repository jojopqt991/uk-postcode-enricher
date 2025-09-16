Postcode Enricher (Client-only)
================================

Paste UK postcodes, enrich them using the public `postcodes.io` API, preview the results in the browser, and download a CSV. Runs entirely client-side.

Features
- Light, minimal UI
- Paste postcodes (one per line or comma-separated)
- De-duplicates and normalizes formatting
- Fetches admin data via `https://api.postcodes.io/postcodes`
- In-page preview table (first 500 rows)
- Download CSV (Blob URL)

Usage
1. Open `postcode_retrieval.html` in your browser.
2. Paste postcodes.
3. Click “Enrich data”.
4. Preview the table and click “Download CSV”.

Development
- No build or server required; it is a single HTML file.
- Modify the fields in the `FIELDS` array to include/exclude columns.

License
MIT — see `LICENSE`.

