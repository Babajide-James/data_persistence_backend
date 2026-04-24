import { Request, Response } from "express";
import { v7 as uuidv7 } from "uuid";
import { getDb, QueryOptions, Profile } from "../database";
import { parseNLQuery } from "../utils/nlQueryParser";

// ─── External API response types ─────────────────────────────────────────────

interface GenderizeResponse {
  count: number;
  name: string;
  gender: string | null;
  probability: number;
}

interface AgifyResponse {
  age: number | null;
  count: number;
  name: string;
}

interface NationalizeResponse {
  count: number;
  name: string;
  country: { country_id: string; probability: number }[];
}

// ─── Profile list view type (for GET /api/profiles) ──────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_SORT_COLS = new Set(["age", "created_at", "gender_probability"]);
const VALID_AGE_GROUPS = new Set(["child", "teenager", "adult", "senior"]);
const VALID_GENDERS = new Set(["male", "female"]);
const VALID_ORDERS = new Set(["asc", "desc"]);
const EXTERNAL_API_TIMEOUT_MS = 8000;

// ISO 2-letter → country name for create endpoint
const ISO_COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria",
  KE: "Kenya",
  GH: "Ghana",
  ET: "Ethiopia",
  TZ: "Tanzania",
  ZA: "South Africa",
  UG: "Uganda",
  CM: "Cameroon",
  CI: "Côte d'Ivoire",
  SN: "Senegal",
  ML: "Mali",
  AO: "Angola",
  ZM: "Zambia",
  ZW: "Zimbabwe",
  MZ: "Mozambique",
  RW: "Rwanda",
  MW: "Malawi",
  NA: "Namibia",
  BW: "Botswana",
  SD: "Sudan",
  EG: "Egypt",
  MA: "Morocco",
  TN: "Tunisia",
  DZ: "Algeria",
  LY: "Libya",
  SO: "Somalia",
  CD: "DR Congo",
  CG: "Republic of the Congo",
  GA: "Gabon",
  BJ: "Benin",
  TG: "Togo",
  NE: "Niger",
  BF: "Burkina Faso",
  SL: "Sierra Leone",
  GN: "Guinea",
  GW: "Guinea-Bissau",
  GM: "Gambia",
  CV: "Cape Verde",
  MU: "Mauritius",
  MG: "Madagascar",
  ER: "Eritrea",
  DJ: "Djibouti",
  KM: "Comoros",
  LR: "Liberia",
  ST: "São Tomé and Príncipe",
  LS: "Lesotho",
  SZ: "Eswatini",
  CF: "Central African Republic",
  TD: "Chad",
  MR: "Mauritania",
  GQ: "Equatorial Guinea",
  BI: "Burundi",
  EH: "Western Sahara",
  US: "United States",
  GB: "United Kingdom",
  FR: "France",
  DE: "Germany",
  BR: "Brazil",
  IN: "India",
  CN: "China",
  JP: "Japan",
  AU: "Australia",
  CA: "Canada",
  RU: "Russia",
  ES: "Spain",
  IT: "Italy",
  PT: "Portugal",
  NL: "Netherlands",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  UA: "Ukraine",
  TR: "Turkey",
  SA: "Saudi Arabia",
  KR: "South Korea",
  AR: "Argentina",
  MX: "Mexico",
  ID: "Indonesia",
  PK: "Pakistan",
  BD: "Bangladesh",
  VN: "Vietnam",
  TH: "Thailand",
  IR: "Iran",
  IQ: "Iraq",
  NZ: "New Zealand",
};

