# Finance OCR Browser Validation

## Environment

- Date: 2026-08-14
- Application: `http://127.0.0.1:5173`
- Browser: locally installed Google Chrome, launched by `playwright-core`
- Command: `npm run test:e2e:finance-capture`
- Test profile: isolated Chromium profile with only sanitized, generated fixtures

The former generic E2E launcher depends on `python3`. This focused Finance
validation runner is Node-based and launches the existing Chrome executable
directly, so Python is neither installed nor required.

## Fixtures

`tests/e2e/fixtures/generate_finance_ocr_fixtures.mjs` generates local,
sanitized fixtures at runtime:

- statement screenshot PNG
- scanned/image-only statement PDF
- selectable-text statement PDF
- payment receipt PNG

Generated binary fixtures are ignored by Git.

## Observed Results

| Scenario | Result | Evidence |
| --- | --- | --- |
| Image statement | PASS | Local Tesseract worker ran, produced an `OCR_IMAGE` proposal, editable fields, explicit statement confirmation, and persisted source link. |
| Scanned PDF | PASS | Embedded text was insufficient; `pdfjs-dist` rendered the page and local OCR persisted method `OCR_PDF`. No statement existed before explicit confirmation. |
| Embedded-text PDF | PASS | `EMBEDDED_PDF_TEXT` was stored; the OCR worker was not needed. |
| Payment receipt | PASS | Exact amount/currency/date/reference match reasons were shown. User confirmation changed the selected payment to `CONFIRMED`, made the obligation `PAID`, and reused the existing Bank-to-Card transfer without creating an extra expense or transfer. A second confirmation was idempotently rejected. |

## Network, Console And Persistence

- OCR worker, WASM core, and Turkish/English language assets resolved from local
  application paths under `/ocr`; no external OCR/CDN request was observed.
- No browser console, page, PDF worker, Tesseract worker, IndexedDB, or Blob
  serialization error was observed in the completed run.
- Capture document Blob content survived refresh. A real-browser canonical
  backup was created and validated; the backup contained
  `capture_document_content` and its checksum validation passed.
- Finance Review was checked at `390 x 844`; the review form, source area, and
  confirmation actions remained reachable without blocking horizontal overflow.

## Regression Scope

The focused runner also protects Capture-to-Finance provenance, proposal
editing, duplicate statement protection, payment-confirmation idempotency, and
credit-card transfer semantics. Unit regressions continue to cover CSV, OFX,
QFX, QIF, supported CAMT, transaction matching, reconciliation, and Finance
trigger behavior.

## Known Limitations

- OCR remains best-effort. Low quality, unsupported, or overly large documents
  remain in review with warnings; OCR never becomes canonical Finance truth.
- PDF OCR is bounded by existing page and resource limits.
- CAMT support remains intentionally partial; unsupported variants fail safely.
- Browser notifications cannot guarantee delivery while the browser is closed.
