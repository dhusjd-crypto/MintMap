# Command Center V2

Command Center V2 adds a dedicated composition query at
`src/application/command-center-v2.ts`. It composes canonical Execution NOW,
Top 3, quick wins, deadline/follow-up signals and Finance Trigger alerts. It
caps important signals at four and removes a Finance alert from the current
signal list when the same FinancialObligation is already represented by a linked
Execution task.

It does not calculate TriggerScore, Planner capacity, payment status or
cashflow. Finance alert titles and details are supplied by the Finance Trigger
application, so its privacy policy remains authoritative.
