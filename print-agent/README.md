# Cocktaillo Windows Print Agent

Cocktaillo uses one local Windows print agent on the cashier POS computer. QZ Tray is not required.

## What the staff sees

- **Waiter phone:** send the table order normally. No printer app, token, popup, or local printer connection is required on the phone.
- **Cashier / Manager phone:** payments and reprints can be submitted normally. The receipt is queued for the cashier printer instead of trying to print from the phone.
- **Cashier Windows POS:** this is the only device that needs the local print agent. It automatically prints queued customer receipts and Bar tickets.

If a printer is temporarily offline, the server keeps the job and retries with backoff. A job left in `printing` after a browser/PC interruption is automatically recovered back to the queue.

## Easiest install

1. Install the Windows driver for both thermal printers and confirm each printer can print a Windows test page.
2. Download the `CocktailloPrintAgent.exe` artifact produced by the **Build Windows Print Agent** GitHub Action.
3. Double-click `CocktailloPrintAgent.exe` once. It installs itself under `%LOCALAPPDATA%\CocktailloPrintAgent`, registers itself to start with Windows, starts silently, and opens a Notepad file containing the pairing token.
4. On the cashier Windows POS, sign in as Manager and open **Settings > POS Printing**.
5. Paste the pairing token and click **Connect & Load Printers**.
6. Choose the Windows printer for **Customer receipt printer** and the Windows printer for **Bar printer**.
7. Choose 80 mm or 58 mm and click **Save Printer Setup**.

That setup is stored only in that Windows browser. Waiter/manager phones do not need to repeat it.

## How printing works

1. A waiter sends an order from the phone.
2. Cocktaillo saves the order and creates the Bar print job on the server.
3. The configured cashier Windows device checks that its local print agent is healthy before it claims any job.
4. It claims the next queued job, renders Arabic Bar tickets as a printer raster image, and sends the RAW ESC/POS bytes to the selected Windows printer.
5. Customer receipts use the same central queue and the selected customer printer.
6. The server records `printed` or `failed`. Failed jobs stay available for automatic retry.

This prevents a manager phone or waiter phone from accidentally claiming a printer job and failing it.

## Security

- The agent listens only on `127.0.0.1:17483`.
- It requires the random pairing token generated on that computer.
- It only accepts configured Cocktaillo browser origins.
- The pairing token is stored locally in the cashier browser and is not uploaded to the POS database.
- Completed job IDs are remembered locally so the same job is not physically printed twice after a successful print.

## Troubleshooting

- Open **Settings > POS Printing** on the cashier Windows computer and click **Connect & Load Printers**.
- Confirm the selected printer names exactly match Windows.
- Confirm the Windows printer is online and has paper.
- If the PC was restarted, the agent should start automatically with Windows. If needed, run the installed agent again.
- Waiter phones should never need printer troubleshooting; their job is only to submit the order.
