-- Service pack country restrictions (Saksham, 2026-11-08).
-- RUN on the live database on 2026-11-08 (do not run again). It had to run before deploying the code that reads the table:
-- without the table, every step 2 / create-full request fails.
--
-- One row = this service pack can NOT be booked for this destination.
-- application_country_id null = the rule applies to every application country.
-- No row = the pack is available.

begin;

create table service_pack_country_restriction (
  restriction_id         bigserial primary key,
  service_pack_id        integer not null references service_pack(service_pack_id),
  application_country_id integer references country(country_id),
  destination_country_id integer not null references country(country_id),
  is_active              smallint not null default 1,
  created_by             varchar not null,
  creation_timestamp     timestamptz not null default now(),
  updated_by             varchar,
  updation_timestamp     timestamptz,
  discontinued_by        varchar,
  discontinued_at        timestamptz
);

-- UK sheet: Standard is not available for Switzerland, Netherlands, Belgium
-- and Germany. Run after pricing-seed.sql (the Standard pack must exist).
-- country_id 5 = United Kingdom, 8 = Germany, 16 = Netherlands.
insert into service_pack_country_restriction
  (service_pack_id, application_country_id, destination_country_id, created_by)
values
  ((select service_pack_id from service_pack where name = 'Standard' and discontinued_at is null), 5, 8,  'pack-restriction'),
  ((select service_pack_id from service_pack where name = 'Standard' and discontinued_at is null), 5, 16, 'pack-restriction');

-- Belgium and Switzerland are not in the country table yet. Add them to
-- country first, then add a row for each here the same way.

select r.restriction_id, sp.name as pack, ac.name as application_country, dc.name as destination
from service_pack_country_restriction r
join service_pack sp on sp.service_pack_id = r.service_pack_id
left join country ac on ac.country_id = r.application_country_id
join country dc on dc.country_id = r.destination_country_id;

-- If the rows look right: commit;  otherwise: rollback;
