const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

let clipboardValue;
let effects = [];
const copied = [];
const setValue = (value) => { clipboardValue = value; };
const exportsObject = {};
const source = fs.readFileSync('src/hooks/useEnrollmentClipboard.ts', 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(code, {
  exports: exportsObject,
  require: (name) => {
    if (name === 'react') return { useEffect: (callback) => effects.push(callback) };
    if (name === '@chakra-ui/react') return {
      useClipboard: (initialValue) => {
        // Reproduce Chakra 2.1.0: props do not update the retained value.
        if (clipboardValue === undefined) clipboardValue = initialValue;
        return { setValue, onCopy: () => copied.push(clipboardValue), hasCopied: false };
      },
    };
    throw Error(`Unexpected dependency: ${name}`);
  },
});
for (const value of [undefined, 'synthetic-first-key', 'synthetic-replacement-key', undefined]) {
  const result = exportsObject.useEnrollmentClipboard(value);
  effects.forEach((effect) => effect());
  effects = [];
  result.onCopy();
  assert.equal(copied.at(-1), value || '');
}
const page = fs.readFileSync('src/pages/CertificatesPage/index.tsx', 'utf8');
assert.match(page, /useEnrollmentClipboard\(enrollmentKey\?\.enrollmentKey\)/);
assert.match(page, /onClick=\{onCopy\}/);
assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
console.log('PASS: async enrollment key, replacement key and cleared key copy correctly; no key logging or persistence');
