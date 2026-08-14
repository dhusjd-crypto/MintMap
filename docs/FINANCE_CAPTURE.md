# Finance Capture

Financial capture remains proposal-first. Images, screenshots and scanned PDFs
use local OCR; text PDFs use embedded text before the OCR fallback. The Capture
Inbox exposes **Finansta incele**, which opens a coherent source and proposal
review route. It never writes a Finance entity directly.

Financial documents stay in Capture until an application-level `FinanceCaptureProposal` is reviewed. Proposal fields contain independent confidence and source provenance. Confirmation creates a canonical statement, then links the CaptureItem/source document back to it; extraction never writes Finance truth.
