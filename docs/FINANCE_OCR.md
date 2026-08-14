# Finance OCR

The browser-local OCR adapter is intentionally not enabled because the application has no audited local OCR dependency. `imageOcrCapability()` reports this explicitly. Financial screenshots can still be captured and reviewed manually. A future OCR provider must return an extracted-text proposal only and must not import Finance persistence or confirm financial records.
