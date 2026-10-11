# Timer deep-link contract

Syllabus launches work blocks in Timer (`timerstack.vercel.app`, configurable in
Registry settings). Timer-side receiver lives in `dev-abhinavmishra/timer`.

## Outbound — Syllabus → Timer

```
GET {timerBaseUrl}/?intent=<text>&minutes=<n>&course=<code>&from=syllabus&block=<id>
```

| Param | Meaning | Timer should |
|---|---|---|
| `intent` | Session label, e.g. `MATH211 — Problem set 4 · work` | Prefill the intent field |
| `minutes` | Planned duration | Prefill the dial/minutes |
| `course` | Course code | Optional chip/preset context |
| `from` | Always `syllabus` | Marks provenance |
| `block` | WorkBlock id | Echo back on completion |
| `return` | Syllabus origin (e.g. `https://syllabus.vercel.app`) | Target for the file-back redirect |
| `autostart` | `1` = begin immediately | Optional |

## Return — Timer → Syllabus

On session completion, Timer may redirect the tab back:

```
GET {syllabusOrigin}/?completedBlock=<blockId>&actual=<minutes>
```

Syllabus consumes this once in `boot()` (store/index.ts): stamps the block done
with the actual minutes, feeding effort calibration. If Timer never returns,
the student stamps the slip and edits actual time — the flow degrades
gracefully by design.
