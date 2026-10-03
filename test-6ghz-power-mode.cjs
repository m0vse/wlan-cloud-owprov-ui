const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const directory = 'src/pages/ConfigurationPage/ConfigurationCard/ConfigurationSectionsCard/RadiosSection/';
const filename = path.resolve(directory, 'radiosConstants.ts');
const loaded = new Module(filename, module);
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, filename);
const schema = loaded.exports.SINGLE_RADIO_SCHEMA((key) => key, true);
assert.equal(schema.cast({ band: '6G' })['he-6ghz-settings'], undefined);
for (const mode of ['indoor-power-indoor', 'standard-power', 'very-low-power']) {
  const radio = schema.validateSync({ band: '6G', 'he-6ghz-settings': {
    'power-type': mode, 'unsolicited-probe-response': true,
  } });
  const saved = JSON.parse(JSON.stringify(radio));
  assert.equal(saved['he-6ghz-settings']['power-type'], mode);
  assert.equal(saved['he-6ghz-settings']['unsolicited-probe-response'], true);
}
assert.throws(() => schema.validateSync({ 'he-6ghz-settings': { 'power-type': 'invalid' } }));
const reset = schema.cast({ 'he-6ghz-settings': { 'power-type': undefined, other: true } });
assert.deepEqual(JSON.parse(JSON.stringify(reset))['he-6ghz-settings'], { other: true });
const editor = fs.readFileSync(directory + 'SingleRadio.tsx', 'utf8');
assert.match(editor, /value\?\.band === '6G' &&/);
const selector = editor.match(/<SelectField\s+name=\{`\$\{namePrefix\}\.he-6ghz-settings\.power-type`\}[\s\S]*?\/>/)[0];
assert.match(selector, /isDisabled=\{isDisabled\}/);
assert.match(selector, /emptyIsUndefined/);
for (const mode of ['indoor-power-indoor', 'standard-power', 'very-low-power']) {
  assert.ok(selector.includes(mode));
}
assert.match(fs.readFileSync('src/components/Modals/Resources/Sections/SingleRadio/index.tsx', 'utf8'), /<SingleRadio/);
console.log('PASS: 6 GHz modes round-trip, default unchanged, siblings retained, invalid mode refused, shared disabled-aware selector');
