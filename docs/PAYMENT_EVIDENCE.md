# Payment Evidence

Payment receipts are evidence, not payment truth. Local OCR/PDF text extraction
creates a `PAYMENT_CONFIRMATION` proposal. The match engine exposes reference,
amount, currency, and date reasons for candidate payments. An explicit
`confirmPaymentEvidence` application command transitions a scheduled payment to
submitted and then confirmed only when it already has a canonical ledger
movement. It links the evidence to that payment and CaptureItem.

An exact candidate is still not automatic confirmation. Replaying the same
confirmed proposal is rejected, so it cannot duplicate a confirmed amount,
transfer, or expense. Card payments prefer an existing Bank-to-Card transfer;
the receipt never creates a second expense.
