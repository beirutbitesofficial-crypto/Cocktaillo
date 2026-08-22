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

## First boot and users
- Existing users and credentials are preserved during upgrades.
- A fresh local development data file starts with the `manager` account only.
- Cashier and waiter accounts should be created from the Manager users screen.
- Before a fresh production boot, configure a strong initial Manager password through the deployment environment.

## Production safety
- Set a strong `POS_SESSION_SECRET` in the deployment environment.
- Keep `POS_DATA_FILE` on persistent storage.
- Do not run separate deployments against separate copies of the JSON data file; all POS processes must share the same persistent data file.
- Automatic daily snapshots are stored beside the configured data file in the `backups` directory.

## Deploy
Node.js 22, Next.js. Build with `npm install && npm run build`, start with `npm start`.
Health check: `/api/health`.
