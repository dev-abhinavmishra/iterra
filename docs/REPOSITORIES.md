# Iterra repository map

The integrated product is built from `shell/` in this repository. The
`apps/` directories are vendored reference copies, not the shell build
entry point. The integrated copies under `shell/src/apps/` also contain
Iterra-specific adapters, navigation, persistence and course links. Do not
replace them wholesale with an upstream checkout.

| Iterra place | Standalone repository | Default branch at inventory | Head inspected |
| --- | --- | --- | --- |
| Planning | [syllabus](https://github.com/dev-abhinavmishra/syllabus) | `devin/1791693623-syllabus-mvp` | `791421d` |
| Attendance | [rhythm](https://github.com/dev-abhinavmishra/rhythm) | `devin/1791743250-rhythm-mvp` | `c0145cc` |
| Flashcards | [flashcards](https://github.com/dev-abhinavmishra/flashcards) | `main` | `817402b` |
| Notes | [ink](https://github.com/dev-abhinavmishra/ink) | `main` | `5165702` |
| Study Materials | [margin](https://github.com/dev-abhinavmishra/margin) | `main` | `1add739` |
| Assessments | [gradestack](https://github.com/dev-abhinavmishra/gradestack) | `main` | `2e5cf19` |
| Timer | [timer](https://github.com/dev-abhinavmishra/timer) | `main` | `06487c6` |
| Calculations | [proof](https://github.com/dev-abhinavmishra/proof) | `devin/proof-v1` | `221d25d` |
| Daily Board | `shell/src/apps/boxed/` in Iterra | — | No separate repository identified |

Inventory checked 2026-11-16. Branch heads can change; check the actual
remote before merging or pushing. A source checkout under `tmp/` is a local
working copy, not a canonical source.

## Updating an app

1. Fetch its current default branch and inspect its instructions and changes.
   Compare against both the vendored copy and the integrated copy, including
   storage migrations and the app's Iterra adapter. Do not assume the
   `apps/` directory is the current upstream version.
2. Port upstream features into `shell/src/apps/` while preserving existing
   users' data and the contracts in [WIRING.md](WIRING.md) and
   [ADAPTER.md](ADAPTER.md). When a feature is changed in the integrated copy,
   decide explicitly whether its standalone equivalent belongs upstream.
3. Test the standalone application and the integrated shell independently,
   including both themes, navigation, persistence and relevant cross-tool
   actions. Record the tested upstream commit and any deliberate divergence.
4. Commit each repository separately and push only its own verified changes to
   its intended branch. Never overwrite a remote head that has moved; fetch
   and reconcile first. Run the shell contract checks and full integration
   checks after syncing.

Flashcards `817402b` includes session-completion states and the held-arrow
boundary fix. Those behaviors are already present in the integrated controller;
Iterra adds course-linked imports, its adapter and other integration behavior.
This inventory is not a proof that every upstream feature has been reconciled.

The embedded colors use the shell Paper/Graphite semantic tokens. Keep those
Iterra-specific palette changes in the shell; standalone apps retain their
own visual identity. General-purpose fixes and features can be ported to a
standalone repository when they are useful there and verified independently.
