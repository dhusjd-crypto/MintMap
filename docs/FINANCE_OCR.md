# Finance OCR

Finance review uses `tesseract.js@7.0.0` locally in a lazily created browser
worker. Its core and Turkish/English language data are bundled under
`/public/ocr`; the runtime does not download them from a CDN or send source
documents to a cloud OCR service. The engine supports PNG, JPEG, and WEBP up to
10 MiB. OCR runs only after the user starts financial review and is deduplicated
per document while in progress.

Images produce `ExtractedDocumentText` with `OCR_IMAGE`; they never become
Finance truth. PDF review first reads embedded text. When that text is too short
or lacks financial labels, it rasterizes at most the first three pages (within a
12 MiB / 20-page document bound) and runs the same local OCR path, recorded as
`OCR_PDF`. Oversized files return a bounded review warning instead of blocking
the UI.

OCR confidence is distinct from Finance field confidence. The deterministic
label interpreter may propose a value, but account, currency, statement date,
due date, balance, and minimum payment still require explicit user review. Raw
OCR text is not emitted in domain events, notifications, or application logs.
