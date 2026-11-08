# Minimum deposit (Add New Case, step 2)

The SPOC's Add New Case wizard shows a minimum deposit on step 2. It comes from
`GET /minimum-deposit` and is calculated again on final submit, so the two match.

Code: `services/case.service.js` (`quoteDeposit`, `toQuoteLine`,
`summarizeQuote`, `forApplicants`).

## Current formula

For each pack the SPOC picked (service packs and add-ons):

1. Find today's pricing row in `service_pack_pricing` / `add_on_pack_pricing`
   (active, not discontinued, inside its valid dates). A row for the exact
   destination / application country (and, for add-ons, service pack) wins over
   a row where those are empty ("any").
2. The pack's deposit is that row's `upfront_price`.
3. If a pack has no row, step 2 (and final submit) returns
   422 `PRICE_NOT_SET` naming the unpriced packs. There is no fallback price.

Then:

```
deposit per application = sum of every pack's deposit
case minimum deposit    = deposit per application x number of applicants
```

All packs must be in one currency, otherwise the API returns
422 `MIXED_PRICING_CURRENCY`.

Example (UK): Comfort upfront 40 + Refundable Upfront 10, 2 applicants
= (40 + 10) x 2 = 100 GBP.

While both pricing tables are empty, every request returns `PRICE_NOT_SET`.

## Confirmed

By Vishwas (2026-11-06):

- The formula above is correct.
- The deposit uses `upfront_price` (not `min_price` or `non_negotiable_amt`).
- The deposit is paid once per case and split equally between the applicants
  (already done by `splitEqually` in `services/deposit.service.js`).
- Saksham provides the pricing data.

By Saksham's pricing sheets (2026-11-07):

- Prices are per person, so the case minimum is the upfront sum x number of
  applicants (what the code does).
- Packs: Classic, Comfort, Standard. Add-ons: Refundable Upfront, Priority
  Upgrade.

| Pack                        | UK (GBP) price / upfront | Ireland (EUR) price / upfront |
| --------------------------- | ------------------------ | ----------------------------- |
| Classic                     | 275 / 90                 | 300 / 90                      |
| Comfort                     | 125 / 40                 | 150 / 40                      |
| Standard                    | 75 / 40                  | 100 / 40                      |
| Refundable Upfront (add-on) | 25 / 10                  | 25 / 10                       |
| Priority Upgrade (add-on)   | 50 / 10                  | 50 / 10                       |

Load script: `docs/pricing-seed.sql` (run on the live database 2026-11-08).

Follow-up with Vishwas (2026-11-07):

- Use Saksham's prices: UK in GBP and Ireland in EUR, with different amounts.
  Pricing rows are set per `application_country_id` (UK = 5, Ireland = 7).
- A pack with no price must be an error, not a 50% guess (done in code).
- The application city rule (below) is out of scope for now.

Follow-up with Saksham (2026-11-08):

- Add-ons: 10 (GBP / EUR) upfront; the rest is paid with the balance fee.
- Retire the old packs (Premium Plan, Premium Visa Package, Premiums Visa
  Package and the old add-ons); only Classic, Comfort, Standard remain.
- Which pack is available for which country must be configurable in its own
  table, not hard-coded (e.g. "Standard not available for Switzerland,
  Netherlands, Belgium and Germany" from the UK sheet).

## Pack availability

Table `service_pack_country_restriction` (script: `docs/pack-restriction.sql`, run 2026-11-08,
). One row blocks a service pack for a destination country, optionally
only for one application country. No row means the pack is available. Step 2
and final submit return 422 `PACK_NOT_AVAILABLE` for a blocked pack.

Run the script before deploying the code; without the table every step 2
request fails.

## Still open

1. Switzerland and Belgium are not in the `country` table, so their Standard
   restriction rows can't be added yet.
2. The pack dropdown (lookup endpoint) still lists blocked packs; the error
   only appears at step 2.
3. While the application city rule (below) stays, a UK case can't have
   Germany as its destination, so the UK restriction can't trigger yet.

## Separate issue: application city rule

`getApplicationCountryId` rejects a case whose application city is not in the
destination country. A Schengen visa from the UK (destination Germany, city
London) is rejected with 400. Added in `e91ee6d` with no spec reference.
Parked by Vishwas (2026-11-07); not changed.

## Loading data

Run in this order, after reading each script's notes:

1. `docs/pricing-seed.sql`
2. `docs/pack-restriction.sql`

Then deploy the code.
