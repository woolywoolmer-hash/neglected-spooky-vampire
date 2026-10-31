-- Shared PostgreSQL schema. JSON documents preserve a stable application contract;
-- typed checks, triggers and RPCs enforce the scheduling invariants server-side.
create table if not exists facilities(id text primary key, data jsonb not null);
create table if not exists rates(id text primary key, data jsonb not null);
create table if not exists customers(id text primary key, data jsonb not null);
create table if not exists bookings(id text primary key, data jsonb not null);
create table if not exists closures(id text primary key, data jsonb not null);
create table if not exists audit(id text primary key, data jsonb not null);
create table if not exists schedule_guard(id integer primary key check(id=1), version bigint not null default 0);
insert into schedule_guard(id) values(1) on conflict do nothing;
create index if not exists booking_facility on bookings((data->>'facilityId'));
create index if not exists booking_series on bookings((data->>'seriesId'));
create unique index if not exists one_tariff_per_facility on rates((data->>'facilityId')) where data->>'facilityId' is not null;
create index if not exists customer_organisation on customers((data->>'organisation'));

create or replace function app_role() returns text language sql stable as $$ select coalesce(nullif(current_setting('app.actor_role',true),''),'readonly') $$;
create or replace function app_actor() returns text language sql stable as $$ select coalesce(nullif(current_setting('app.actor_name',true),''),'Unknown') $$;
create or replace function app_resources_conflict(a text,b text) returns boolean language sql stable as $$
 with recursive ancestors(origin,id,parent_id,seen) as (
  select id,id,data->>'parentId',array[id] from facilities where id in (a,b)
  union all
  select an.origin,f.id,f.data->>'parentId',an.seen||f.id from ancestors an join facilities f on f.id=an.parent_id where not f.id=any(an.seen)
 )
 select a=b or (a='astro-full' and b in ('astro-a','astro-b')) or (b='astro-full' and a in ('astro-a','astro-b')) or exists(select 1 from ancestors where (origin=a and id=b) or (origin=b and id=a))
$$;
create or replace function app_reserved_start(d jsonb) returns timestamptz language sql immutable as $$ select (d->>'start')::timestamptz-make_interval(mins=>coalesce((d->>'bufferBefore')::integer,0)) $$;
create or replace function app_reserved_end(d jsonb) returns timestamptz language sql immutable as $$ select (d->>'end')::timestamptz+make_interval(mins=>coalesce((d->>'bufferAfter')::integer,0)) $$;

