import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrecachePolicy, deterministicBuildId, stampHtmlWithBuildId, stampWorkerWithBuildId, validateHtmlModuleEntry } from './emit-sw-manifest.mjs';

function manifestFor(hash = 'a1') {
  return {
    'index.html': {
      file: 'index.html', isEntry: true, src: 'index.html', imports: ['src/main.tsx'],
      dynamicImports: [], css: [], assets: [],
    },
    'src/main.tsx': {
      file: `assets/main-${hash}.js`, imports: ['src/App.tsx', 'src/shared.ts'], dynamicImports: [],
      css: [`assets/main-${hash}.css`], assets: [`assets/logo-${hash}.svg`],
    },
    'src/App.tsx': {
      file: `assets/shell-${hash}.js`, imports: ['src/apps/index.ts'],
      dynamicImports: ['src/integration/ImportHelp.tsx'], css: [], assets: [],
    },
    'src/apps/index.ts': {
      file: `assets/tool-index-${hash}.js`, imports: [],
      dynamicImports: ['src/apps/ink/App.tsx', 'src/apps/syllabus/App.tsx'], css: [], assets: [],
    },
    'src/shared.ts': { file: `assets/shared-${hash}.js`, imports: ['src/shared-helper.ts'], css: [], assets: [] },
    'src/shared-helper.ts': { file: `assets/shared-helper-${hash}.js`, imports: ['src/shared.ts'], css: [], assets: [] },
    'src/integration/ImportHelp.tsx': {
      file: `assets/import-help-${hash}.js`, imports: [],
      dynamicImports: ['src/integration/ImportPreview.tsx'], css: [`assets/import-help-${hash}.css`], assets: [],
    },
    'src/integration/ImportPreview.tsx': { file: `assets/import-preview-${hash}.js`, imports: [], css: [], assets: [] },
    'src/apps/ink/App.tsx': {
      file: `assets/ink-${hash}.js`, imports: ['src/shared.ts'],
      dynamicImports: ['src/apps/ink/components/RichEditor.tsx'], css: [`assets/ink-${hash}.css`], assets: [],
    },
    'src/apps/ink/components/RichEditor.tsx': {
      file: `assets/ink-editor-${hash}.js`, imports: [],
      dynamicImports: ['src/apps/ink/components/PdfExport.tsx'], css: [`assets/ink-editor-${hash}.css`], assets: [],
    },
    'src/apps/ink/components/PdfExport.tsx': {
      file: `assets/ink-pdf-${hash}.js`, imports: [], css: [], assets: [`assets/pdf-icon-${hash}.svg`],
    },
    'src/apps/syllabus/App.tsx': {
      file: `assets/syllabus-${hash}.js`, imports: ['src/shared.ts'], dynamicImports: [],
      css: [`assets/syllabus-${hash}.css`], assets: [],
    },
  };
}

test('core is the entry static closure and excludes lazy tools and features', () => {
  const policy = buildPrecachePolicy(manifestFor());
  assert.deepEqual(policy.core, [
    '/index.html', '/assets/main-a1.css', '/assets/main-a1.js', '/assets/shared-a1.js', '/assets/shared-helper-a1.js',
    '/assets/logo-a1.svg', '/assets/shell-a1.js', '/assets/tool-index-a1.js',
  ].sort());
  assert(!policy.core.some(url => /ink-|syllabus-|import-help|import-preview/.test(url)));
  assert.deepEqual(Object.keys(policy.tools), ['ink', 'syllabus']);
  assert.equal(policy.entryUrl, '/assets/main-a1.js');
  assert(policy.tools.ink.includes('/assets/ink-a1.css'));
  assert(policy.tools.ink.includes('/assets/shared-a1.js'), 'shared static dependencies are included in each tool closure');
  assert(policy.dynamicFeatures.core['src/integration/ImportHelp.tsx'].assets.includes('/assets/import-help-a1.css'));
  assert(policy.dynamicFeatures.core['src/integration/ImportPreview.tsx'].entry === '/assets/import-preview-a1.js');
});