function getAgeGroup(age: number): string {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

function parseIntParam(
  val: unknown,
  name: string,
): { value: number } | { error: string } {
  if (val === undefined || val === null) return { value: NaN }; // not provided
  const n = Number(val);
  if (!Number.isInteger(n) || isNaN(n))
    return { error: `'${name}' must be an integer` };
  return { value: n };
}

function parseFloatParam(
  val: unknown,
  name: string,
): { value: number } | { error: string } {
  if (val === undefined || val === null) return { value: NaN };
  const n = Number(val);
  if (isNaN(n)) return { error: `'${name}' must be a number` };
  return { value: n };
}

function hasDuplicateQueryParam(value: unknown): boolean {
  return Array.isArray(value);
}

function isValidProbability(value: number): boolean {
  return value >= 0 && value <= 1;
}

function isValidPage(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function isValidLimit(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 50;
}

function isValidCountryId(value: string): boolean {
  return /^[A-Za-z]{2}$/.test(value);
}

function sendPaginatedResponse(
  res: Response,
  result: { page: number; limit: number; total: number; data: Profile[] },
): void {
  res.status(200).json({
    status: "success",
    page: result.page,
    limit: result.limit,
    total: result.total,
    data: result.data,
  });
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

// ─── POST /api/profiles ───────────────────────────────────────────────────────

export const createProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { name } = req.body;

    if (
      name === undefined ||
      name === null ||
      (typeof name === "string" && name.trim() === "")
    ) {
      res
        .status(400)
        .json({ status: "error", message: "Missing or empty name" });
      return;
    }

    if (typeof name !== "string") {
      res.status(422).json({ status: "error", message: "Invalid type" });
      return;
    }

    const normalizedName = name.trim().toLowerCase();
    const db = await getDb();

    const existing = db.findByName(normalizedName);
    if (existing) {
      res.status(201).json({
        status: "success",
        message: "Profile already exists",
        data: existing,
      });
      return;
    }

    const [genderData, ageData, nationData] = await Promise.all([
      fetchJsonWithTimeout<GenderizeResponse>(
        `https://api.genderize.io?name=${encodeURIComponent(normalizedName)}`,
      ),
      fetchJsonWithTimeout<AgifyResponse>(
        `https://api.agify.io?name=${encodeURIComponent(normalizedName)}`,
      ),
      fetchJsonWithTimeout<NationalizeResponse>(
        `https://api.nationalize.io?name=${encodeURIComponent(normalizedName)}`,
      ),
    ]);

    if (genderData.gender === null || genderData.count === 0) {
      res.status(502).json({
        status: "error",
        message: "Genderize returned an invalid response",
      });
      return;
    }
    if (ageData.age === null) {
      res.status(502).json({
        status: "error",
        message: "Agify returned an invalid response",
      });
      return;
    }
    if (!nationData.country || nationData.country.length === 0) {
      res.status(502).json({
        status: "error",
        message: "Nationalize returned an invalid response",
      });
      return;
    }

    const gender = genderData.gender;
    const gender_probability = genderData.probability;
    const age = ageData.age!;
    const age_group = getAgeGroup(age);

    const sortedCountries = [...nationData.country].sort(
      (a, b) => b.probability - a.probability,
    );
    const topCountry = sortedCountries[0];
    const country_id = topCountry.country_id.toUpperCase();
    const country_probability = topCountry.probability;
    const country_name = ISO_COUNTRY_NAMES[country_id] ?? country_id;

    const record = {
      id: uuidv7(),
      name: normalizedName,
      gender,
      gender_probability,
      age,
      age_group,
      country_id,
      country_name,
      country_probability,
      created_at: new Date().toISOString(),
    };

    db.insert(record);
    res.status(201).json({ status: "success", data: record });
  } catch (error) {
    console.error("Error in createProfile:", error);
    if (error instanceof Error && error.name === "TimeoutError") {
      res
        .status(502)
        .json({ status: "error", message: "External API request timed out" });
      return;
    }
    if (error instanceof Error && error.message.startsWith("Upstream request")) {
      res
        .status(502)
        .json({ status: "error", message: "External API request failed" });
      return;
    }
    res
      .status(500)
      .json({ status: "error", message: "Internal server failure" });
  }
};

// ─── GET /api/profiles/:id ────────────────────────────────────────────────────

export const getProfileById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const profile = db.findById(id);

    if (!profile) {
      res.status(404).json({ status: "error", message: "Profile not found" });
      return;
    }

    res.status(200).json({ status: "success", data: profile });
  } catch (error) {
    console.error("Error in getProfileById:", error);
    res
      .status(500)
      .json({ status: "error", message: "Internal server failure" });
  }
};

// ─── DELETE /api/profiles/:id ─────────────────────────────────────────────────

export const deleteProfileById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const success = db.deleteById(id);

    if (!success) {
      res.status(404).json({ status: "error", message: "Profile not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error in deleteProfileById:", error);
    res
      .status(500)
      .json({ status: "error", message: "Internal server failure" });
  }
};

// ─── GET /api/profiles ────────────────────────────────────────────────────────

