-- Pricing seed DRAFT, from Saksham's sheets (2026-11-07):
--   "Detail Pricing Package_uk.pdf"       -> UK, GBP
--   "Full_Plans_Ireland_Schengen.pdf"     -> Ireland, EUR
-- RUN on the live database on 2026-11-08 (do not run again).
--
-- Notes:
-- * Prices are per person. The code multiplies the upfront sum by the number
--   of applicants, then the one payment is split equally between them.
-- * A pricing row is picked by application_country_id (UK = 5, Ireland = 7).
--   destination_country_id stays null, meaning "any destination".
-- * Every pack needs a row for BOTH countries. A pack with no pricing row for
--   the case's country can't be booked: step 2 returns 422 PRICE_NOT_SET.
-- * Until this script runs, the tables are empty, so EVERY step 2 request
--   returns PRICE_NOT_SET. Run it together with the code release.
-- * Always set upfront_price. It defaults to 0, so a missing value means a
--   0 deposit.
-- * min_price is NOT NULL but not used for the deposit; set to price until its
--   meaning is confirmed.
-- * Not handled here: "Standard not available for Switzerland, Netherlands,
--   Belgium and Germany" (a row with no destination matches every country).

begin;

-- Step 1: the new packs. price_gbp is the UK price (only used as a fallback).
insert into service_pack (name, description, price_gbp, active, created_by)
values
  ('Classic',  'Multi-entry, faster processing. Priority: High',  275.00, 1, 'pricing-seed'),
  ('Comfort',  'Compliant handled application. Priority: Normal', 125.00, 1, 'pricing-seed'),
  ('Standard', 'Self-managed application. Priority: Low',          75.00, 1, 'pricing-seed');

insert into add_on_pack (name, description, price_gbp, active, created_by)
values
  ('Refundable Upfront', 'Makes the upfront fee refundable',        25.00, 1, 'pricing-seed'),
  ('Priority Upgrade',   'Priority handling (included in Classic)', 50.00, 1, 'pricing-seed');

-- Step 2: pricing rows. currency_id 1 = GBP, 2 = EUR.
insert into service_pack_pricing
  (service_pack_id, application_country_id, currency_id, price, min_price, upfront_price, created_by)
values
  ((select service_pack_id from service_pack where name = 'Classic'  and discontinued_at is null), 5, 1, 275.00, 275.00, 90.00, 'pricing-seed'),
  ((select service_pack_id from service_pack where name = 'Comfort'  and discontinued_at is null), 5, 1, 125.00, 125.00, 40.00, 'pricing-seed'),
  ((select service_pack_id from service_pack where name = 'Standard' and discontinued_at is null), 5, 1,  75.00,  75.00, 40.00, 'pricing-seed'),
  ((select service_pack_id from service_pack where name = 'Classic'  and discontinued_at is null), 7, 2, 300.00, 300.00, 90.00, 'pricing-seed'),
  ((select service_pack_id from service_pack where name = 'Comfort'  and discontinued_at is null), 7, 2, 150.00, 150.00, 40.00, 'pricing-seed'),
  ((select service_pack_id from service_pack where name = 'Standard' and discontinued_at is null), 7, 2, 100.00, 100.00, 40.00, 'pricing-seed');

-- Add-ons: 10 upfront, the rest is paid with the balance fee (Saksham, 2026-11-08).
-- Refundable Upfront: any service pack (service_pack_id null).
insert into add_on_pack_pricing
  (add_on_pack_id, service_pack_id, application_country_id, currency_id, price, min_price, upfront_price, created_by)
values
  ((select add_on_pack_id from add_on_pack where name = 'Refundable Upfront' and discontinued_at is null), null, 5, 1, 25.00, 25.00, 10.00, 'pricing-seed'),
  ((select add_on_pack_id from add_on_pack where name = 'Refundable Upfront' and discontinued_at is null), null, 7, 2, 25.00, 25.00, 10.00, 'pricing-seed');

-- Priority Upgrade: only priced with Comfort and Standard. It is included in
-- Classic, so Classic + Priority Upgrade has no price and step 2 returns
-- 422 PRICE_NOT_SET.
insert into add_on_pack_pricing
  (add_on_pack_id, service_pack_id, application_country_id, currency_id, price, min_price, upfront_price, created_by)
values
  ((select add_on_pack_id from add_on_pack where name = 'Priority Upgrade' and discontinued_at is null),
   (select service_pack_id from service_pack where name = 'Comfort' and discontinued_at is null), 5, 1, 50.00, 50.00, 10.00, 'pricing-seed'),
  ((select add_on_pack_id from add_on_pack where name = 'Priority Upgrade' and discontinued_at is null),
   (select service_pack_id from service_pack where name = 'Standard' and discontinued_at is null), 5, 1, 50.00, 50.00, 10.00, 'pricing-seed'),
  ((select add_on_pack_id from add_on_pack where name = 'Priority Upgrade' and discontinued_at is null),
   (select service_pack_id from service_pack where name = 'Comfort' and discontinued_at is null), 7, 2, 50.00, 50.00, 10.00, 'pricing-seed'),
  ((select add_on_pack_id from add_on_pack where name = 'Priority Upgrade' and discontinued_at is null),
   (select service_pack_id from service_pack where name = 'Standard' and discontinued_at is null), 7, 2, 50.00, 50.00, 10.00, 'pricing-seed');

-- Step 3: retire the old packs (Saksham agreed, 2026-11-08). They have no
-- pricing rows, so if they stay active SPOCs still see them in the dropdown
-- and get PRICE_NOT_SET. Never delete them: existing cases still point at them.
update service_pack set active = 0, discontinued_at = now(), discontinued_by = 'pricing-seed'
  where service_pack_id in (1, 3, 5);
update add_on_pack set active = 0, discontinued_at = now(), discontinued_by = 'pricing-seed'
  where add_on_pack_id in (1, 3, 4, 5);

-- Check before commit: every active pack should have a UK and an Ireland row.
select sp.name, p.application_country_id, p.price, p.upfront_price
from service_pack sp
left join service_pack_pricing p on p.service_pack_id = sp.service_pack_id and p.is_active = 1
where sp.active = 1 and sp.discontinued_at is null
order by sp.name, p.application_country_id;

select ap.name, p.application_country_id, p.price, p.upfront_price
from add_on_pack ap
left join add_on_pack_pricing p on p.add_on_pack_id = ap.add_on_pack_id and p.is_active = 1
where ap.active = 1 and ap.discontinued_at is null
order by ap.name, p.application_country_id;

-- If the numbers look right: commit;  otherwise: rollback;
