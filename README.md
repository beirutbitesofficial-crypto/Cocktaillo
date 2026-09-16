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

Printing is centralized on the Windows cashier computer through the bundled Cocktaillo Print Agent; QZ Tray is not required. Waiter phones create separate persistent production jobs: Bar lines go only to the Bar printer, while Hookah lines go only to the HOOKAH printer as Arabic tickets. Paid customer receipts print silently and automatically on the separate Customer printer, with no receipt modal or browser print dialog. Kitchen print jobs remain disabled for now. See print-agent/README.md for installation and pairing.

## September POS reliability update

- Shift reconciliation subtracts returned change, records the chosen USD/LBP change currency, and applies refunds to the shift in which they are paid out. New transactions carry cashier and shift IDs. Older receipts without a recorded change currency use USD, matching the original checkout's USD change display; historical counted drawer balances cannot be reconstructed when staff returned a different currency.
- Each order submission has a stable request ID. Retrying it returns the saved order without adding lines or production tickets. Independent waiter submissions keep separate tickets even on the same table.
- Printer jobs use exclusive claims and heartbeats. The cashier worker drains queued orders in bursts; completed jobs cannot be downgraded by a late failure response.
- Waiter order responses and panels omit order prices/totals. Drafts stay separate for each table while the screen is open. Arabic item/category labels, quantity controls, notes and send confirmation simplify mobile ordering.
- Production tickets show the Arabic category beneath each item. The visible label is Shisha / شيشة; existing `hookah` routing keys and Windows printer mappings stay compatible.

Rollout: deploy the POS changes, refresh every cashier/waiter browser, then install Print Agent **2.6.0** on the Windows cashier computer using the `CocktailloPrintAgent-Windows` CI artifact. Close the running old agent before replacing its EXE. Keep the existing pairing/configuration and Windows printer names. Test one Bar and one Shisha ticket, simultaneous submissions from two waiter devices, and a payment with returned change before service. Physical printer delivery requires on-site verification.

Validation: `npm test`, `npm run build`, then `npm run test:integration`. Integration checks use a temporary data file and loopback port 3187, never production data. An optional `PLAYWRIGHT_MODULE` path enables a mobile browser smoke test when Chromium is installed.
