# Cashflow Model V1

Forecast horizons are 7, 14, 30 and 90 days. BASE includes COMMITTED and EXPECTED
items, COMMITTED_ONLY excludes uncertain inputs, and INCLUDE_ESTIMATED also adds
ESTIMATED inputs. OPTIONAL items are excluded. Date-only records are evaluated at
day granularity and never receive invented intraday cutoffs. Currencies are never
combined without FX.