create or replace function app_validate_schedule() returns trigger language plpgsql as $$
declare d jsonb; old_d jsonb; res text; is_override boolean; conflicts integer; f jsonb; r jsonb; c jsonb; factor numeric;
begin
 -- One row serializes writes across resources, preventing concurrent Astro races.
 update schedule_guard set version=version+1 where id=1;
 d:=new.data; res:=d->>'facilityId';
 if new.id is null or new.id='' or d->>'id' is distinct from new.id then raise exception 'Invalid record ID'; end if;
 select data into f from facilities where id=res;
 if f is null then raise exception 'Unknown facility'; end if;
 if (d->>'start') is null or (d->>'end') is null or not isfinite((d->>'start')::timestamptz) or not isfinite((d->>'end')::timestamptz) or (d->>'end')::timestamptz <= (d->>'start')::timestamptz then raise exception 'End must follow start'; end if;
 if extract(second from (d->>'start')::timestamptz)<>0 or extract(second from (d->>'end')::timestamptz)<>0 or extract(minute from (d->>'start')::timestamptz)::integer%5<>0 or extract(minute from (d->>'end')::timestamptz)::integer%5<>0 then raise exception 'Use five-minute time increments'; end if;
 if tg_table_name='closures' then
  if app_role()<>'administrator' then raise exception 'Administrator role required for closures'; end if;
  select count(*) into conflicts from bookings b where b.data->>'status' not in ('Cancelled','Enquiry') and app_resources_conflict(res,b.data->>'facilityId') and app_reserved_start(b.data)<(d->>'end')::timestamptz and app_reserved_end(b.data)>(d->>'start')::timestamptz;
  if conflicts>0 then raise exception 'Closure conflicts with existing bookings; move or cancel those bookings first'; end if;
  new.data:=d||jsonb_build_object('createdBy',app_actor());
  return new;
 end if;
 if app_role() not in ('administrator','manager','staff') then raise exception 'You do not have permission to manage bookings'; end if;
 if app_role()='staff' then
  if coalesce(d->>'type','')<>'School' or coalesce(d->>'status','') not in ('Awaiting Approval','Cancelled') then raise exception 'School staff may request internal bookings only'; end if;
  if tg_op='UPDATE' and old.data->>'createdById' is distinct from current_setting('app.actor_id',true) then raise exception 'Staff may edit only their own requests'; end if;
 end if;
 if coalesce(d->>'status','') not in ('Enquiry','Provisional','Awaiting Approval','Confirmed','Cancelled','Completed') or coalesce(d->>'type','') not in ('School','Sports Centre','External Hirer','Complimentary','Maintenance') or coalesce(d->>'paymentStatus','') not in ('Unpaid','Part paid','Paid','Not required') then raise exception 'Invalid booking classification'; end if;
 if coalesce(d->>'title','')='' then raise exception 'Booking purpose is required'; end if;
 if coalesce((d->>'attendees')::integer,-1)<0 or coalesce((d->>'total')::numeric,-1)<0 or coalesce((d->>'exVat')::numeric,-1)<0 or coalesce((d->>'vat')::numeric,-1)<0 then raise exception 'Attendees and charges cannot be negative'; end if;
 if coalesce((d->>'bufferBefore')::integer,-1)<0 or coalesce((d->>'bufferAfter')::integer,-1)<0 or coalesce((d->>'accessBefore')::integer,-1)<0 or coalesce((d->>'accessAfter')::integer,-1)<0 then raise exception 'Buffer and access minutes must be nonnegative'; end if;
 if d->>'status'='Cancelled' and coalesce(d->>'cancellationReason','')='' then raise exception 'A cancellation reason is required'; end if;
 is_override:=coalesce((d->>'conflictOverride')::boolean,false);
 if is_override and (app_role()<>'administrator' or coalesce(d->>'overrideReason','')='') then raise exception 'Conflict override requires administrator and reason'; end if;
 if coalesce((d->>'priceOverride')::boolean,false) and (app_role()<>'administrator' or coalesce(d->>'overrideReason','')='') then raise exception 'Price override requires administrator and reason'; end if;
 if tg_op='UPDATE' then old_d:=old.data; end if;
 -- Facility reservation/access windows and ordinary prices are authoritative.
 -- Existing prices remain snapshots unless the booking's commercial terms change.
 if old_d is null or old_d->>'facilityId' is distinct from d->>'facilityId' then
  d:=d||jsonb_build_object('bufferBefore',(f->>'bufferBefore')::integer,'bufferAfter',(f->>'bufferAfter')::integer,'accessBefore',(f->>'accessBefore')::integer,'accessAfter',(f->>'accessAfter')::integer);
 else
  d:=d||jsonb_build_object('bufferBefore',(old_d->>'bufferBefore')::integer,'bufferAfter',(old_d->>'bufferAfter')::integer,'accessBefore',(old_d->>'accessBefore')::integer,'accessAfter',(old_d->>'accessAfter')::integer);
 end if;
 if not coalesce((d->>'priceOverride')::boolean,false) then
  if old_d is null or old_d->>'start' is distinct from d->>'start' or old_d->>'end' is distinct from d->>'end' or old_d->>'facilityId' is distinct from d->>'facilityId' or old_d->>'customerId' is distinct from d->>'customerId' or old_d->>'type' is distinct from d->>'type' then
   select data into r from rates where data->>'facilityId'=res order by id limit 1;
   if r is null and d->>'type' not in ('School','Complimentary','Maintenance') then raise exception 'No tariff is configured for this facility. An administrator must supply an explicit price override.'; end if;
   if d->>'customerId' is not null and d->>'customerId'<>'' then
    select data into c from customers where id=d->>'customerId';
    if c is null then raise exception 'Unknown customer'; end if;
   end if;
   factor:=extract(epoch from ((d->>'end')::timestamptz-(d->>'start')::timestamptz))/3600.0*(1-coalesce((c->>'discount')::numeric,0)/100.0);
   if d->>'type' in ('School','Complimentary','Maintenance') then factor:=0; end if;
   d:=d||jsonb_build_object('exVat',round(coalesce((r->>'exVat')::numeric,0)*factor),'vat',round(coalesce((r->>'vat')::numeric,0)*factor),'total',round(coalesce((r->>'total')::numeric,0)*factor));
  else
   d:=d||jsonb_build_object('exVat',(old_d->>'exVat')::numeric,'vat',(old_d->>'vat')::numeric,'total',(old_d->>'total')::numeric);
  end if;
 end if;
 if not coalesce((f->>'active')::boolean,true) and d->>'status' not in ('Cancelled','Completed') then raise exception 'Facility is inactive'; end if;
 if d->>'status' not in ('Cancelled','Enquiry') and not is_override then
  select count(*) into conflicts from bookings b where b.id<>new.id and b.data->>'status' not in ('Cancelled','Enquiry') and app_resources_conflict(res,b.data->>'facilityId') and app_reserved_start(b.data)<app_reserved_end(d) and app_reserved_end(b.data)>app_reserved_start(d);
  if conflicts>0 then raise exception 'Booking conflict: facility is already reserved during this period'; end if;
  select count(*) into conflicts from closures c where app_resources_conflict(res,c.data->>'facilityId') and (c.data->>'start')::timestamptz<app_reserved_end(d) and (c.data->>'end')::timestamptz>app_reserved_start(d);
  if conflicts>0 then raise exception 'Booking conflict: facility is closed during this period'; end if;
 end if;
 new.data:=d||jsonb_build_object('createdBy',coalesce(old_d->>'createdBy',app_actor()),'createdById',coalesce(old_d->>'createdById',current_setting('app.actor_id',true)),'createdAt',coalesce(old_d->>'createdAt',now()::text),'modifiedBy',app_actor(),'modifiedAt',now()::text);
 return new;
