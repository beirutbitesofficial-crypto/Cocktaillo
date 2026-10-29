# Cocktaillo Windows Print Agent

This local Windows agent prints 80mm customer receipts plus separate Bar, Hookah and Kitchen production tickets without QZ Tray or a browser print dialog.

## How it works

- The agent binds only to 127.0.0.1:17483 on the cashier computer.
- A 256-bit pairing token protects every request.
- Allowed browser origins are controlled by config.json.
- RAW ESC/POS bytes go directly to the selected Windows printers.
- Customer, Bar, Hookah and Kitchen printer names are configured independently in the POS browser.
- Completed job IDs are stored locally, preventing duplicate printing after a retry or restart.
- Kitchen printing is off until the manager ticks "Print food orders on the Kitchen printer" in Settings, so tickets never queue for a printer that is not installed yet.

A waiter can use the POS from a phone. Sending a table order creates a persistent Bar or Hookah print job on the server. The cashier computer polls that queue and forwards the ticket to the matching local production printer. The phone never connects to a printer.

## Install on the Windows cashier computer

1. In Windows, install all three printers and confirm that each can print a Windows test page.
2. Give them clear Windows names, for example Customer Receipt, Bar Printer and HOOKAH.
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
6. Choose the installed Customer, Bar and Hookah printers.
7. Click Save on This Computer.

The token and selections remain in browser localStorage on that computer. They are not uploaded to the POS server.

## Production flow

- Waiter phone drink order: server queue -> cashier browser worker -> local agent -> Bar printer.
- Waiter phone Hookah order: Hookah lines only -> cashier browser worker -> local agent -> HOOKAH printer in Arabic.
- Cashier payment: paid receipt -> local agent -> Customer printer.
- A print failure never reverses a successful payment.
- Failed jobs stay in the server queue and can be retried.
- Waiter phone food order: Kitchen lines only -> cashier browser worker -> local agent -> Kitchen printer in Arabic (once kitchen printing is turned on).
- Agent 2.7.0 titles kitchen tickets "طلب مطبخ جديد". Older agents still print them correctly on the Kitchen printer, with the Bar title.

## Security and troubleshooting

Keep the token private. If the hosted POS domain changes, add its exact HTTPS origin to allowed_origins in config.json and restart the scheduled task.

If printing does not start, verify the scheduled task is running, the three Windows printer names match the selections, and the Settings test can list all three printers. The agent URL is deliberately restricted to localhost so the pairing token cannot be sent to another machine.

## Reconnect a printer that stopped printing

1. Check the printer is on, has paper, and its USB or network cable is plugged into the cashier computer.
2. In Windows Settings > Bluetooth & devices > Printers & scanners, open the printer and print a Windows test page. If Windows shows it as offline, unplug and replug it (or restart it) and wait until it is ready.
3. If Windows reinstalled the printer under a new name (for example "Bar Printer (Copy 1)"), either rename it back or pick the new name in the POS.
4. In the POS on the cashier computer: Settings > Cashier Computer Printers > Test Agent & Load Printers, choose the printer from the list, then Save on This Computer.
5. Retry the failed tickets from the print status list. Tickets that failed while the printer was away stay queued and are never lost.

## Add the Kitchen printer

1. Install the Kitchen printer in Windows on the cashier computer and print a Windows test page. Give it a clear name such as Kitchen Printer.
2. In the POS: Settings > Cashier Computer Printers > Test Agent & Load Printers, choose it as Kitchen printer (food), then Save on This Computer.
3. Tick Print food orders on the Kitchen printer.
4. Send one test food order from a waiter phone. Only food prints in the kitchen; drinks stay on the Bar printer and shisha on the HOOKAH printer.
