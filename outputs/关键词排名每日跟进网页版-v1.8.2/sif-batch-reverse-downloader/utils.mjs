export const MAX_ASINS = 15;
export const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

export const SIF_COUNTRIES = [
  { code: "US", label: "美国站" },
  { code: "DE", label: "德国站" },
  { code: "UK", label: "英国站" },
  { code: "JP", label: "日本站" },
  { code: "CA", label: "加拿大站" },
  { code: "FR", label: "法国站" },
  { code: "ES", label: "西班牙站" },
  { code: "IT", label: "意大利站" }
];
const SIF_COUNTRY_CODES = new Set(SIF_COUNTRIES.map(({ code }) => code));

export function normalizeCountryCode(value) {
  const raw = String(value || "").trim();
  const upper = raw.toUpperCase();
  if (SIF_COUNTRY_CODES.has(upper)) return upper;
  const found = SIF_COUNTRIES.find(({ label }) => raw.includes(label.replace(/站$/u, "")) || raw.includes(label));
  return found?.code || "CA";
}

export function tokenizeAsins(value) {
  return String(value || "")
    .toUpperCase()
    .split(/[\s,，;；]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseAsins(value) {
  const tokens = tokenizeAsins(value);
  const seen = new Set();
  const valid = [];
  const invalid = [];

  for (const token of tokens) {
    if (!ASIN_PATTERN.test(token)) {
      invalid.push(token);
      continue;
    }
    if (!seen.has(token)) {
      seen.add(token);
      valid.push(token);
    }
  }

  return {
    valid,
    invalid,
    overflow: valid.slice(MAX_ASINS),
    accepted: valid.slice(0, MAX_ASINS)
  };
}

export function buildSifReverseUrl(asin, countryCode = "CA") {
  const url = new URL("https://www.sif.com/reverse");
  url.searchParams.set("country", normalizeCountryCode(countryCode));
  url.searchParams.set("asin", asin);
  url.searchParams.set("isListingSearch", "false");
  url.searchParams.set("trafficType", "");
  return url.toString();
}

export function normalizeConcurrency(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(5, parsed));
}

export function extractAsin(...values) {
  for (const value of values) {
    const text = String(value || "").toUpperCase();
    const queryMatch = text.match(/[?&]ASIN=([A-Z0-9]{10})(?:&|$)/i);
    if (queryMatch) return queryMatch[1].toUpperCase();
    const looseMatch = text.match(/\b[A-Z0-9]{10}\b/);
    if (looseMatch) return looseMatch[0].toUpperCase();
  }
  return null;
}

export function downloadExtension(item = {}) {
  const candidates = [item.filename, item.finalUrl, item.url];
  for (const candidate of candidates) {
    const clean = String(candidate || "").split(/[?#]/, 1)[0];
    const match = clean.match(/\.([a-z0-9]{1,8})$/i);
    if (match && ["xlsx", "xls", "csv", "zip"].includes(match[1].toLowerCase())) {
      return match[1].toLowerCase();
    }
  }
  return "xlsx";
}

export function suggestedFilename(asin, item = {}, now = new Date(), countryCode = "CA") {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  return `Sif反查流量词_${normalizeCountryCode(countryCode)}_${asin}_${date}.${downloadExtension(item)}`;
}
