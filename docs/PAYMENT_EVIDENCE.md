# Payment Evidence

Payment receipts are evidence, not payment truth. The match engine uses exact reference, amount, currency and date proximity to suggest payment candidates. Even an exact candidate requires explicit confirmation through the Finance application command; an image/PDF never changes a payment to `CONFIRMED` automatically. Reusing the same document/reference must be guarded by proposal metadata before confirmation.
