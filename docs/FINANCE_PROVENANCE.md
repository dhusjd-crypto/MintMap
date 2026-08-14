# Finance Provenance

Statements and import batches retain source document identifiers. Confirmed
payment evidence keeps its FinanceCaptureProposal/CaptureItem link. Imported
transactions retain batch, external ID and reference metadata. This supports
duplicate detection and audit without copying raw document/OCR text into
Finance domain events.
