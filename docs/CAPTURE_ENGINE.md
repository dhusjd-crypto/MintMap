# Capture Engine

Capture is the ingestion boundary of MintMap. `CaptureItem` stores provenance and `CaptureProposal` stores a deterministic interpretation. Neither is a Task. Only the capture application service may confirm a proposal through `CreateTaskCommand`.

The initial sources are text, clipboard, voice transcript, image, screenshot, PDF and generic document. AI, OCR, Calendar and Finance extraction are intentionally outside Phase 11.
