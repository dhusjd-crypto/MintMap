# Finance Payment Reminders

Effective due-stage delivery is deduplicated per obligation: overdue, today, tomorrow, three-day and seven-day stages cannot stack as active alerts. Scheduled or submitted payments are not payment proof; only `CONFIRMED` payments reduce outstanding amount and resolve reminders.

FIN-T10 highlights payments that passed their scheduled confirmation grace period. Fully paid and cancelled obligations suppress normal payment alerts.
