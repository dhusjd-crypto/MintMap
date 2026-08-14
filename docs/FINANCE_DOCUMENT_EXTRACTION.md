# Finance Document Extraction

Finance document extraction is proposal-only. The adapter uses embedded PDF text through `pdfjs-dist` first, then a local browser OCR fallback for text-poor scanned PDFs. Images and screenshots use the same local OCR worker. Extracted text is passed to one deterministic label-first statement interpreter; it never writes a statement, payment, account, or transaction. The user confirms edited critical fields through the Finance application boundary.

Local OCR is supplied by a lazily loaded `tesseract.js` worker with application-bundled Turkish and English assets. There is no cloud fallback. A text-poor PDF whose bounded OCR cannot return usable text remains review-required with an explicit warning rather than fabricated values.

Limits: PDFs above 12 MB or 20 pages are not extracted automatically. Raw OCR/text is not emitted in domain events or notifications.
