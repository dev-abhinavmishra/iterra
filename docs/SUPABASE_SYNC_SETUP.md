# Supabase sync setup

## Applied schema

The canonical entity mirror is deployed to project `fejwmfglgkumuycmdvvr` by
migration `20261122040424_create_iterra_entities_sync.sql`. It uses
`public.iterra_entities`, keyed by `(user_id, key)`, with `user_id` referencing
`auth.users(id) ON DELETE CASCADE`. Tombstones retain only key/app/type/id and
the delete stamp; they do not retain the deleted entity payload.

The browser role `authenticated` has table `SELECT` only, scoped by an RLS
policy comparing `user_id` to `auth.uid()`. Writes go through the
`iterra_entity_put` and `iterra_entity_remove` RPCs. Both functions are owned
by `postgres`, use an empty `search_path`, derive ownership from `auth.uid()`
and do not accept a caller-supplied owner ID. `anon` cannot read the table or
execute the write RPCs. `service_role` retains its normal privileged table and
function access; it must remain server-side.

## Runtime verification

On 2026-11-22, catalog checks confirmed the table owner, RLS policy, table
grants, function owners/configuration/ACLs, and cascading auth-user foreign
key. Two explicit `BEGIN … ROLLBACK` SQL checks passed against the deployed
project. They covered put/remove LWW results, stale resurrection prevention,
minimal tombstones, invalid type/field/key/ID/data inputs, JavaScript safe
integer limits, anonymous access denial, cross-user isolation, and auth-user
deletion cascade. After rollback, `iterra_entities` had zero rows and all
temporary auth users were absent.

The pgTAP extension was not installed, so the repository pgTAP suite was not
run. The runtime checks used exception-raising SQL assertions inside explicit
transactions instead. No application user data was created or retained.

The Supabase security advisor reports two
`authenticated_security_definer_function_executable` warnings for the two
write RPCs. These are intentional: clients need the RPCs because they have no
direct table DML grants. The functions validate the payload, derive the owner
from the signed-in identity, and use a fixed empty `search_path`. This warning
is expected and should remain tracked after future schema changes. The
performance and health advisors returned no lints at verification time.

## Auth and client key configuration

The Supabase connector's read-only project metadata does not expose Auth
provider settings, and no read-only Auth configuration tool is available in
the current connector. Anonymous sign-in enablement is therefore unverified;
no persistent or live test users were created. The database checks used
temporary `auth.users` fixtures inside transactions that were rolled back.

The project has an enabled `default` publishable key and an enabled legacy
`anon` key. The browser client currently reads `SUPABASE_URL` and
`SUPABASE_ANON_KEY`; it does not currently read `SUPABASE_PUBLISHABLE_KEY`.
Use the publishable key for browser builds, wiring it through the existing
client key variable or updating that variable contract. Keep the key in the
build environment rather than source or docs. Never expose the service-role
key in the browser.

## Limits

`synced_at` is a statement-time server arrival stamp, not a commit-order stamp.
The adapter uses an overlap and periodic full scans to recover delayed rows;
the overlap alone is not a strict guarantee for unusually long transactions.
The database checks the 64 KiB entity-data limit using PostgreSQL's normalized
JSONB text rendered as UTF-16 units. Near the size boundary, JSONB formatting
or numeric normalization can be slightly longer than JavaScript's
`JSON.stringify`, so the server can conservatively reject some payloads the
local hub accepts.

## Workspace email access

Enable the Email provider and allow the deployed shell URL with the `?workspace-account=1` callback in Auth redirect settings. Iterra accepts the standard email confirmation link. To offer code entry too, include `{{ .Token }}` in the Magic Link and Change Email Address templates. Configure an SMTP sender for delivery to students.

On the original browser, enable shared record sync and then open Workspace account to link an email. On another browser, sign in with that email before enabling sync. Consent on the new device authorizes merging its existing shared records with the account. Private tool databases remain device-local. Signing out turns off shared record sync and leaves local records in place.
