# CAMT Import

The practical CAMT adapter accepts statement entries containing `Ntry`, amount, `CdtDbtInd`, booking date and bank references. It supports the encountered `camt.052`/`camt.053` family signatures only. Unknown variants fail with `UNSUPPORTED_CAMT_VARIANT`; no partial money import is attempted.
