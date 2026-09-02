export const SIF_COUNTRIES = [
  { code: 'US', label: '美国站' },
  { code: 'DE', label: '德国站' },
  { code: 'UK', label: '英国站' },
  { code: 'JP', label: '日本站' },
  { code: 'CA', label: '加拿大站' },
  { code: 'FR', label: '法国站' },
  { code: 'ES', label: '西班牙站' },
  { code: 'IT', label: '意大利站' },
];

export function countryLabel(code) {
  return SIF_COUNTRIES.find((item) => item.code === code)?.label || '加拿大站';
}
