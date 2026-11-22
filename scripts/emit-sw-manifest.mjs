/* Emit two service-worker build artifacts after Vite:
   - sw-manifest.json remains the complete sorted asset inventory array.
   - sw-precache-policy.json describes the source-keyed core, tool, and
     dynamic-feature graph for selective offline warming.

   The policy is based on Vite's source-keyed manifest, never on hashed chunk
   filename patterns. Hashed URLs are values; logical module paths are keys. */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIST = fileURLToPath(new URL('../dist', import.meta.url));
const INVENTORY_FILE_PATTERN = /\.(js|css|woff2?|svg|png|webp)$/i;
const TOOL_ENTRY_PATTERN = /^(?:\.\/)?src\/apps\/([^/]+)\/App\.(?:tsx?|jsx?)$/i;
const BUILD_ID_SHELL_FILES = ['index.html', 'iterra-hub.js', 'site.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

function sorted(values) {
  return [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

function normalizedSourceKey(key) {
  return key.replace(/\\/g, '/').replace(/^\.\//, '');
}

function logicalModuleId(key, record) {
  if (typeof record?.src === 'string' && record.src.trim()) return normalizedSourceKey(record.src);
  const normalizedKey = normalizedSourceKey(key);
  if (/^src\//.test(normalizedKey)) return normalizedKey;
  if (typeof record?.name === 'string' && /^[A-Za-z][A-Za-z0-9._:-]*$/.test(record.name)) return `chunk:${record.name}`;
  return null;
}

function toolIdForEntry(key, record) {
  const identity = logicalModuleId(key, record) || normalizedSourceKey(key);
  const match = identity.match(TOOL_ENTRY_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

function publicAssetUrl(file) {
  if (typeof file !== 'string' || !file.trim()) throw new Error('Vite manifest record is missing its emitted file path');
  return `/${file.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

function stableManifest(manifest) {
  return Object.fromEntries(sorted(Object.keys(manifest)).map(key => {
    const record = manifest[key];
    const normalized = {};
    for (const property of sorted(Object.keys(record || {}))) {
      const value = record[property];
      if (['imports', 'dynamicImports', 'css', 'assets'].includes(property) && Array.isArray(value) && value.length === 0) continue;
      normalized[property] = Array.isArray(value) ? sorted(value) : value;
    }
    return [normalizedSourceKey(key), normalized];
  }));
}

export function deterministicBuildId(manifest, supplementaryFiles = {}) {
  const canonical = JSON.stringify(stableManifest(manifest));
  const supplemental = Object.fromEntries(sorted(Object.keys(supplementaryFiles)).map(file => [
    file.replace(/\\/g, '/'), createHash('sha256').update(supplementaryFiles[file]).digest('hex'),
  ]));
  return createHash('sha256').update(canonical).update(JSON.stringify(supplemental)).digest('hex').slice(0, 20);
}

export function stampWorkerWithBuildId(workerSource, buildId) {
  if (!/^[a-f0-9]{20}$/.test(buildId)) throw new Error('Cannot stamp service worker with an invalid build ID');
  const marker = /const EXPECTED_BUILD_ID = ['"](?:__ITERRA_PRECACHE_POLICY_BUILD_ID__|[a-f0-9]{20})['"];?/g;
  const matches = [...workerSource.matchAll(marker)];
  if (matches.length !== 1) throw new Error(`Expected one worker build ID sentinel; found ${matches.length}`);
  return workerSource.replace(marker, `const EXPECTED_BUILD_ID = '${buildId}';`);
}

export function stampHtmlWithBuildId(htmlSource, buildId) {
  if (!/^[a-f0-9]{20}$/.test(buildId)) throw new Error('Cannot stamp HTML with an invalid build ID');
  const marker = /<meta\s+name=["']iterra-build-id["']\s+content=["'](?:__ITERRA_BUILD_ID__|[a-f0-9]{20})["']\s*\/?>/gi;
  const matches = [...htmlSource.matchAll(marker)];
  if (matches.length !== 1) throw new Error(`Expected one HTML build ID sentinel; found ${matches.length}`);
  return htmlSource.replace(marker, `<meta name="iterra-build-id" content="${buildId}" />`);
}

export function validateHtmlModuleEntry(htmlSource, entryUrl) {
  const expected = new URL(entryUrl, 'https://iterra.invalid').pathname;
  const moduleUrls = [...htmlSource.matchAll(/<script\b[^>]*>/gi)].map(match => {
    const tag = match[0];
    if (!/\btype=["']module["']/i.test(tag)) return null;
    const source = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    return source ? new URL(source, 'https://iterra.invalid').pathname : null;
  }).filter(Boolean);
  if (moduleUrls.length !== 1 || moduleUrls[0] !== expected) {
    throw new Error(`Built HTML module URL ${moduleUrls.join(', ') || '(missing)'} does not match manifest entry ${entryUrl}`);
  }
}

export function buildPrecachePolicy(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Expected a Vite manifest object');
  const normalizedKeys = new Map();
  for (const key of Object.keys(manifest)) {
    const normalized = normalizedSourceKey(key);
    if (normalizedKeys.has(normalized) && normalizedKeys.get(normalized) !== key) {
      throw new Error(`Duplicate normalized Vite source key "${normalized}": ${normalizedKeys.get(normalized)} and ${key}`);
    }
    normalizedKeys.set(normalized, key);
  }

  let entryKeys = Object.keys(manifest).filter(key => {
    const record = manifest[key];
    return record?.isEntry && (normalizedSourceKey(key) === 'index.html' || normalizedSourceKey(record.src || '') === 'index.html');
  });
  if (!entryKeys.length) entryKeys = Object.keys(manifest).filter(key => {
    const record = manifest[key];
    return record?.isEntry && (normalizedSourceKey(key) === 'src/main.tsx' || normalizedSourceKey(record.src || '') === 'src/main.tsx');
  });
  if (entryKeys.length !== 1) throw new Error(`Expected one Vite entry for index.html (or src/main.tsx fallback); found ${entryKeys.length}`);
  const mainEntry = entryKeys[0];
  const mainEntryRecord = manifest[mainEntry];
  const mainEntrySource = normalizedSourceKey(mainEntryRecord.src || mainEntry);
  let moduleEntry;
  if (/^src\/main\.(?:tsx?|jsx?)$/i.test(mainEntrySource) || /\.m?js$/i.test(mainEntryRecord.file || '')) {
    moduleEntry = mainEntry;
  } else {
    const moduleEntryKeys = (mainEntryRecord.imports || []).filter(key => manifest[key] && /\.m?js$/i.test(manifest[key].file || ''));
    if (moduleEntryKeys.length !== 1) throw new Error(`Expected one JavaScript module entry imported by ${mainEntry}; found ${moduleEntryKeys.length}`);
    moduleEntry = moduleEntryKeys[0];
  }

  function staticClosure(startKey) {
    const visited = new Set();
    const ordered = [];
    function visit(key) {
      if (visited.has(key)) return;
      const record = manifest[key];
      if (!record) throw new Error(`Vite manifest references missing module key: ${key}`);
      visited.add(key);
      ordered.push(key);
      for (const imported of record.imports || []) visit(imported);
    }
    visit(startKey);
    return ordered;
  }

  function urlsForKeys(keys) {
    const urls = new Set();
    for (const key of keys) {
      const record = manifest[key];
      if (!record) throw new Error(`Vite manifest references missing module key: ${key}`);
      urls.add(publicAssetUrl(record.file));
      for (const file of [...(record.css || []), ...(record.assets || [])]) urls.add(publicAssetUrl(file));
    }
    return sorted(urls);
  }

  function dynamicEntriesIn(keys) {
    const entries = new Set();
    for (const key of keys) for (const imported of manifest[key].dynamicImports || []) entries.add(imported);
    return sorted(entries);
  }

  function collectDynamicFeatures(startKeys) {
    const features = {};
    const pending = dynamicEntriesIn(startKeys);
    const visited = new Set();
    while (pending.length) {
      const featureKey = pending.shift();
      if (visited.has(featureKey)) continue;
      visited.add(featureKey);
      if (!manifest[featureKey]) throw new Error(`Vite manifest references missing dynamic module key: ${featureKey}`);
      // App roots are represented by the tool graph, not as nested features.
      if (toolIdForEntry(featureKey)) continue;

      const closure = staticClosure(featureKey);
      const sourceId = logicalModuleId(featureKey, manifest[featureKey]);
      const featureId = sourceId || `unmapped:${normalizedSourceKey(featureKey)}`;
      const feature = {
        sourceKey: normalizedSourceKey(featureKey),
        entry: publicAssetUrl(manifest[featureKey].file),
        assets: urlsForKeys(closure),
        ...(sourceId ? {} : { unmapped: true }),
      };
      const previous = features[featureId];
      if (previous && previous.entry !== feature.entry) throw new Error(`Duplicate logical feature ID "${featureId}" for ${previous.sourceKey} and ${feature.sourceKey}`);
      features[featureId] = feature;
      for (const nested of dynamicEntriesIn(closure)) if (!visited.has(nested)) pending.push(nested);
    }
    return Object.fromEntries(sorted(Object.keys(features)).map(key => [key, features[key]]));
  }

  const coreKeys = staticClosure(mainEntry);
  const discoveredTools = new Map();
  for (const dynamicKey of dynamicEntriesIn(coreKeys)) {
    const id = toolIdForEntry(dynamicKey, manifest[dynamicKey]);
    if (!id) continue;
    if (discoveredTools.has(id) && discoveredTools.get(id) !== dynamicKey) {
      throw new Error(`Duplicate logical tool ID "${id}" in Vite entries: ${discoveredTools.get(id)} and ${dynamicKey}`);
    }
    discoveredTools.set(id, dynamicKey);
  }

  const tools = {};
  const toolEntries = {};
  const toolFeatures = {};
  for (const id of sorted(discoveredTools.keys())) {
    const entryKey = discoveredTools.get(id);
    const keys = staticClosure(entryKey);
    tools[id] = urlsForKeys(keys);
    toolEntries[id] = publicAssetUrl(manifest[entryKey].file);
    toolFeatures[id] = collectDynamicFeatures(keys);
  }

  return {
    version: 1,
    buildId: deterministicBuildId(manifest),
    entry: normalizedSourceKey(mainEntry),
    entryUrl: publicAssetUrl(manifest[moduleEntry].file),
    core: urlsForKeys(coreKeys),
    tools,
    toolEntries,
    dynamicFeatures: {
      core: collectDynamicFeatures(coreKeys),
      tools: toolFeatures,
    },
  };
}

export function collectAssetInventory(dist) {
  const assets = [];
  const assetsRoot = join(dist, 'assets');
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (INVENTORY_FILE_PATTERN.test(name)) assets.push('/' + file.slice(dist.length).replace(/\\/g, '/').replace(/^\/+/, ''));
    }
  }
  walk(assetsRoot);
  return sorted(new Set(assets));
}

export function emitServiceWorkerManifests(dist = DEFAULT_DIST) {
  const viteManifestPath = join(dist, '.vite', 'manifest.json');
  const viteManifest = JSON.parse(readFileSync(viteManifestPath, 'utf8'));
  const inventory = collectAssetInventory(dist);
  const supplementaryFiles = Object.fromEntries(BUILD_ID_SHELL_FILES
    .filter(file => { try { return statSync(join(dist, file)).isFile(); } catch { return false; } })
    .map(file => [file, readFileSync(join(dist, file))]));
  const policy = buildPrecachePolicy(viteManifest);
  policy.buildId = deterministicBuildId(viteManifest, supplementaryFiles);
  writeFileSync(join(dist, 'sw-manifest.json'), JSON.stringify(inventory));
  writeFileSync(join(dist, 'sw-precache-policy.json'), JSON.stringify(policy, null, 2));
  const htmlPath = join(dist, 'index.html');
  const html = readFileSync(htmlPath, 'utf8');
  validateHtmlModuleEntry(html, policy.entryUrl);
  writeFileSync(htmlPath, stampHtmlWithBuildId(html, policy.buildId));
  const workerPath = join(dist, 'sw.js');
  writeFileSync(workerPath, stampWorkerWithBuildId(readFileSync(workerPath, 'utf8'), policy.buildId));
  console.log(`sw-manifest: ${inventory.length} inventory assets; core ${policy.core.length}; tools ${Object.keys(policy.tools).length}; build ${policy.buildId}`);
  return { inventory, policy };
}

const scriptPath = resolve(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) emitServiceWorkerManifests();
