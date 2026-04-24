import { QueryOptions } from '../database';

// Country name → ISO 2-letter code map (comprehensive)
const COUNTRY_MAP: Record<string, string> = {
  // Africa
  nigeria: 'NG',
  kenya: 'KE',
  ghana: 'GH',
  ethiopia: 'ET',
  tanzania: 'TZ',
  'south africa': 'ZA',
  uganda: 'UG',
  cameroon: 'CM',
  'ivory coast': 'CI',
  "cote d'ivoire": 'CI',
  "côte d'ivoire": 'CI',
  senegal: 'SN',
  mali: 'ML',
  angola: 'AO',
  zambia: 'ZM',
  zimbabwe: 'ZW',
  mozambique: 'MZ',
  rwanda: 'RW',
  malawi: 'MW',
  namibia: 'NA',
  botswana: 'BW',
  sudan: 'SD',
  egypt: 'EG',
  morocco: 'MA',
  tunisia: 'TN',
  algeria: 'DZ',
  libya: 'LY',
  somalia: 'SO',
  'dr congo': 'CD',
  congo: 'CG',
  gabon: 'GA',
  benin: 'BJ',
  togo: 'TG',
  niger: 'NE',
  'burkina faso': 'BF',
  'sierra leone': 'SL',
  guinea: 'GN',
  'guinea-bissau': 'GW',
  gambia: 'GM',
  'cape verde': 'CV',
  mauritius: 'MU',
  madagascar: 'MG',
  eritrea: 'ER',
  djibouti: 'DJ',
  comoros: 'KM',
  liberia: 'LR',
  'sao tome': 'ST',
  lesotho: 'LS',
  swaziland: 'SZ',
  eswatini: 'SZ',
  'central african republic': 'CF',
  chad: 'TD',
  mauritania: 'MR',
  'equatorial guinea': 'GQ',
  burundi: 'BI',
  'western sahara': 'EH',
  // Rest of world
  'united states': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  england: 'GB',
  france: 'FR',
  germany: 'DE',
  brazil: 'BR',
  india: 'IN',
  china: 'CN',
  japan: 'JP',
  australia: 'AU',
  canada: 'CA',
  russia: 'RU',
  spain: 'ES',
  italy: 'IT',
  portugal: 'PT',
  netherlands: 'NL',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  finland: 'FI',
  poland: 'PL',
  ukraine: 'UA',
  turkey: 'TR',
  'saudi arabia': 'SA',
  'south korea': 'KR',
  argentina: 'AR',
  mexico: 'MX',
  indonesia: 'ID',
  pakistan: 'PK',
  bangladesh: 'BD',
  vietnam: 'VN',
  thailand: 'TH',
  iran: 'IR',
  iraq: 'IQ',
  'new zealand': 'NZ',
};

export interface ParsedFilters extends Partial<QueryOptions> {}

/**
 * Parses a plain-English query string into structured filter parameters.
 * Returns null if the query cannot be meaningfully interpreted.
 */
