import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { SIF_COUNTRIES as extensionCountries, normalizeCountryCode as extensionNormalize } from '../../../web/extensions/sif-batch-reverse-downloader/utils.mjs';

const require = createRequire(import.meta.url);
const desktop = require('../electron/countries.cjs');
const frontendSource = fs.readFileSync(new URL('../src/lib/countries.js', import.meta.url), 'utf8');
const frontend = await import(`data:text/javascript;base64,${Buffer.from(frontendSource).toString('base64')}`);
const bridge = fs.readFileSync(new URL('../../../web/browser-bridge/browser-bridge.js', import.meta.url), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const web = vm.runInNewContext(
  between(bridge, '  const SIF_COUNTRIES = [', '  const SIF_ORIGIN =')
  + between(bridge, '  function countryLabel(', '  function emitSifProgress(')
  + '; ({ SIF_COUNTRIES, countryLabel, normalizeCountryCode });',
  { text: value => String(value ?? '').trim() },
);
const settings = fs.readFileSync(new URL('../../../web/web-settings/web-settings-enhancements.js', import.meta.url), 'utf8');
const settingsCountries = vm.runInNewContext(between(settings, '  const ABA_COUNTRIES = [', '  function addStyles(') + '; ABA_COUNTRIES;');

test('frontend, desktop, browser storage, settings and extension expose the same marketplaces', () => {
  for (const actual of [desktop.SIF_COUNTRIES, web.SIF_COUNTRIES, settingsCountries, extensionCountries]) {
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), frontend.SIF_COUNTRIES);
  }
});

for (const [code, label, aliases] of [
  ['MX', '墨西哥站', ['MX', 'mx', '墨西哥', '墨西哥站']],
  ['AU', '澳大利亚站', ['AU', 'au', '澳大利亚', '澳大利亚站', '澳洲', '澳洲站']],
]) {
  test(`${code} survives code and legacy site-name normalization without becoming Canada`, () => {
    for (const alias of aliases) {
      for (const normalize of [desktop.normalizeCountryCode, web.normalizeCountryCode, extensionNormalize]) {
        assert.equal(normalize(alias), code, alias);
      }
      assert.equal(desktop.countryLabel(alias), label);
    }
    assert.equal(frontend.countryLabel(code), label);
    assert.equal(web.countryLabel(code), label);
  });
}
