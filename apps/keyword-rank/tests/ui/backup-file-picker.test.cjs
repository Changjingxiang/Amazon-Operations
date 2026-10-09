const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const bridgeSource = fs.readFileSync(path.resolve(__dirname, '../../../../web/browser-bridge/browser-bridge.js'), 'utf8');
const pickerStart = bridgeSource.indexOf('  function chooseFiles(');
const pickerEnd = bridgeSource.indexOf('  async function sourceReport(', pickerStart);
const pickerSource = bridgeSource.slice(pickerStart, pickerEnd);

function pickerFixture({ clickError } = {}) {
  const window = new EventTarget();
  const inputs = [];
  const timers = [];
  const document = {
    body: { appendChild(input) { inputs.push(input); input.connected = true; } },
    createElement() {
      const input = new EventTarget();
      Object.assign(input, {
        files: [], style: {}, connected: false,
        click() { if (clickError) throw clickError; },
        remove() { input.connected = false; },
      });
      return input;
    },
  };
  const chooseFiles = vm.runInNewContext(`(${pickerSource})`, {
    document, window, setTimeout: (callback) => timers.push(callback),
  });
  return { chooseFiles, window, inputs, flushTimers() { while (timers.length) timers.shift()(); } };
}

test('focus returning before delayed file selection must not cancel the picker', async () => {
  const fixture = pickerFixture();
  const pending = fixture.chooseFiles('.json,application/json', false);
  const input = fixture.inputs[0];
  let settled = false;
  pending.then(() => { settled = true; });

  for (let focus = 0; focus < 3; focus += 1) {
    fixture.window.dispatchEvent(new Event('focus'));
    fixture.flushTimers();
    await Promise.resolve();
    assert.equal(settled, false, 'focus alone cannot tell whether a file was selected');
    assert.equal(input.connected, true, 'the input must survive until change or cancel');
  }

  const selected = { name: 'old-backup.json', size: 43353739 };
  input.files = [selected];
  input.dispatchEvent(new Event('change'));
  assert.deepEqual(Array.from(await pending), [selected]);
  assert.equal(input.connected, false);
});

test('native cancel finishes cleanly and a later selection still works', async () => {
  const fixture = pickerFixture();
  const pending = fixture.chooseFiles('.json', false);
  let result;
  pending.then((files) => { result = files; });
  fixture.inputs[0].dispatchEvent(new Event('cancel'));
  await Promise.resolve();
  assert.ok(Array.isArray(result), 'cancel must settle the selection promise');
  assert.equal(result.length, 0);
  assert.equal(fixture.inputs[0].connected, false);

  const retry = fixture.chooseFiles('.json', false);
  const selected = { name: 'retry.json' };
  fixture.inputs[1].files = [selected];
  fixture.inputs[1].dispatchEvent(new Event('change'));
  assert.deepEqual(Array.from(await retry), [selected]);
});

test('shared report picker preserves multiple files and ignores later events', async () => {
  const fixture = pickerFixture();
  const pending = fixture.chooseFiles('.xlsx,.xls', true);
  const input = fixture.inputs[0];
  const files = [{ name: 'first.xlsx' }, { name: 'second.xlsx' }];
  assert.equal(input.accept, '.xlsx,.xls');
  assert.equal(input.multiple, true);
  input.files = files;
  input.dispatchEvent(new Event('change'));
  input.dispatchEvent(new Event('cancel'));
  fixture.window.dispatchEvent(new Event('focus'));
  fixture.flushTimers();
  assert.deepEqual(Array.from(await pending), files);
  assert.equal(input.connected, false);
});

test('a file chooser opening error rejects and removes the temporary input', async () => {
  const error = new Error('picker blocked');
  const fixture = pickerFixture({ clickError: error });
  await assert.rejects(fixture.chooseFiles('.json', false), (actual) => actual === error);
  assert.equal(fixture.inputs[0].connected, false);
});
