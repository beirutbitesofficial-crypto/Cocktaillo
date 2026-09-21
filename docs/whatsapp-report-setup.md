# Shift-close WhatsApp setup

Closing now saves one immutable **shift** report, its printer payload and a delivery record in the same state transaction. It does not send the whole calendar day's figures. Excel, the manager's report page and the cashier paper use that snapshot. Reports include paid orders/items/add-ons/notes, discounts, refunds paid during this shift (including older orders), drawer expenses, currency reconciliation, item quantities and recorded stock at close. Recorded stock is not a physical count, and net sales is not profit.

## Production configuration still required

Configure these server environment variables securely in Hostinger. Never commit tokens or paste them in public issues.

- `WHATSAPP_ACCESS_TOKEN`: Meta system-user token with messaging permission.
- `WHATSAPP_PHONE_NUMBER_ID`: sending business phone number ID.
- `MANAGER_WHATSAPP_NUMBER`: confirmed recipient, digits including country code. The owner previously supplied `9613384026`; verify account configuration when connecting.
- `PUBLIC_APP_URL`: the HTTPS origin of the deployed POS, including its temporary Hostinger hostname if still in use. Update it when changing domains.
- `WHATSAPP_SHIFT_TEMPLATE`: an approved utility template name.
- `WHATSAPP_TEMPLATE_LANGUAGE`: its exact approved language code, such as `en_US` or `ar`.
- `WHATSAPP_GRAPH_VERSION`: optional; defaults to `v23.0`.
- `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`: configure the signed status webhook described below.

Use a **text-only utility template with three body parameters**, no header/button parameters. Suggested template body for approval:

> Cocktaillo shift closed by {{1}}. Closing summary: {{2}}. View the complete saved report: {{3}}. Sign in with your manager account to view orders, stock and reconciliation.

Parameter 1 is the cashier, parameter 2 is the frozen summary (with both currencies), and parameter 3 is the authenticated report link. The manager gets a WhatsApp summary and a link to the full report with Excel download; this version does **not** send a free-form Excel attachment. This avoids relying on an open customer-service conversation. Meta must approve the exact template and language before use. Arabic template wording is supported; numeric summary labels currently use English.

Official API reference: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api

## Status and recovery

Configure the WhatsApp `messages` webhook to `https://YOUR-POS/api/whatsapp-webhook`, using `WHATSAPP_VERIFY_TOKEN` for verification and `WHATSAPP_APP_SECRET` for signature validation.

- `not_configured`: setup is incomplete; no message attempted. Complete setup, then the manager can press Retry WhatsApp on the saved shift.
- `pending` / `sending`: durable delivery record. The shift screen resumes an unstarted delivery; keep the cashier browser open for printing and this recovery.
- `accepted`: Meta returned a message ID; **not proof of delivery**.
- `sent`, `delivered`, `read`: signed Meta webhook evidence.
- `failed`: definitive provider rejection/delivery failure; the manager can retry after correcting the cause.
- `uncertain`: timeout or interrupted send, including a stale sending claim. Do not resend blindly: the provider may have accepted it. Check the provider and manager's WhatsApp; administrator reconciliation is required before resetting the record for a retry.

No provider error reopens a closed shift or duplicates the print job. No real WhatsApp delivery has been tested from development; automated tests use mocked provider responses. Deployment validation requires a real approved template, credentials and receipt of one test close report.

## Existing Windows print agent

No Agent upgrade is required. The long report uses the installed Agent 2.5 standard customer-receipt protocol, with one sale row per order, descriptive item/add-on detail, refund rows and cash/item/stock reconciliation in the footer. The existing receipt header/social footer remain because they are built into that binary. This legacy customer renderer prints English/ASCII; Arabic notes and names remain intact in the manager web/Excel report. The print job never opens the drawer. Physical paper and printer connectivity must be checked at the shop after deployment.

## Accuracy boundaries

USD uses cents and LBP uses whole pounds. Each report is scoped by shift ID. Legacy receipts without a recorded change currency show a warning (USD assumed by the legacy data model). Duplicate receipt/order IDs and unassigned expenses overlapping multiple shifts stop closing for manager review. Older closed shifts are not silently rebuilt using today's prices or exchange rate. Database backups include the saved shift reports and delivery state.
