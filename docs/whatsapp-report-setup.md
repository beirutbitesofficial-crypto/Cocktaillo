# WhatsApp daily report delivery

The POS sends the professional daily Excel workbook immediately after a cashier closes a shift when WhatsApp Cloud API is configured.

Required production environment variables:

- `WHATSAPP_ACCESS_TOKEN` — Meta WhatsApp Cloud API permanent/system-user access token.
- `WHATSAPP_PHONE_NUMBER_ID` — WhatsApp Business phone-number ID used to send reports.
- `MANAGER_WHATSAPP_NUMBER` — destination in international digits. Default configured by the application: `9613384026`.

If credentials are absent, shift closing still succeeds and the report delivery is recorded as `not_configured`; financial closing is never rolled back because an external messaging provider is unavailable.

The generated workbook includes Executive Summary, Orders, Item Details, Refunds, Expenses, Shifts, Inventory and Audit sheets. It can also be downloaded from `/api/daily-report` by cashier or manager.
