begin;
select plan(27);

-- The owner FK requires real auth rows and lets deletion cascade sync content.
insert into auth.users (id, aud, role, email, encrypted_password)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'iterra-audit-a@example.test', ''),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'iterra-audit-b@example.test', '');

-- Simulate one authenticated user. The functions derive ownership from this
-- claim; callers never supply user_id.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;

select is(
  public.iterra_entity_put(
    'margin:note:n1', 'margin', 'note', null, 100,
    '{"key":"margin:note:n1","app":"margin","type":"note","id":"n1","courseId":null,"updatedAt":100,"title":"first"}'::jsonb
  ), 'applied', 'first put is applied'
);
select is(
  public.iterra_entity_put(
    'margin:note:n1', 'margin', 'note', null, 90,
    '{"key":"margin:note:n1","app":"margin","type":"note","id":"n1","courseId":null,"updatedAt":90,"title":"stale"}'::jsonb
  ), 'stale', 'older put cannot replace newer entity'
);
select is(
  public.iterra_entity_remove('margin:note:n1', 110), 'applied',
  'newer remove applies as tombstone'
);
select is(
  (select body ->> 'title' from public.iterra_entities where key = 'margin:note:n1'),
  null, 'tombstone keeps only minimal identity and delete metadata'
);
select is(
  public.iterra_entity_put(
    'margin:note:n1', 'margin', 'note', null, 109,
    '{"key":"margin:note:n1","app":"margin","type":"note","id":"n1","courseId":null,"updatedAt":109,"title":"resurrect"}'::jsonb
  ), 'stale', 'put at or before tombstone cannot resurrect'
);
select is(
  public.iterra_entity_put(
    'margin:note:n1', 'margin', 'note', null, 111,
    '{"key":"margin:note:n1","app":"margin","type":"note","id":"n1","courseId":null,"updatedAt":111,"title":"newer"}'::jsonb
  ), 'applied', 'newer put can resurrect tombstone'
);
select is(
  public.iterra_entity_put(
    'margin:note:n1', 'margin', 'note', null, 111,
    '{"key":"margin:note:n1","app":"margin","type":"note","id":"n1","courseId":null,"updatedAt":111,"title":"equal-stamp candidate"}'::jsonb
  ), 'applied', 'equal-stamp candidate is accepted for hub canonical tie reconciliation'
);

select throws_ok(
  $$select public.iterra_entity_put(
    'other:note:n1', 'margin', 'note', null, 200,
    '{"key":"other:note:n1","app":"margin","type":"note","id":"n1","updatedAt":200}'::jsonb
  )$$,
  '22023', 'Invalid Iterra entity payload.', 'malformed key/body rejected'
);
select throws_ok(
  $$select public.iterra_entity_put(
    'margin:note:x', 'margin', 'note', null, 1,
    '{"key":"margin:note:x","app":"margin","type":"note","id":"x","updatedAt":1,"unexpected":true}'::jsonb
  )$$,
  '22023', 'Invalid Iterra entity payload.', 'noncanonical top-level fields rejected'
);
select throws_ok(
  $$insert into public.iterra_entities (user_id,key,app,type,"updatedAt",body)
    values ('11111111-1111-4111-8111-111111111111','x','x','x',1,'{}'::jsonb)$$,
  '42501', null, 'authenticated clients cannot bypass RPC with direct inserts'
);
select throws_ok(
  $$select public.iterra_entity_put(
    'margin:unknown:x', 'margin', 'unknown', null, 1,
    '{"key":"margin:unknown:x","app":"margin","type":"unknown","id":"x","updatedAt":1}'::jsonb
  )$$,
  '22023', 'Invalid Iterra entity payload.', 'unknown entity type rejected'
);
select throws_ok(
  $$select public.iterra_entity_put(
    'margin:note:' || repeat('x', 201), 'margin', 'note', null, 1,
    jsonb_build_object('key','margin:note:' || repeat('x',201),'app','margin','type','note','id',repeat('x',201),'updatedAt',1)
  )$$,
  '22023', 'Invalid Iterra entity payload.', 'id longer than hub limit rejected'
);
select throws_ok(
  $$select public.iterra_entity_put(
    'margin:note:' || repeat(chr(128512), 101), 'margin', 'note', null, 1,
    jsonb_build_object('key','margin:note:' || repeat(chr(128512),101),'app','margin','type','note','id',repeat(chr(128512),101),'updatedAt',1)
  )$$,
  '22023', 'Invalid Iterra entity payload.', 'unicode id length uses JavaScript UTF-16 units'
);
select throws_ok(
  $$select public.iterra_entity_put(
    'margin:note:x', 'margin', 'note', null, 1,
    '{"key":"margin:note:x","app":"margin","type":"note","id":"x","updatedAt":1,"title":42}'::jsonb
  )$$,
  '22023', 'Invalid Iterra entity payload.', 'optional display fields must be strings'
);
select throws_ok(
  $$select public.iterra_entity_put(
    'margin:note:x', 'margin', 'note', null, 1,
    jsonb_build_object('key','margin:note:x','app','margin','type','note','id','x','updatedAt',1,'data',repeat('x',65536))
  )$$,
  '22023', 'Invalid Iterra entity payload.', 'data above the hub 64 KB limit rejected'
);

-- Switching claims proves SELECT policy isolates owners, even though the
-- authenticated role can read the table for exact-owner reconciliation.
reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;
select is((select count(*)::integer from public.iterra_entities), 0,
  'another owner cannot read the first user entity');

-- Anonymous role has neither direct table access nor RPC execute permission.
reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.iterra_entities$$,
  '42501', null, 'anon cannot directly select synced rows'
);
select throws_ok(
  $$select public.iterra_entity_remove('margin:note:n1', 300)$$,
  '42501', null, 'anon cannot execute remove RPC'
);

-- The second owner can use the same canonical key, but its put/remove RPCs
-- operate only on the row derived from its own auth.uid().
reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;
select is((select count(*)::integer from public.iterra_entities), 0,
  'another owner cannot read the first user entity');
select is(
  public.iterra_entity_put(
    'margin:note:n1', 'margin', 'note', null, 200,
    '{"key":"margin:note:n1","app":"margin","type":"note","id":"n1","courseId":null,"updatedAt":200,"title":"second owner"}'::jsonb
  ), 'applied', 'second owner can create the same key in a separate row'
);
select is(public.iterra_entity_remove('margin:note:n1', 210), 'applied',
  'second owner remove applies to its own row');
select throws_ok(
  $$select public.iterra_entity_remove('margin:note:n1', 9007199254740992)$$,
  '22023', 'Invalid Iterra entity deletion.', 'delete stamp above JavaScript safe integer limit rejected'
);
select is((select count(*)::integer from public.iterra_entities), 1,
  'second owner sees only its own tombstone');
select is((select deleted from public.iterra_entities where key = 'margin:note:n1'), true,
  'second owner remove does not target the first owner row');

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select is((select deleted from public.iterra_entities where key = 'margin:note:n1'), false,
  'first owner row remains live after second owner removal');
select is((select body ->> 'title' from public.iterra_entities where key = 'margin:note:n1'),
  'equal-stamp candidate', 'first owner payload remains unchanged by second owner RPCs');

reset role;
delete from auth.users where id = '22222222-2222-4222-8222-222222222222';
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;
select is((select count(*)::integer from public.iterra_entities), 0,
  'deleting an auth user cascades deletion of its remote entities');

select * from finish();
rollback;
