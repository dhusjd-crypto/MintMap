# Finance Document Extraction

Finance document extraction is proposal-only. The current adapter first uses embedded PDF text through `pdfjs-dist`, then runs a deterministic label-first statement interpreter. It never writes a statement, payment, account, or transaction. The user confirms edited critical fields through the Finance application boundary.

Image and screenshot OCR has an explicit capability contract, but is currently `PARTIAL`: no local OCR engine is bundled. This avoids sending sensitive financial images to a network service by default. A text-poor PDF remains review-required with an explicit warning rather than fabricated values.

Limits: PDFs above 12 MB or 20 pages are not extracted automatically. Raw OCR/text is not emitted in domain events or notifications.
