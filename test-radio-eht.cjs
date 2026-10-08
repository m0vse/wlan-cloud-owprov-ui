const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const directory = 'src/pages/ConfigurationPage/ConfigurationCard/ConfigurationSectionsCard/RadiosSection/';
function load(name) {
  const filename = path.resolve(directory, name);
  const loaded = new Module(filename, module);
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, filename);
  return loaded.exports;
}
const { RADIO_CHANNEL_MODES, radioChannelWidths } = load('radioChannelOptions.ts');
assert.deepEqual(RADIO_CHANNEL_MODES.map((option) => option.value), ['HT', 'VHT', 'HE', 'EHT']);
for (const band of ['2G', '5G', '5G-lower', '5G-upper', '6G', undefined]) {
  for (const mode of ['HT', 'VHT', 'HE', 'EHT', undefined]) {
    assert.deepEqual(radioChannelWidths(band, mode).map((option) => option.value),
      band === '6G' && mode === 'EHT' ? [20, 40, 80, 160, 320] : [20, 40, 80, 160]);
  }
}
const schema = load('radiosConstants.ts').SINGLE_RADIO_SCHEMA((key) => key, true);
assert.equal(schema.cast({})['channel-mode'], 'HT');
for (const band of ['2G', '5G', '6G']) {
  const input = { band, 'channel-mode': 'EHT', 'channel-width': band === '6G' ? 320 : 40 };
  const saved = JSON.parse(JSON.stringify(schema.validateSync(input)));
  for (const [key, value] of Object.entries(input)) assert.equal(saved[key], value);
}
const editor = fs.readFileSync(directory + 'SingleRadio.tsx', 'utf8');
assert.match(editor, /options=\{RADIO_CHANNEL_MODES\}/);
assert.match(editor, /options=\{radioChannelWidths\(value\?\.band, value\?\.\['channel-mode'\]\)\}/);
assert.match(fs.readFileSync('src/components/Modals/Resources/Sections/SingleRadio/index.tsx', 'utf8'), /<SingleRadio/);
console.log('PASS: shared EHT selector, 320 MHz only for 6G EHT, existing defaults unchanged, schema round-trip');
