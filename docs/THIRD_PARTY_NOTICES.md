# Third-Party Notices

## Local OCR

- `tesseract.js` 7.0.0 — Apache-2.0. Used only through a lazily loaded browser
  worker to turn a user-selected image or scanned PDF page into temporary
  extracted text.
- `tesseract.js-core` 7.0.0 — Apache-2.0. Bundled browser worker/core assets
  under `public/ocr` for local execution.
- `@tesseract.js-data/tur` 1.0.0 — MIT. Turkish trained-data asset bundled
  under `public/ocr/lang`.
- `@tesseract.js-data/eng` 1.0.0 — MIT. English trained-data asset bundled
  under `public/ocr/lang`.

The OCR dependency is not used by the Finance domain. OCR output is a
reviewable Capture/Finance proposal and cannot authoritatively create or change
financial records.