end $$;
drop trigger if exists validate_booking on bookings;
create trigger validate_booking before insert or update on bookings for each row execute function app_validate_schedule();
drop trigger if exists validate_closure on closures;
create trigger validate_closure before insert or update on closures for each row execute function app_validate_schedule();

create or replace function app_audit_change() returns trigger language plpgsql as $$
declare audit_id text; d jsonb; old_d jsonb;
begin
 if tg_op<>'DELETE' then d:=new.data; end if;
 if tg_op<>'INSERT' then old_d:=old.data; end if;
 audit_id:=md5(random()::text||clock_timestamp()::text);
 insert into audit(id,data) values(audit_id,jsonb_build_object('id',audit_id,'entity',tg_table_name,'entityId',coalesce(new.id,old.id),'action',tg_op,'actor',app_actor(),'at',now(),'oldValue',old_d,'newValue',d,'reason',coalesce(nullif(d->>'cancellationReason',''),nullif(d->>'overrideReason',''),d->>'reason','')));
 return coalesce(new,old);
end $$;
drop trigger if exists audit_booking on bookings;
create trigger audit_booking after insert or update or delete on bookings for each row execute function app_audit_change();
drop trigger if exists audit_customer on customers;
create trigger audit_customer after insert or update or delete on customers for each row execute function app_audit_change();
drop trigger if exists audit_rate on rates;
create trigger audit_rate after insert or update or delete on rates for each row execute function app_audit_change();
drop trigger if exists audit_facility on facilities;
create trigger audit_facility after insert or update or delete on facilities for each row execute function app_audit_change();
drop trigger if exists audit_closure on closures;
create trigger audit_closure after insert or update or delete on closures for each row execute function app_audit_change();

