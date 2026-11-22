/* node scripts/performance-aggregate.cjs <server-jsonl> <results.json>
   Reports server-side compressed-body bytes enqueued during the worker-enabled
   cold interval separately from browser CDP loadingFinished observations.
   Neither count includes HTTP headers. Server bytes are not proof of receipt. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const [logFile, resultFile] = process.argv.slice(2);
assert(logFile && resultFile, 'Provide server JSONL and results.json');
const log = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
const totals = result.runs.map(run => {
  const rows = log.filter(row => row.run === run.serviceWorker.token &&
    (row.serverWriteEnqueuedAt || row.time) <= run.serviceWorker.coldEnd);
  assert(rows.length, `No traffic for ${run.serviceWorker.token}`);
  const js = rows.filter(row => /\.js(?:$|\?)/.test(row.path));
  const workerEvents = run.serviceWorker.workerReceiveObservation || [];
  const workerCompleted = workerEvents.filter(event => event.type === 'loadingFinished');
  const workerUrls = new Map(workerEvents.filter(event => event.type === 'responseReceived').map(event => [event.requestId, event.url]));
  const workerCompletedJs = workerCompleted.filter(event => /\.js(?:$|\?)/.test(workerUrls.get(event.requestId) || ''));
  const pageCompleted = run.scripts || [];
  return { token: run.serviceWorker.token, worker: run.serviceWorker.state,
    accounting: {
      serverWriteEnqueuedCompressedJsBodyBytes: js.reduce((n, row) => n + row.encodedBodyBytes, 0),
      serviceWorkerCdpLoadingFinishedEncodedDataBytes: workerCompleted.reduce((n, event) => n + (event.encodedDataLength || 0), 0),
      serviceWorkerCdpCompletedRequestCount: workerCompleted.length,
      serviceWorkerCdpLoadingFinishedEncodedJsBytes: workerCompletedJs.reduce((n, event) => n + (event.encodedDataLength || 0), 0),
      serviceWorkerCdpCompletedJsRequestCount: workerCompletedJs.length,
      serviceWorkerCdpObservationStatus: workerEvents.some(event => event.type === 'instrumentation-error') ? 'instrumentation-error' : workerCompleted.length ? 'observed' : 'no-completion-events',
      demandOnlyPageCdpLoadingFinishedScriptBytes: pageCompleted.reduce((n, script) => n + (script.bytes || 0), 0),
      note: 'Server count is compressed response body bytes passed to res.end; CDP counts are browser-side encodedDataLength reported at loadingFinished and may include protocol overhead. These are separate evidence streams.'
    },
    byDestination: Object.fromEntries([...new Set(js.map(row => row.destination || 'unknown'))].map(dest => [dest, js.filter(row => (row.destination || 'unknown') === dest).reduce((n, row) => n + row.encodedBodyBytes, 0)])),
    scripts: js.map(({ path, destination, encodedBodyBytes }) => ({ path, destination, encodedBodyBytes })) };
});
const sorted = totals.map(t => t.accounting.serverWriteEnqueuedCompressedJsBodyBytes).sort((a, b) => a - b);
console.log(JSON.stringify({ note: 'Compressed response bodies only; HTTP headers excluded.', runs: totals,
  median: sorted[Math.ceil(sorted.length * .5) - 1], p75: sorted[Math.ceil(sorted.length * .75) - 1] }, null, 2));