export function parseNLQuery(query: string): ParsedFilters | null {
  if (!query || query.trim() === '') return null;

  const q = query.toLowerCase().trim();
  const filters: ParsedFilters = {};
  let matched = false;

  // ── Gender ──────────────────────────────────────────────────────────────
  const hasMale = /\b(male(s)?|man|men|boy(s)?)\b/.test(q);
  const hasFemale = /\b(female(s)?|woman|women|girl(s)?)\b/.test(q);
  const hasMaleAndFemale = /\b((male(s)?|man|men|boy(s)?)\s+and\s+(female(s)?|woman|women|girl(s)?)|(female(s)?|woman|women|girl(s)?)\s+and\s+(male(s)?|man|men|boy(s)?)|both genders?)\b/.test(q);

  if (hasMaleAndFemale) {
    // No gender filter — both
    matched = true;
  } else if (hasMale && !hasFemale) {
    filters.gender = 'male';
    matched = true;
  } else if (hasFemale && !hasMale) {
    filters.gender = 'female';
    matched = true;
  } else if (hasMale && hasFemale) {
    // "male and female" pattern without explicit "and" still means both
    matched = true;
  }

  // ── Age group keywords ───────────────────────────────────────────────────
  if (/\bchildren?\b|\bkids?\b/.test(q)) {
    filters.age_group = 'child';
    matched = true;
  } else if (/\bteenager(s)?\b|\bteen(s)?\b/.test(q)) {
    filters.age_group = 'teenager';
    matched = true;
  } else if (/\badult(s)?\b/.test(q)) {
    filters.age_group = 'adult';
    matched = true;
  } else if (/\bsenior(s)?\b|\belderly\b|\bold people\b/.test(q)) {
    filters.age_group = 'senior';
    matched = true;
  }

  // ── "young" → 16–24 (parsing only, not a stored age_group) ──────────────
  if (/\byoung\b/.test(q) && !filters.age_group) {
    filters.min_age = 16;
    filters.max_age = 24;
    matched = true;
  }

  // ── Explicit age bounds ──────────────────────────────────────────────────
  // "above N" / "over N" / "older than N"
  const aboveMatch = q.match(/\b(?:above|over|older than)\s+(\d+)\b/);
  if (aboveMatch) {
    filters.min_age = parseInt(aboveMatch[1], 10);
    matched = true;
  }

  // "below N" / "under N" / "younger than N"
  const belowMatch = q.match(/\b(?:below|under|younger than)\s+(\d+)\b/);
  if (belowMatch) {
    filters.max_age = parseInt(belowMatch[1], 10);
    matched = true;
  }

  // "between N and M"
  const betweenMatch = q.match(/\bbetween\s+(\d+)\s+and\s+(\d+)\b/);
  if (betweenMatch) {
    filters.min_age = parseInt(betweenMatch[1], 10);
    filters.max_age = parseInt(betweenMatch[2], 10);
    matched = true;
  }

  // "N+" e.g. "25+"
  const plusMatch = q.match(/\b(\d+)\+/);
  if (plusMatch && !aboveMatch) {
    filters.min_age = parseInt(plusMatch[1], 10);
    matched = true;
  }

  // ── Country ──────────────────────────────────────────────────────────────
  // Try multi-word country names first (longest match wins)
  const fromPattern = /\bfrom\s+(.+?)(?:\s*$|\s+(?:who|with|and|that|where|aged|above|below|over|under)\b)/;
  const inPattern   = /\bin\s+(.+?)(?:\s*$|\s+(?:who|with|and|that|where|aged|above|below|over|under)\b)/;

  const countryPhraseMatch = q.match(fromPattern) || q.match(inPattern);
  if (countryPhraseMatch) {
    const phrase = countryPhraseMatch[1].trim().replace(/[.,!?]+$/, '');
    const countryCode = resolveCountry(phrase);
    if (countryCode) {
      filters.country_id = countryCode;
      matched = true;
    } else {
      // Unrecognised country name — signal failure
      return null;
    }
  } else {
    // Try to detect bare country names anywhere in the query
    const code = extractCountryFromQuery(q);
    if (code) {
      filters.country_id = code;
      matched = true;
    }
  }

  // If nothing meaningful was extracted, fail
  if (!matched) return null;

  return filters;
}

/** Try to match the phrase (or sub-phrases) to a country code */
function resolveCountry(phrase: string): string | undefined {
  // Exact match first
  if (COUNTRY_MAP[phrase]) return COUNTRY_MAP[phrase];

  // Partial match — longest key that phrase contains
  let best: string | undefined;
  let bestLen = 0;
  for (const [name, code] of Object.entries(COUNTRY_MAP)) {
    if (phrase.includes(name) && name.length > bestLen) {
      best = code;
      bestLen = name.length;
    }
  }
  return best;
}

/** Scan the entire query for any country name (no "from" keyword required) */
function extractCountryFromQuery(q: string): string | undefined {
  let best: string | undefined;
  let bestLen = 0;
  for (const [name, code] of Object.entries(COUNTRY_MAP)) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(q) && name.length > bestLen) {
      best = code;
      bestLen = name.length;
    }
  }
  return best;
}
