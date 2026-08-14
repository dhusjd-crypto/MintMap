# Smart View Registry

The stable identifiers are `now`, `top-3`, `today`, `week`, `waiting`,
`follow-up`, `stale`, `deadline-risk`, `blocked`, `blocking`, `quick-wins`,
`office`, `phone`, `outside`, `low-energy`, `deep-work`, `someday`, and
`completed`.

Definitions live in `src/application/smart-views/index.ts`. Each definition owns
only label, description and presentation sort policy. Domain eligibility,
Trigger scoring, staleness and dependency semantics remain in their existing
Execution/Trigger selectors.
