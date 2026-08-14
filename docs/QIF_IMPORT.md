# QIF Import

QIF V1 maps date, amount, payee, memo, category and reference into the shared import proposal contract. QIF does not have a dependable universal transaction ID, so all rows carry `WEAK_EXTERNAL_ID` and matching remains conservative.