test('main.tsx fallback identifies itself as the HTML module URL', () => {
  const manifest = manifestFor();
  manifest['index.html'].isEntry = false;
  manifest['src/main.tsx'].isEntry = true;
  const policy = buildPrecachePolicy(manifest);
  assert.equal(policy.entry, 'src/main.tsx');
  assert.equal(policy.entryUrl, '/assets/main-a1.js');
});

test('Vite HTML facade file is the real module URL, not its imported shared chunk', () => {
  const manifest = manifestFor();
  manifest['index.html'].file = 'assets/html-facade-a1.js';
  const policy = buildPrecachePolicy(manifest);
  assert.equal(policy.entryUrl, '/assets/html-facade-a1.js');
  validateHtmlModuleEntry('<script type="module" crossorigin src="/assets/html-facade-a1.js"></script>', policy.entryUrl);
  assert.throws(() => validateHtmlModuleEntry('<script type="module" src="/assets/shared-a1.js"></script>', policy.entryUrl), /does not match manifest entry/);
});

test('tool-local nested dynamic features retain CSS and imported assets by logical source key', () => {
  const policy = buildPrecachePolicy(manifestFor());
  const features = policy.dynamicFeatures.tools.ink;
  assert.deepEqual(Object.keys(features), [
    'src/apps/ink/components/PdfExport.tsx',
    'src/apps/ink/components/RichEditor.tsx',
  ]);
  assert.equal(features['src/apps/ink/components/RichEditor.tsx'].entry, '/assets/ink-editor-a1.js');
  assert(features['src/apps/ink/components/RichEditor.tsx'].assets.includes('/assets/ink-editor-a1.css'));
  assert.equal(features['src/apps/ink/components/PdfExport.tsx'].entry, '/assets/ink-pdf-a1.js', 'nested dynamic feature is separately addressable');
  assert(features['src/apps/ink/components/PdfExport.tsx'].assets.includes('/assets/pdf-icon-a1.svg'));
});

test('stable logical feature keys resolve to new hashed URLs after a build update', () => {
  const oldPolicy = buildPrecachePolicy(manifestFor('old'));
  const newPolicy = buildPrecachePolicy(manifestFor('new'));
  const featureKey = 'src/apps/ink/components/RichEditor.tsx';
  assert.notEqual(oldPolicy.buildId, newPolicy.buildId);
  assert.equal(Object.keys(oldPolicy.dynamicFeatures.tools.ink).find(k => k === featureKey), featureKey);
  assert.equal(Object.keys(newPolicy.dynamicFeatures.tools.ink).find(k => k === featureKey), featureKey);
  assert(newPolicy.dynamicFeatures.tools.ink[featureKey].assets.includes('/assets/ink-editor-new.js'));
  assert(!newPolicy.dynamicFeatures.tools.ink[featureKey].assets.includes('/assets/ink-editor-old.js'));
});

test('manual chunk keys may change hashes while stable chunk names retain used feature identity', () => {
  const make = suffix => {
    const manifest = manifestFor(suffix);
    const oldKey = 'src/apps/ink/components/RichEditor.tsx';
    const { [oldKey]: editor, ...withoutEditor } = manifest;
    withoutEditor['src/apps/ink/App.tsx'].dynamicImports = [`_vendor-editor-${suffix}.js`];
    withoutEditor[`_vendor-editor-${suffix}.js`] = {
      ...editor,
      name: 'ink-rich-editor',
      src: undefined,
      file: `assets/vendor-editor-${suffix}.js`,
      css: [`assets/vendor-editor-${suffix}.css`],
    };
    return withoutEditor;
  };

  const oldPolicy = buildPrecachePolicy(make('old'));
  const newPolicy = buildPrecachePolicy(make('new'));
  const logicalId = 'chunk:ink-rich-editor';
  assert(oldPolicy.dynamicFeatures.tools.ink[logicalId]);
  assert(newPolicy.dynamicFeatures.tools.ink[logicalId]);
  assert.equal(newPolicy.dynamicFeatures.tools.ink[logicalId].entry, '/assets/vendor-editor-new.js');
  assert(newPolicy.dynamicFeatures.tools.ink[logicalId].assets.includes('/assets/vendor-editor-new.css'));
  assert.equal(Object.keys(newPolicy.dynamicFeatures.tools.ink).some(key => key.includes('vendor-editor-new')), false);
});

