# Cocktaillo Windows Print Agent

This local Windows agent prints both 80mm customer receipts and Bar production tickets without QZ Tray or a browser print dialog.

## How it works

- The agent binds only to 127.0.0.1:17483 on the cashier computer.
- A 256-bit pairing token protects every request.
- Allowed browser origins are controlled by config.json.
- RAW ESC/POS bytes go directly to the selected Windows printers.
- Customer and Bar printer names are configured independently in the POS browser.
- Completed job IDs are stored locally, preventing duplicate printing after a retry or restart.
- Kitchen printing is intentionally disabled in the POS for now.

A waiter can use the POS from a phone. Sending a table order creates a persistent Bar print job on the server. The cashier computer polls that queue and forwards the ticket to the local Bar printer. The phone never connects to a printer.

## Install on the Windows cashier computer

1. In Windows, install both printers and confirm that each can print a Windows test page.
2. Give them clear Windows names, for example Customer Receipt and Bar Printer.
3. Install Node.js 20 LTS or newer.
4. Copy the print-agent folder to a permanent folder such as C:\Cocktaillo\print-agent.
5. Open PowerShell as Administrator in that folder and run:

    Set-ExecutionPolicy -Scope Process Bypass
    .\install-windows.ps1

The installer creates config.json, registers the Cocktaillo Print Agent scheduled task, starts it, and displays the pairing token.

## Pair the POS browser

On the same Windows cashier computer:

1. Sign in as Manager.
2. Open Settings, then Cashier Computer Printers.
3. Leave the agent URL as http://127.0.0.1:17483.
4. Paste the pairing token from config.json.
5. Click Test Agent & Load Printers.
6. Choose the installed Customer and Bar printers.
7. Click Save on This Computer.

The token and selections remain in browser localStorage on that computer. They are not uploaded to the POS server.

## Production flow

- Waiter phone order: server queue -> cashier browser worker -> local agent -> Bar printer.
- Cashier payment: paid receipt -> local agent -> Customer printer.
- A print failure never reverses a successful payment.
- Failed jobs stay in the server queue and can be retried.
- Kitchen tickets can still appear on the Kitchen board, but no Kitchen print job is created.

## Security and troubleshooting

Keep the token private. If the hosted POS domain changes, add its exact HTTPS origin to allowed_origins in config.json and restart the scheduled task.

If printing does not start, verify the scheduled task is running, the two Windows printer names match the selections, and the Settings test can list both printers. The agent URL is deliberately restricted to localhost so the pairing token cannot be sent to another machine.
