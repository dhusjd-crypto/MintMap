# OFX and QFX Import

OFX SGML/XML-style transaction blocks and QFX files using the same structure normalize into `ImportRowProposal`. FITID is preserved as the external ID and is the strongest duplicate signal. The implementation is intentionally limited to transaction date, amount, name/memo, check/reference and FITID; unsupported malformed files fail explicitly.
