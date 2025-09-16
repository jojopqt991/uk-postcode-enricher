const API_URL = "https://api.postcodes.io/postcodes";
const MAX_BATCH = 100;

const FIELDS = [
  "country",
  "nhs_ha",
  "admin_county",
  "admin_district",
  "admin_ward",
  "parliamentary_constituency",
  "european_electoral_region",
  "primary_care_trust",
  "region",
  "parish",
  "latitude",
  "longitude"
];

const el = (q) => document.querySelector(q);
const input = el('#input');
const runBtn = el('#run');
const downloadBtn = el('#download');
const tableWrap = el('#tableWrap');
const tableEl = el('#table');
const statusEl = el('#status');
const resultsEl = el('#results');

function parsePostcodes(raw) {
  const normalize = (s) => {
    const compact = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (compact.length < 5 || compact.length > 8) return '';
    return compact.replace(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/, '$1 $2');
  };
  const tokens = raw
    .replace(/,/g, '\n')
    .split(/\r?\n/)
    .map(s => normalize(s.trim()))
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const pc of tokens) {
    if (!seen.has(pc)) { seen.add(pc); out.push(pc); }
  }
  return out;
}

// Removed updateCount and related event listeners since we simplified the UI

async function fetchBatch(postcodes) {
  const body = { postcodes };
  console.log('Fetching postcodes:', postcodes);
  console.log('API URL:', API_URL);

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  console.log('Response status:', resp.status);
  console.log('Response ok:', resp.ok);

  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);

  const data = await resp.json();
  console.log('API response:', data);
  console.log('Result count:', data.result?.length);

  return data.result || [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function enrich(postcodes) {
  const rows = [];
  for (let i = 0; i < postcodes.length; i += MAX_BATCH) {
    const chunk = postcodes.slice(i, i + MAX_BATCH);
    statusEl.textContent = `Fetching ${i + 1}-${Math.min(i + MAX_BATCH, postcodes.length)} of ${postcodes.length}…`;
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await fetchBatch(chunk);
        break;
      } catch (e) {
        statusEl.textContent = `Rate limited / error, retrying… (${attempt + 1})`;
        await sleep(750 * (attempt + 1));
      }
    }
    if (!result) throw new Error('Failed to fetch after retries');
    for (const item of result) {
      const res = item.result;
      const row = { postcode: (res?.postcode || item.query || '').toUpperCase() };
      for (const f of FIELDS) {
        let v = res ? (res[f] ?? '') : '';
        if (v == null) v = '';
        row[f] = v;
      }
      rows.push(row);
    }
    await sleep(80);
  }
  statusEl.textContent = `Done. ${rows.length} rows.`;
  return rows;
}

function toCSV(rows, header) {
  const esc = (s) => {
    if (s == null) return '';
    const str = String(s);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(header.map(h => esc(r[h])).join(','));
  }
  return lines.join('\n');
}

function renderTable(rows, header) {
  if (!rows.length) {
    resultsEl.style.display = 'none';
    return;
  }
  resultsEl.style.display = 'block';
  tableEl.innerHTML = '';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  header.forEach(h => {
    const th = document.createElement('th'); th.textContent = h; trh.appendChild(th);
  });
  thead.appendChild(trh);
  tableEl.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.slice(0, 500).forEach(r => {
    const tr = document.createElement('tr');
    header.forEach(h => {
      const td = document.createElement('td'); td.textContent = r[h] ?? ''; tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tableEl.appendChild(tbody);
}

function download(name, url) {
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); }, 0);
}

runBtn.addEventListener('click', async () => {
  const pcs = parsePostcodes(input.value);
  console.log('Parsed postcodes:', pcs);

  if (!pcs.length) {
    statusEl.textContent = 'Please paste at least one postcode.';
    return;
  }

  const header = ['postcode', ...FIELDS];
  runBtn.disabled = true;
  downloadBtn.disabled = true;
  statusEl.textContent = 'Enriching data...';
  resultsEl.style.display = 'none';

  try {
    const rows = await enrich(pcs);
    renderTable(rows, header);
    const csv = toCSV(rows, header);
    const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0,19);
    if (downloadBtn.dataset.url) {
      try { URL.revokeObjectURL(downloadBtn.dataset.url); } catch (_) {}
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    downloadBtn.dataset.url = url;
    downloadBtn.dataset.filename = `postcodes_enriched_${ts}.csv`;
    downloadBtn.disabled = false;
    statusEl.textContent = `Enriched ${rows.length} postcodes`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Error enriching data. Please try again.';
    resultsEl.style.display = 'none';
  } finally {
    runBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  const name = downloadBtn.dataset.filename || 'postcodes_enriched.csv';
  const url = downloadBtn.dataset.url;
  if (!url) return;
  download(name, url);
});

// Initialize the app
