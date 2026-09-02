const SIF_COUNTRIES = Object.freeze([
  { code: 'US', label: '美国站' },
  { code: 'DE', label: '德国站' },
  { code: 'UK', label: '英国站' },
  { code: 'JP', label: '日本站' },
  { code: 'CA', label: '加拿大站' },
  { code: 'FR', label: '法国站' },
  { code: 'ES', label: '西班牙站' },
  { code: 'IT', label: '意大利站' },
]);

const COUNTRY_BY_CODE = new Map(SIF_COUNTRIES.map((item) => [item.code, item]));

function text(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeCountryCode(value, fallback = 'CA') {
  const raw = text(value).toUpperCase();
  if (COUNTRY_BY_CODE.has(raw)) return raw;
  const matched = SIF_COUNTRIES.find((item) => raw === item.label.toUpperCase() || raw.includes(item.label.replace(/站$/, '').toUpperCase()));
  return matched?.code || fallback;
}

function countryLabel(value, fallback = 'CA') {
  return COUNTRY_BY_CODE.get(normalizeCountryCode(value, fallback))?.label || COUNTRY_BY_CODE.get(fallback)?.label || '加拿大站';
}

module.exports = { SIF_COUNTRIES, normalizeCountryCode, countryLabel };
