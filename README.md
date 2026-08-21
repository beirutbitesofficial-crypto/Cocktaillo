# Cocktaillo POS

Clean professional resto-cafe POS rebuild.

## Roles
- **Waiter:** table ordering only; no payments or management modules.
- **Cashier:** counter orders, tables settlement, and shift management.
- **Manager:** dashboard, counter, tables, shifts, inventory, expenses, reports, users, menu, settings, Bar and Kitchen boards.

## Order flows
- Table service: waiter opens a table check and sends incremental Arabic production tickets.
- Takeaway / Delivery / Self Service: cashier counter flow with payment before completion.
- Bar and Kitchen tickets are separate by production station.
- Desserts and drinks default to Bar; future food can route to Kitchen.
- Customer receipts are separate from production tickets.

## Currency
USD item prices + LBP add-ons are supported, with mixed USD/LBP settlement using the configured exchange rate.

## Local credentials for first boot
- manager / 2300
- cashier / 1234
- waiter / 12345678

Change production credentials and set `POS_SESSION_SECRET` before final handover.

## Deploy
Node.js 22, Next.js. Build with `npm install && npm run build`, start with `npm start`.
Health check: `/api/health`.
