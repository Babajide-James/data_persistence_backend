import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import { v7 as uuidv7 } from "uuid";

// Vercel only allows writing to /tmp; locally use project root
const IS_PRODUCTION =
  !!process.env.VERCEL || process.env.NODE_ENV === "production";
const DB_PATH = IS_PRODUCTION
  ? path.join("/tmp", "profiles.db")
  : path.join(__dirname, "..", "profiles.db");

export interface Profile {
  id: string;
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
  created_at: string;
}

export interface QueryOptions {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: number;
  max_age?: number;
  min_gender_probability?: number;
  min_country_probability?: number;
  sort_by?: "age" | "created_at" | "gender_probability";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface QueryResult {
  data: Profile[];
  total: number;
  page: number;
  limit: number;
}

// sql.js result row helper
function rowToProfile(columns: string[], values: any[]): Profile {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = values[i];
  });
  return obj as unknown as Profile;
}

class SQLiteDatabase {
  private db!: SqlJsDatabase;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    // Provide locateFile so sql.js can find its WASM binary in both
    // local (node_modules) and Vercel serverless environments.
    const SQL = await initSqlJs({
      locateFile: (file: string) => {
        // Try to find the wasm next to the sql.js module
        const wasmPath = require.resolve(`sql.js/dist/${file}`);
        return wasmPath;
      },
    });

    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initSchema();
    this.initialized = true;
  }

  private save(): void {
    const data = this.db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }

  private initSchema(): void {
    this.db.run(`
      DROP INDEX IF EXISTS idx_gender;
      DROP INDEX IF EXISTS idx_age_group;
      DROP INDEX IF EXISTS idx_country_id;
      DROP INDEX IF EXISTS idx_age;
      DROP INDEX IF EXISTS idx_created_at;
      DROP INDEX IF EXISTS idx_gender_prob;
      DROP INDEX IF EXISTS idx_country_prob;
    `);

    const columnsResult = this.db.exec(`PRAGMA table_info(profiles)`);
    if (columnsResult.length > 0) {
      const existingColumns = new Set(
        columnsResult[0].values.map((row) => String(row[1])),
      );
      const expectedColumns = new Set([
        "id",
        "name",
        "gender",
        "gender_probability",
        "age",
        "age_group",
        "country_id",
        "country_name",
        "country_probability",
        "created_at",
      ]);

      const schemaMatches =
        existingColumns.size === expectedColumns.size &&
        [...expectedColumns].every((column) => existingColumns.has(column));

      if (!schemaMatches) {
        this.db.run(`DROP TABLE IF EXISTS profiles`);
      }
    }

    this.db.run(`
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
  }

  private count(): number {
    const result = this.db.exec("SELECT COUNT(*) as cnt FROM profiles");
    if (!result.length || !result[0].values.length) return 0;
    return result[0].values[0][0] as number;
  }

  seedFromFile(seedPath: string): void {
    // Skip seeding if the DB already has data (avoid re-seeding on warm instances)
    if (this.count() > 0) {
      console.log(`DB already has ${this.count()} profiles, skipping seed.`);
      return;
    }

    if (!fs.existsSync(seedPath)) {
      console.warn(`Seed file not found at ${seedPath}, skipping seed.`);
      return;
    }

    console.log("Seeding database from file…");
    const raw = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
    const profiles: Omit<Profile, "id" | "created_at">[] = Array.isArray(raw)
      ? raw
      : raw.profiles;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO profiles
        (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const baseTime = new Date("2025-01-01T00:00:00.000Z").getTime();
    const range = new Date("2026-04-01T00:00:00.000Z").getTime() - baseTime;

    this.db.run("BEGIN TRANSACTION");
    for (let i = 0; i < profiles.length; i++) {
      const row = profiles[i];
      const ts = new Date(
        baseTime + Math.floor((i / profiles.length) * range),
      ).toISOString();
      stmt.run([
        uuidv7(),
        row.name.toLowerCase(),
        row.gender,
        row.gender_probability,
        row.age,
        row.age_group,
        row.country_id,
        row.country_name,
        row.country_probability,
        ts,
      ]);
    }
    this.db.run("COMMIT");
    stmt.free();

    // Persist to /tmp (writable on Vercel) or local path so data survives warm restarts
    this.save();
    console.log(`Seeded ${this.count()} profiles.`);
  }

  findById(id: string): Profile | undefined {
    const result = this.db.exec("SELECT * FROM profiles WHERE id = ?", [id]);
    if (!result.length || !result[0].values.length) return undefined;
    return rowToProfile(result[0].columns, result[0].values[0]);
  }

  findByName(name: string): Profile | undefined {
    const result = this.db.exec("SELECT * FROM profiles WHERE name = ?", [
      name.toLowerCase(),
    ]);
    if (!result.length || !result[0].values.length) return undefined;
    return rowToProfile(result[0].columns, result[0].values[0]);
  }

  insert(record: Profile): void {
    this.db.run(
      `
      INSERT OR IGNORE INTO profiles
        (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        record.id,
        record.name,
        record.gender,
        record.gender_probability,
        record.age,
        record.age_group,
        record.country_id,
        record.country_name,
        record.country_probability,
        record.created_at,
      ],
    );
    this.save();
  }

  deleteById(id: string): boolean {
    this.db.run("DELETE FROM profiles WHERE id = ?", [id]);
    const changes = this.db.getRowsModified();
    if (changes > 0) {
      this.save();
      return true;
    }
    return false;
  }

  query(opts: QueryOptions): QueryResult {
    const {
      gender,
      age_group,
      country_id,
      min_age,
      max_age,
      min_gender_probability,
      min_country_probability,
      sort_by = "created_at",
      order = "asc",
      page = 1,
      limit = 10,
    } = opts;

    const VALID_SORT = new Set(["age", "created_at", "gender_probability"]);
    const sortCol = VALID_SORT.has(sort_by) ? sort_by : "created_at";
    const sortDir = order === "desc" ? "DESC" : "ASC";

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (gender) {
      conditions.push("gender = ?");
      params.push(gender.toLowerCase());
    }
    if (age_group) {
      conditions.push("age_group = ?");
      params.push(age_group.toLowerCase());
    }
    if (country_id) {
      conditions.push("country_id = ?");
      params.push(country_id.toUpperCase());
    }
    if (min_age !== undefined) {
      conditions.push("age >= ?");
      params.push(min_age);
    }
    if (max_age !== undefined) {
      conditions.push("age <= ?");
      params.push(max_age);
    }
    if (min_gender_probability !== undefined) {
      conditions.push("gender_probability >= ?");
      params.push(min_gender_probability);
    }
    if (min_country_probability !== undefined) {
      conditions.push("country_probability >= ?");
      params.push(min_country_probability);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;

    // Count
    const countResult = this.db.exec(
      `SELECT COUNT(*) as cnt FROM profiles ${where}`,
      params,
    );
    const total = countResult.length
      ? (countResult[0].values[0][0] as number)
      : 0;

    // Data
    const dataResult = this.db.exec(
      `SELECT * FROM profiles ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, safeLimit, offset],
    );

    const data: Profile[] = dataResult.length
      ? dataResult[0].values.map((row) =>
          rowToProfile(dataResult[0].columns, row),
        )
      : [];

    return { data, total, page: safePage, limit: safeLimit };
  }
}

let dbInstance: SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = new SQLiteDatabase();
    await dbInstance.init();
  }
  return dbInstance;
}
