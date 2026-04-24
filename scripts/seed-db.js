/**
 * Run this script once locally to pre-generate profiles.db:
 *   node scripts/seed-db.js
 *
 * The resulting profiles.db is committed to the repo and bundled
 * with the Vercel function via vercel.json "includeFiles".
 * This means Vercel cold starts load the DB file directly (~1-2s)
 * instead of seeding 10,000+ records from JSON (~5+ minutes → timeout).
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v7: uuidv7 } = require('uuid');

const DB_PATH   = path.join(__dirname, '..', 'profiles.db');
const SEED_FILE = path.join(__dirname, '..', 'seed_profiles.json');

function getAgeGroup(age) {
  if (age <= 12) return 'child';
  if (age <= 19) return 'teenager';
  if (age <= 59) return 'adult';
  return 'senior';
}

async function main() {
  console.log('Initialising sql.js WASM...');
  const SQL = await initSqlJs({
    locateFile: file => require.resolve(`sql.js/dist/${file}`),
  });

  const db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id                  TEXT PRIMARY KEY,
      name                TEXT NOT NULL UNIQUE,
      gender              TEXT NOT NULL,
      gender_probability  REAL NOT NULL,
      age                 INTEGER NOT NULL,
      age_group           TEXT NOT NULL,
      country_id          TEXT NOT NULL,
      country_name        TEXT NOT NULL,
      country_probability REAL NOT NULL,
      created_at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gender       ON profiles(gender);
    CREATE INDEX IF NOT EXISTS idx_age_group    ON profiles(age_group);
    CREATE INDEX IF NOT EXISTS idx_country_id   ON profiles(country_id);
    CREATE INDEX IF NOT EXISTS idx_age          ON profiles(age);
    CREATE INDEX IF NOT EXISTS idx_created_at   ON profiles(created_at);
    CREATE INDEX IF NOT EXISTS idx_gender_prob  ON profiles(gender_probability);
    CREATE INDEX IF NOT EXISTS idx_country_prob ON profiles(country_probability);
  `);

  console.log('Reading seed file...');
  const raw      = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
  const profiles = Array.isArray(raw) ? raw : raw.profiles;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO profiles
      (id, name, gender, gender_probability, age, age_group,
       country_id, country_name, country_probability, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const baseTime = new Date('2025-01-01T00:00:00.000Z').getTime();
  const range    = new Date('2026-04-01T00:00:00.000Z').getTime() - baseTime;

  console.log(`Inserting ${profiles.length} profiles...`);
  db.run('BEGIN TRANSACTION');
  for (let i = 0; i < profiles.length; i++) {
    const row = profiles[i];
    const age_group = row.age_group || getAgeGroup(row.age);
    const ts = new Date(baseTime + Math.floor((i / profiles.length) * range)).toISOString();
    stmt.run([
      uuidv7(),
      row.name.toLowerCase(),
      row.gender,
      row.gender_probability,
      row.age,
      age_group,
      row.country_id,
      row.country_name,
      row.country_probability,
      ts,
    ]);
  }
  db.run('COMMIT');
  stmt.free();

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  const count = profiles.length;
  const size  = (fs.statSync(DB_PATH).size / 1024).toFixed(1);
  console.log(`✅  profiles.db generated: ${count} profiles, ${size} KB`);
  console.log(`    Path: ${DB_PATH}`);
}

main().catch(err => {
  console.error('❌ seed-db failed:', err);
  process.exit(1);
});
