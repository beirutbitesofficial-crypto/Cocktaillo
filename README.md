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
- Before a fresh production boot, set `POS_INITIAL_MANAGER_PASSWORD` to a strong password (minimum 8 characters).

## Production safety
- Set `POS_SESSION_SECRET` to at least 32 characters in the deployment environment. If it is missing or weak, the server uses a secure temporary secret and sessions reset after a restart.
- Keep `POS_DATA_FILE` on persistent storage.
- Do not run separate deployments against separate copies of the JSON data file; all POS processes must share the same persistent data file.
- Automatic daily snapshots are stored beside the configured data file in the `backups` directory.

## Deploy
Node.js 22, Next.js. Build with `npm install && npm run build`, start with `npm start`.
Health check: `/api/health`.

## Printing

Printing is centralized on the Windows cashier computer through the bundled Cocktaillo Print Agent; QZ Tray is not required. Waiter phones create persistent Bar print jobs that the cashier computer sends to the Bar printer. Paid customer receipts go to the separate Customer printer. Kitchen print jobs remain disabled for now. See print-agent/README.md for installation and pairing.