test('build ID ignores manifest object and graph-array ordering but changes when outputs change', () => {
  const original = manifestFor('same');
  const reordered = Object.fromEntries(Object.entries(original).reverse().map(([key, record]) => [key, {
    ...Object.fromEntries(Object.entries(record).reverse()),
    imports: [...(record.imports || [])].reverse(),
    dynamicImports: [...(record.dynamicImports || [])].reverse(),
    css: [...(record.css || [])].reverse(), assets: [...(record.assets || [])].reverse(),
  }]));
  assert.equal(deterministicBuildId(original), deterministicBuildId(reordered));
  assert.equal(deterministicBuildId(original, { 'index.html': 'stable', 'icon.svg': 'same' }),
    deterministicBuildId(reordered, { 'icon.svg': 'same', 'index.html': 'stable' }));
  assert.notEqual(deterministicBuildId(original, { 'index.html': 'one' }), deterministicBuildId(original, { 'index.html': 'two' }));
  assert.notEqual(deterministicBuildId(original), deterministicBuildId(manifestFor('different')));
});

test('generated worker stamp changes on policy updates without accumulating markers', () => {
  const original = "const EXPECTED_BUILD_ID = '__ITERRA_PRECACHE_POLICY_BUILD_ID__';\nself.addEventListener(\"install\", () => {});\n";
  const first = stampWorkerWithBuildId(original, 'a'.repeat(20));
  const second = stampWorkerWithBuildId(first, 'b'.repeat(20));
  assert.match(first, /EXPECTED_BUILD_ID = 'aaaaaaaaaaaaaaaaaaaa'/);
  assert.match(second, /EXPECTED_BUILD_ID = 'bbbbbbbbbbbbbbbbbbbb'/);
  assert.equal((second.match(/const EXPECTED_BUILD_ID/g) || []).length, 1);
});

test('HTML build stamp is deterministic and replaced without duplicate metadata', () => {
  const source = '<html><head><meta name="iterra-build-id" content="__ITERRA_BUILD_ID__" /></head></html>';
  const first = stampHtmlWithBuildId(source, 'a'.repeat(20));
  const second = stampHtmlWithBuildId(first, 'b'.repeat(20));
  assert.match(first, /content="aaaaaaaaaaaaaaaaaaaa"/);
  assert.match(second, /content="bbbbbbbbbbbbbbbbbbbb"/);
  assert.equal((second.match(/name="iterra-build-id"/g) || []).length, 1);
  assert.throws(() => stampHtmlWithBuildId('<html></html>', 'a'.repeat(20)), /Expected one HTML build ID sentinel/);
});

test('rejects duplicate logical tool IDs and missing graph references', () => {
  const duplicate = manifestFor();
  duplicate['src/apps/Ink/App.tsx'] = { ...duplicate['src/apps/ink/App.tsx'], file: 'assets/ink-duplicate.js' };
  duplicate['src/apps/index.ts'].dynamicImports.push('src/apps/Ink/App.tsx');
  assert.throws(() => buildPrecachePolicy(duplicate), /Duplicate logical tool ID/);

  const missing = manifestFor();
  missing['src/App.tsx'].imports.push('src/missing/Module.tsx');
  assert.throws(() => buildPrecachePolicy(missing), /references missing module key/);

  const notEntry = manifestFor();
  notEntry['index.html'].isEntry = false;
  assert.throws(() => buildPrecachePolicy(notEntry), /Expected one Vite entry for index\.html \(or src\/main\.tsx fallback\); found 0/);

  const ambiguous = manifestFor();
  ambiguous['src/second-main.tsx'] = { ...ambiguous['src/main.tsx'], isEntry: true, src: 'index.html', file: 'assets/second-main.js' };
  assert.throws(() => buildPrecachePolicy(ambiguous), /Expected one Vite entry for index\.html \(or src\/main\.tsx fallback\); found 2/);

  const duplicateKey = manifestFor();
  duplicateKey['./index.html'] = { ...duplicateKey['index.html'] };
  assert.throws(() => buildPrecachePolicy(duplicateKey), /Duplicate normalized Vite source key/);
});