export const getProfiles = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const rawValues = [
      req.query.gender,
      req.query.age_group,
      req.query.country_id,
      req.query.min_age,
      req.query.max_age,
      req.query.min_gender_probability,
      req.query.min_country_probability,
      req.query.sort_by,
      req.query.order,
      req.query.page,
      req.query.limit,
    ];

    if (rawValues.some(hasDuplicateQueryParam)) {
      res
        .status(422)
        .json({ status: "error", message: "Invalid query parameters" });
      return;
    }

    const {
      gender,
      age_group,
      country_id,
      min_age,
      max_age,
      min_gender_probability,
      min_country_probability,
      sort_by,
      order,
      page: pageRaw,
      limit: limitRaw,
    } = req.query;

    const errors: string[] = [];

    // Validate gender
    if (
      gender !== undefined &&
      !VALID_GENDERS.has((gender as string).toLowerCase())
    ) {
      errors.push(`'gender' must be 'male' or 'female'`);
    }

    // Validate age_group
    if (
      age_group !== undefined &&
      !VALID_AGE_GROUPS.has((age_group as string).toLowerCase())
    ) {
      errors.push(`'age_group' must be one of: child, teenager, adult, senior`);
    }

    // Validate sort_by
    if (sort_by !== undefined && !VALID_SORT_COLS.has(sort_by as string)) {
      errors.push(
        `'sort_by' must be one of: age, created_at, gender_probability`,
      );
    }

    // Validate order
    if (
      order !== undefined &&
      !VALID_ORDERS.has((order as string).toLowerCase())
    ) {
      errors.push(`'order' must be 'asc' or 'desc'`);
    }

    if (
      country_id !== undefined &&
      !isValidCountryId(country_id as string)
    ) {
      errors.push(`'country_id' must be a 2-letter ISO code`);
    }

    // Validate numeric params
    const minAgeResult =
      min_age !== undefined ? parseIntParam(min_age, "min_age") : null;
    const maxAgeResult =
      max_age !== undefined ? parseIntParam(max_age, "max_age") : null;
    const minGPResult =
      min_gender_probability !== undefined
        ? parseFloatParam(min_gender_probability, "min_gender_probability")
        : null;
    const minCPResult =
      min_country_probability !== undefined
        ? parseFloatParam(min_country_probability, "min_country_probability")
        : null;
    const pageResult =
      pageRaw !== undefined ? parseIntParam(pageRaw, "page") : null;
    const limitResult =
      limitRaw !== undefined ? parseIntParam(limitRaw, "limit") : null;

    if (minAgeResult && "error" in minAgeResult)
      errors.push(minAgeResult.error);
    if (maxAgeResult && "error" in maxAgeResult)
      errors.push(maxAgeResult.error);
    if (minGPResult && "error" in minGPResult) errors.push(minGPResult.error);
    if (minCPResult && "error" in minCPResult) errors.push(minCPResult.error);
    if (pageResult && "error" in pageResult) errors.push(pageResult.error);
    if (limitResult && "error" in limitResult) errors.push(limitResult.error);

    if (
      minAgeResult &&
      !("error" in minAgeResult) &&
      !isNaN(minAgeResult.value) &&
      minAgeResult.value < 0
    ) {
      errors.push(`'min_age' must be greater than or equal to 0`);
    }

    if (
      maxAgeResult &&
      !("error" in maxAgeResult) &&
      !isNaN(maxAgeResult.value) &&
      maxAgeResult.value < 0
    ) {
      errors.push(`'max_age' must be greater than or equal to 0`);
    }

    if (
      minAgeResult &&
      maxAgeResult &&
      !("error" in minAgeResult) &&
      !("error" in maxAgeResult) &&
      !isNaN(minAgeResult.value) &&
      !isNaN(maxAgeResult.value) &&
      minAgeResult.value > maxAgeResult.value
    ) {
      errors.push(`'min_age' cannot be greater than 'max_age'`);
    }

    if (
      minGPResult &&
      !("error" in minGPResult) &&
      !isNaN(minGPResult.value) &&
      !isValidProbability(minGPResult.value)
    ) {
      errors.push(`'min_gender_probability' must be between 0 and 1`);
    }

    if (
      minCPResult &&
      !("error" in minCPResult) &&
      !isNaN(minCPResult.value) &&
      !isValidProbability(minCPResult.value)
    ) {
      errors.push(`'min_country_probability' must be between 0 and 1`);
    }

    if (
      pageResult &&
      !("error" in pageResult) &&
      !isNaN(pageResult.value) &&
      !isValidPage(pageResult.value)
    ) {
      errors.push(`'page' must be greater than or equal to 1`);
    }

    if (
      limitResult &&
      !("error" in limitResult) &&
      !isNaN(limitResult.value) &&
      !isValidLimit(limitResult.value)
    ) {
      errors.push(`'limit' must be between 1 and 50`);
    }

    if (errors.length > 0) {
      res
        .status(422)
        .json({ status: "error", message: "Invalid query parameters" });
      return;
    }

    const opts: QueryOptions = {};

    if (gender) opts.gender = (gender as string).toLowerCase();
    if (age_group) opts.age_group = (age_group as string).toLowerCase();
    if (country_id) opts.country_id = (country_id as string).toUpperCase();
    if (sort_by) opts.sort_by = sort_by as QueryOptions["sort_by"];
    if (order)
      opts.order = (order as string).toLowerCase() as QueryOptions["order"];

    if (
      minAgeResult &&
      !("error" in minAgeResult) &&
      !isNaN(minAgeResult.value)
    )
      opts.min_age = minAgeResult.value;
    if (
      maxAgeResult &&
      !("error" in maxAgeResult) &&
      !isNaN(maxAgeResult.value)
    )
      opts.max_age = maxAgeResult.value;
    if (minGPResult && !("error" in minGPResult) && !isNaN(minGPResult.value))
      opts.min_gender_probability = minGPResult.value;
    if (minCPResult && !("error" in minCPResult) && !isNaN(minCPResult.value))
      opts.min_country_probability = minCPResult.value;
    if (pageResult && !("error" in pageResult) && !isNaN(pageResult.value))
      opts.page = pageResult.value;
    if (limitResult && !("error" in limitResult) && !isNaN(limitResult.value))
      opts.limit = limitResult.value;

    const db = await getDb();
    const result = db.query(opts);

    sendPaginatedResponse(res, result);
  } catch (error) {
    console.error("Error in getProfiles:", error);
    res
      .status(500)
      .json({ status: "error", message: "Internal server failure" });
  }
};

