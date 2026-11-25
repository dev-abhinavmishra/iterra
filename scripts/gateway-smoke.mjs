/* gateway-smoke.mjs — verify AI_GATEWAY_API_KEY works against the free
   models, using the same OpenAI-compatible endpoint api/_providers.ts uses.
   Reads .env.local (never prints the key). Usage: node scripts/gateway-smoke.mjs */
import fs from 'node:fs';
import path from 'node:path';

const envFile = path.resolve('.env.local');
const env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const key = process.env.AI_GATEWAY_API_KEY || env.AI_GATEWAY_API_KEY;
if (!key) {
  console.log('FAIL: AI_GATEWAY_API_KEY not set in env or .env.local');
  process.exit(1);
}

const MODELS = [
  'nvidia/nemotron-3.5-lightning-free',
  'reflection/beam-free',
  'recursive/flint-v1.0',
  'stealth/glyph-cluster',
];

const prompt =
  'Invent a new holiday and describe its traditions in two sentences.';

let ok = false;
for (const model of MODELS) {
  try {
    const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.log(`${model}: HTTP ${res.status} — ${text.slice(0, 160)}`);
      continue;
    }
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      console.log(`${model}: empty content — ${text.slice(0, 160)}`);
      continue;
    }
    console.log(`${model}: OK`);
    console.log(`  → ${String(content).replace(/\s+/g, ' ').slice(0, 180)}`);
    ok = true;
    break;
  } catch (e) {
    console.log(`${model}: threw ${e.message}`);
  }
}
process.exit(ok ? 0 : 1);