create or replace function app_apply(operation text,payload jsonb) returns jsonb language plpgsql as $$
declare item jsonb; ids jsonb:='[]'; role_name text:=app_role(); result jsonb; current_booking jsonb;
begin
 if operation='save-bookings' then
  update schedule_guard set version=version+1 where id=1;
  if role_name not in ('administrator','manager','staff') then raise exception 'Booking management permission required'; end if;
  if coalesce(jsonb_typeof(payload->'bookings'),'')<>'array' then raise exception 'Bookings array is required'; end if;
  if jsonb_array_length(payload->'bookings') not between 1 and 366 then raise exception 'Provide 1 to 366 occurrences'; end if;
  for item in select value from jsonb_array_elements(payload->'bookings') loop
   select data into current_booking from bookings where id=item->>'id';
   if current_booking is not null and payload ? 'expectedModifiedAt' and (payload->'expectedModifiedAt'->>(item->>'id')) is distinct from current_booking->>'modifiedAt' then raise exception 'Booking was modified by someone else. Refresh and try again.'; end if;
   insert into bookings(id,data) values(item->>'id',item) on conflict(id) do update set data=excluded.data;
   ids:=ids||jsonb_build_array(item->>'id');
  end loop;
  return ids;
 elsif operation='save-customer' then
  if role_name not in ('administrator','manager') then raise exception 'Customer management permission required'; end if;
  if coalesce(payload->>'organisation','')='' or coalesce((payload->>'discount')::numeric,-1) not between 0 and 100 then raise exception 'Organisation and valid discount are required'; end if;
  insert into customers(id,data) values(payload->>'id',payload) on conflict(id) do update set data=excluded.data;
 elsif operation='save-rate' then
  if role_name<>'administrator' then raise exception 'Administrator role required'; end if;
  if coalesce(payload->>'name','')='' then raise exception 'Rate name is required'; end if;
  if payload->>'facilityId' is not null and not exists(select 1 from facilities where id=payload->>'facilityId') then raise exception 'Unknown rate facility'; end if;
  if payload->>'facilityId' is not null and exists(select 1 from rates where id<>payload->>'id' and data->>'facilityId'=payload->>'facilityId') then raise exception 'A tariff already exists for this facility'; end if;
  if coalesce((payload->>'total')::numeric,-1)<0 or coalesce((payload->>'exVat')::numeric,-1)<0 or coalesce((payload->>'vat')::numeric,-1)<0 then raise exception 'Rates cannot be negative'; end if;
  insert into rates(id,data) values(payload->>'id',payload) on conflict(id) do update set data=excluded.data;
 elsif operation='save-facility' then
  update schedule_guard set version=version+1 where id=1;
  if role_name<>'administrator' then raise exception 'Administrator role required'; end if;
  if coalesce(payload->>'name','')='' or coalesce((payload->>'bufferBefore')::integer,-1)<0 or coalesce((payload->>'bufferAfter')::integer,-1)<0 or coalesce((payload->>'accessBefore')::integer,-1)<0 or coalesce((payload->>'accessAfter')::integer,-1)<0 then raise exception 'Facility name and nonnegative timing settings required'; end if;
  if payload->>'parentId' is not null then
   if payload->>'parentId'=payload->>'id' or not exists(select 1 from facilities where id=payload->>'parentId') then raise exception 'Choose a valid parent facility'; end if;
   if exists(with recursive ancestors(id,parent_id,seen) as (
    select id,data->>'parentId',array[id] from facilities where id=payload->>'parentId'
    union all select f.id,f.data->>'parentId',a.seen||f.id from ancestors a join facilities f on f.id=a.parent_id where not f.id=any(a.seen)
   ) select 1 from ancestors where id=payload->>'id') then raise exception 'Facility hierarchy cannot contain a cycle'; end if;
  end if;
  if exists(select 1 from facilities where id=payload->>'id' and data->>'parentId' is distinct from payload->>'parentId') and (
   exists(select 1 from bookings b where b.data->>'status' not in ('Cancelled','Enquiry') and (b.data->>'end')::timestamptz>now() and (app_resources_conflict(payload->>'id',b.data->>'facilityId') or app_resources_conflict(payload->>'parentId',b.data->>'facilityId')))
   or exists(select 1 from closures c where (c.data->>'end')::timestamptz>now() and (app_resources_conflict(payload->>'id',c.data->>'facilityId') or app_resources_conflict(payload->>'parentId',c.data->>'facilityId')))
  ) then raise exception 'Move or cancel upcoming bookings and closures before changing the facility hierarchy'; end if;
    insert into facilities(id,data) values(payload->>'id',payload) on conflict(id) do update set data=excluded.data;
 elsif operation='save-closure' then
  insert into closures(id,data) values(payload->>'id',payload) on conflict(id) do update set data=excluded.data;
 elsif operation='delete-closure' then
  if role_name<>'administrator' then raise exception 'Administrator role required'; end if;
  update schedule_guard set version=version+1 where id=1;
  delete from closures where id=payload->>'id';
 else raise exception 'Unknown operation'; end if;
 return payload;
end $$;

create or replace function app_snapshot() returns jsonb language sql stable as $$
 select jsonb_build_object(
 'facilities',coalesce((select jsonb_agg(data order by data->>'name') from facilities),'[]'),
 'rates',coalesce((select jsonb_agg(data order by data->>'name') from rates),'[]'),
 'customers',case when app_role() in ('administrator','manager') then coalesce((select jsonb_agg(data order by data->>'organisation') from customers),'[]') else '[]'::jsonb end,
 'bookings',coalesce((select jsonb_agg(case when app_role() in ('administrator','manager') or (app_role()='staff' and data->>'createdById'=current_setting('app.actor_id',true)) then data else data||jsonb_build_object('telephone','','email','','contactName','','notes','','accessRequirements','','accessCode','') end order by data->>'start') from bookings),'[]'),
 'closures',coalesce((select jsonb_agg(data order by data->>'start') from closures),'[]'),
 'audit',case when app_role() in ('administrator','manager') then coalesce((select jsonb_agg(a.data order by a.data->>'at' desc) from (select data from audit order by data->>'at' desc limit 500) a),'[]') else '[]'::jsonb end)
$$;
