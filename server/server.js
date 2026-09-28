'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = process.env.PORT || 8080;
const APP_USER = process.env.APP_USERNAME || '';
const APP_PASS = process.env.APP_PASSWORD || '';
const AUTH_ENABLED = !!(APP_USER && APP_PASS);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[fatal] DATABASE_URL is not set. Add a Postgres service and connect it to this service in Railway.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('railway.internal') ? false : { rejectUnauthorized: false },
});

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS brake_fluid_services (
  id           TEXT PRIMARY KEY,
  customer     TEXT NOT NULL DEFAULT '',
  plate        TEXT NOT NULL DEFAULT '',
  model        TEXT NOT NULL DEFAULT '',
  mileage      INTEGER NOT NULL DEFAULT 0,
  service_date DATE,
  months       INTEGER NOT NULL DEFAULT 24,
  interval_km  INTEGER NOT NULL DEFAULT 40000,
  fluid        TEXT NOT NULL DEFAULT 'DOT 4',
  wa           TEXT NOT NULL DEFAULT '',
  invoice     TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE brake_fluid_services ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'zh';
CREATE INDEX IF NOT EXISTS brake_fluid_services_plate_idx ON brake_fluid_services (lower(plate));
CREATE INDEX IF NOT EXISTS brake_fluid_services_customer_idx ON brake_fluid_services (lower(customer));
`;

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_SQL);
    console.log('[db] schema ready');
  } finally {
    client.release();
  }
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function basicAuth(req, res, next) {
  if (!AUTH_ENABLED) return next();
  const hdr = req.headers.authorization || '';
  const [scheme, encoded] = hdr.split(' ');
  if (scheme === 'Basic' && encoded) {
    let decoded = '';
    try { decoded = Buffer.from(encoded, 'base64').toString('utf8'); } catch (e) { decoded = ''; }
    const idx = decoded.indexOf(':');
    const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
    const pass = idx >= 0 ? decoded.slice(idx + 1) : '';
    if (timingSafeEqual(user, APP_USER) && timingSafeEqual(pass, APP_PASS)) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="WEIDE Brake Fluid", charset="UTF-8"');
  res.status(401).send('Authentication required.');
}

function rowToRecord(r) {
  return {
    id: r.id,
    customer: r.customer,
    plate: r.plate,
    model: r.model,
    mileage: r.mileage,
    serviceDate: r.service_date instanceof Date
      ? r.service_date.toISOString().slice(0, 10)
      : (r.service_date || ''),
    months: r.months,
    intervalKm: r.interval_km,
    fluid: r.fluid,
    lang: r.lang,
    wa: r.wa,
    invoice: r.invoice,
    note: r.note,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

function genId() {
  return 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function cleanStr(v, max) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  return max ? s.slice(0, max) : s;
}
function cleanInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'db_unreachable' });
  }
});

app.use(basicAuth); // protects everything below: static site + /api (health check above stays open)

app.get('/api/records', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM brake_fluid_services ORDER BY created_at DESC'
    );
    res.json({ records: rows.map(rowToRecord) });
  } catch (e) {
    console.error('[GET /api/records]', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/records', async (req, res) => {
  const b = req.body || {};
  const id = genId();
  const rec = {
    id,
    customer: cleanStr(b.customer, 120),
    plate: cleanStr(b.plate, 40),
    model: cleanStr(b.model, 120),
    mileage: cleanInt(b.mileage, 0),
    serviceDate: cleanStr(b.serviceDate, 10) || null,
    months: cleanInt(b.months, 24),
    intervalKm: cleanInt(b.intervalKm, 40000),
    fluid: cleanStr(b.fluid, 40),
    lang: b.lang === 'en' ? 'en' : 'zh',
    wa: cleanStr(b.wa, 40),
    invoice: cleanStr(b.invoice, 60),
    note: cleanStr(b.note, 2000),
  };
  try {
    const { rows } = await pool.query(
      `INSERT INTO brake_fluid_services
        (id, customer, plate, model, mileage, service_date, months, interval_km, fluid, wa, invoice, note, lang)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [rec.id, rec.customer, rec.plate, rec.model, rec.mileage, rec.serviceDate,
       rec.months, rec.intervalKm, rec.fluid, rec.wa, rec.invoice, rec.note, rec.lang]
    );
    res.status(201).json({ record: rowToRecord(rows[0]) });
  } catch (e) {
    console.error('[POST /api/records]', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.put('/api/records/:id', async (req, res) => {
  const b = req.body || {};
  const id = cleanStr(req.params.id, 64);
  const rec = {
    customer: cleanStr(b.customer, 120),
    plate: cleanStr(b.plate, 40),
    model: cleanStr(b.model, 120),
    mileage: cleanInt(b.mileage, 0),
    serviceDate: cleanStr(b.serviceDate, 10) || null,
    months: cleanInt(b.months, 24),
    intervalKm: cleanInt(b.intervalKm, 40000),
    fluid: cleanStr(b.fluid, 40),
    lang: b.lang === 'en' ? 'en' : 'zh',
    wa: cleanStr(b.wa, 40),
    invoice: cleanStr(b.invoice, 60),
    note: cleanStr(b.note, 2000),
  };
  try {
    const { rows } = await pool.query(
      `UPDATE brake_fluid_services SET
         customer=$1, plate=$2, model=$3, mileage=$4, service_date=$5,
         months=$6, interval_km=$7, fluid=$8, wa=$9, invoice=$10, note=$11, lang=$12, updated_at=now()
       WHERE id=$13
       RETURNING *`,
      [rec.customer, rec.plate, rec.model, rec.mileage, rec.serviceDate,
       rec.months, rec.intervalKm, rec.fluid, rec.wa, rec.invoice, rec.note, rec.lang, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ record: rowToRecord(rows[0]) });
  } catch (e) {
    console.error('[PUT /api/records/:id]', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.delete('/api/records/:id', async (req, res) => {
  const id = cleanStr(req.params.id, 64);
  try {
    const { rowCount } = await pool.query('DELETE FROM brake_fluid_services WHERE id=$1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/records/:id]', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] listening on :${PORT}`);
      console.log(`[server] auth ${AUTH_ENABLED ? 'ENABLED' : 'DISABLED (set APP_USERNAME + APP_PASSWORD to enable)'}`);
    });
  })
  .catch((e) => {
    console.error('[fatal] failed to init db', e);
    process.exit(1);
  });
