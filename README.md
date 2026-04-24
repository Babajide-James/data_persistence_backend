# Insighta Labs — Profile Intelligence API

A **Queryable Intelligence Engine** built for Insighta Labs. The API collects demographic profile data (gender, age, nationality) from external inference APIs, stores it in a persistent SQLite database, and exposes a rich query interface that supports advanced filtering, sorting, pagination, and natural-language search.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| Database | SQLite (`sql.js` with persisted `.db` file) |
| Deployment | Vercel (Serverless, `/tmp` DB path) |
| IDs | UUID v7 |

---

## Local Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd data_persistence_backend
npm install

# 2. Ensure the seed file is at the project root
#    seed_profiles.json should already be there

# 3. Start dev server (seeds DB automatically on first run)
npm run dev
```

The server starts on **http://localhost:3000**. The SQLite database is created at `profiles.db` in the project root.

---

## API Reference

### Base URL
- **Local:** `http://localhost:3000`
- **Production:** `https://<your-vercel-domain>`

---

### `POST /api/profiles`
Create a new profile by name. Fetches gender, age, and nationality from external APIs.

**Request Body:**
```json
{ "name": "Amara Diallo" }
```

**Response `201`:**
```json
{
  "status": "success",
  "data": {
    "id": "019526ab-...",
    "name": "amara diallo",
    "gender": "female",
    "gender_probability": 0.87,
    "age": 32,
    "age_group": "adult",
    "country_id": "SN",
    "country_name": "Senegal",
    "country_probability": 0.71,
    "created_at": "2026-04-22T21:00:00.000Z"
  }
}
```

---

### `GET /api/profiles`
List profiles with optional filtering, sorting, and pagination.

#### Filter Parameters

| Parameter | Type | Description |
|---|---|---|
| `gender` | string | `male` or `female` |
| `age_group` | string | `child`, `teenager`, `adult`, `senior` |
| `country_id` | string | ISO 2-letter code (e.g. `NG`, `KE`) |
| `min_age` | integer | Minimum age (inclusive) |
| `max_age` | integer | Maximum age (inclusive) |
| `min_gender_probability` | float | e.g. `0.8` |
| `min_country_probability` | float | e.g. `0.5` |

#### Sort Parameters

| Parameter | Values | Default |
|---|---|---|
| `sort_by` | `age` \| `created_at` \| `gender_probability` | `created_at` |
| `order` | `asc` \| `desc` | `asc` |

#### Pagination Parameters

| Parameter | Default | Max |
|---|---|---|
| `page` | `1` | — |
| `limit` | `10` | `50` |

#### Response Format
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": [ ... ]
}
```

#### Examples

```bash
# All Nigerian males over 25, sorted by age descending
GET /api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc

# Adult females with high gender probability, page 2
GET /api/profiles?gender=female&age_group=adult&min_gender_probability=0.9&page=2&limit=20

# Seniors from Kenya
GET /api/profiles?age_group=senior&country_id=KE
```

---

### `GET /api/profiles/search`
Natural-language query interface. Converts plain English into filter conditions.

#### Parameters

| Parameter | Required | Description |
|---|---|---|
| `q` | ✅ | Natural language query string |
| `page` | No | Page number (default: 1) |
| `limit` | No | Results per page (default: 10, max: 50) |

#### Response Format
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": [ ... ]
}
```

#### Example Queries

| Query | Interpreted As |
|---|---|
| `young males from nigeria` | gender=male, min_age=16, max_age=24, country_id=NG |
| `females above 30` | gender=female, min_age=30 |
| `people from angola` | country_id=AO |
| `adult males from kenya` | gender=male, age_group=adult, country_id=KE |
| `male and female teenagers above 17` | age_group=teenager, min_age=17 |
| `seniors in ethiopia` | age_group=senior, country_id=ET |
| `young women` | gender=female, min_age=16, max_age=24 |
| `children from ghana` | age_group=child, country_id=GH |
| `males between 25 and 40` | gender=male, min_age=25, max_age=40 |

#### Error Responses

```bash
# Uninterpretable query
GET /api/profiles/search?q=xyzfoo
→ 422: { "status": "error", "message": "Unable to interpret query" }

# Missing q parameter
GET /api/profiles/search
→ 400: { "status": "error", "message": "Invalid query parameters" }
```

---

### `GET /api/profiles/:id`
Fetch a single profile by UUID.

**Response `200`:**
```json
{ "status": "success", "data": { ... } }
```
**Response `404`:**
```json
{ "status": "error", "message": "Profile not found" }
```

---

### `DELETE /api/profiles/:id`
Delete a profile by UUID. Returns `204 No Content` on success.

---

## Natural Language Parsing Rules

The parser is **entirely rule-based** — no AI or LLMs involved.

| Pattern | Filter Applied |
|---|---|
| `male(s)` | gender = male |
| `female(s)` / `women` | gender = female |
| `male and female` | (no gender filter) |
| `young` | min_age=16, max_age=24 (parsing only) |
| `child(ren)` / `kids` | age_group = child |
| `teenager(s)` / `teen(s)` | age_group = teenager |
| `adult(s)` | age_group = adult |
| `senior(s)` / `elderly` | age_group = senior |
| `above N` / `over N` / `older than N` | min_age = N |
| `below N` / `under N` / `younger than N` | max_age = N |
| `between N and M` | min_age=N, max_age=M |
| `N+` | min_age = N |
| `from <country>` / `in <country>` | country_id = ISO code |

> **Note:** "young" maps to ages 16–24 **for parsing only**. It is not stored as an age group in the database.

---

## Error Response Format

All errors follow this structure:

```json
{ "status": "error", "message": "<description>" }
```

| HTTP Code | Meaning |
|---|---|
| 400 | Missing or empty required parameter |
| 404 | Profile not found |
| 422 | Invalid parameter type or value |
| 500 | Internal server failure |
| 502 | External API (Genderize/Agify/Nationalize) failure |

---

## Database Schema

```sql
CREATE TABLE profiles (
  id                  TEXT PRIMARY KEY,         -- UUID v7
  name                TEXT NOT NULL UNIQUE,     -- Lowercased full name
  gender              TEXT NOT NULL,            -- 'male' or 'female'
  gender_probability  REAL NOT NULL,            -- 0.0 – 1.0
  age                 INTEGER NOT NULL,         -- Exact age
  age_group           TEXT NOT NULL,            -- child|teenager|adult|senior
  country_id          TEXT NOT NULL,            -- ISO 2-letter code
  country_name        TEXT NOT NULL,            -- Full country name
  country_probability REAL NOT NULL,            -- 0.0 – 1.0
  created_at          TEXT NOT NULL             -- UTC ISO 8601 timestamp
);
```

Indexes on: `gender`, `age_group`, `country_id`, `age`, `created_at`, `gender_probability`, `country_probability`.

---

## Seeding

The database is seeded automatically on server startup from `seed_profiles.json` at the project root. Re-running will **not** create duplicates because inserts are idempotent on the unique `name` column, so the database converges to the same 2026 seeded profiles.

To re-seed from scratch: delete `profiles.db` (local) or let Vercel's `/tmp` reset on cold start.

---

## Deployment (Vercel)

The project uses `@vercel/node` to run as a serverless function. SQLite writes to `/tmp/profiles.db` on Vercel (ephemeral per instance, re-seeded on cold start).

```json
// vercel.json
{
  "version": 2,
  "builds": [{ "src": "src/server.ts", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "src/server.ts" }]
}
```