// ─── GET /api/profiles/search ─────────────────────────────────────────────────

export const searchProfiles = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    if (
      hasDuplicateQueryParam(req.query.q) ||
      hasDuplicateQueryParam(req.query.page) ||
      hasDuplicateQueryParam(req.query.limit)
    ) {
      res
        .status(422)
        .json({ status: "error", message: "Invalid query parameters" });
      return;
    }

    const q = req.query.q as string | undefined;

    if (!q || q.trim() === "") {
      res
        .status(400)
        .json({ status: "error", message: "Invalid query parameters" });
      return;
    }

    const parsed = parseNLQuery(q);
    if (parsed === null) {
      res
        .status(422)
        .json({ status: "error", message: "Unable to interpret query" });
      return;
    }

    // Pagination from query string
    const pageResult =
      req.query.page !== undefined
        ? parseIntParam(req.query.page, "page")
        : null;
    const limitResult =
      req.query.limit !== undefined
        ? parseIntParam(req.query.limit, "limit")
        : null;

    if (
      (pageResult && "error" in pageResult) ||
      (limitResult && "error" in limitResult)
    ) {
      res
        .status(422)
        .json({ status: "error", message: "Invalid query parameters" });
      return;
    }

    if (
      (pageResult &&
        !("error" in pageResult) &&
        !isNaN(pageResult.value) &&
        !isValidPage(pageResult.value)) ||
      (limitResult &&
        !("error" in limitResult) &&
        !isNaN(limitResult.value) &&
        !isValidLimit(limitResult.value))
    ) {
      res
        .status(422)
        .json({ status: "error", message: "Invalid query parameters" });
      return;
    }

    const opts: QueryOptions = { ...parsed };
    if (pageResult && !("error" in pageResult) && !isNaN(pageResult.value))
      opts.page = pageResult.value;
    if (limitResult && !("error" in limitResult) && !isNaN(limitResult.value))
      opts.limit = limitResult.value;

    const db = await getDb();
    const result = db.query(opts);

    sendPaginatedResponse(res, result);
  } catch (error) {
    console.error("Error in searchProfiles:", error);
    res
      .status(500)
      .json({ status: "error", message: "Internal server failure" });
  }
};
