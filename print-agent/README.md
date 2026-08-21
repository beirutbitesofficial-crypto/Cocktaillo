# Cocktaillo Windows Print Agent

This local agent enables silent 80mm customer receipt printing from the Cocktaillo web POS without using Chrome's print dialog or `window.print()`.

## Architecture

- Binds only to `127.0.0.1:17483`.
- Requires a 256-bit bearer pairing token.
- Rejects browser origins not listed in `config.json`.
- Supports Chrome Private Network Access preflight headers.
- Sends RAW ESC/POS bytes directly to the Windows spooler using `OpenPrinter` / `WritePrinter`.
- Customer destination defaults to the Windows printer named `Customer Receipt`.
- Kitchen and Bar destination names are already reserved in the config for future routing.
- Keeps a local `print-jobs.json` idempotency log, so the same print job ID is never printed twice after it has completed.
- Sends an ESC/POS full-cut command after the receipt.

## Install on the Windows 10 POS computer

1. Confirm Windows can print a test page to the printer named exactly `Customer Receipt`.
2. Install Node.js 20 LTS or newer.
3. Copy the entire `print-agent` folder to a permanent local folder, for example `C:\Cocktaillo\print-agent`.
4. Open PowerShell as Administrator in that folder.
5. Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-windows.ps1
```

The installer creates `config.json`, registers a Windows Scheduled Task named `Cocktaillo Print Agent`, starts the agent, and prints the generated pairing token.

## Pair the POS

In Cocktaillo POS, sign in as Manager and open **Settings → Customer Receipt Printer**.

- Agent URL: `http://127.0.0.1:17483`
- Pairing token: paste the token from `config.json`
- Click **Test Agent & Load Printers**
- Select `Customer Receipt`
- Save settings

The token is stored only in that browser's `localStorage`; it is not uploaded into Cocktaillo's server data.

## Printing flow

1. Cashier payment succeeds on the POS backend.
2. The backend receipt is final and remains paid regardless of printer state.
3. The browser requests/gets a persistent Cocktaillo print job for the receipt.
4. The browser sends that job to the local agent.
5. The agent writes the formatted ESC/POS receipt directly to the selected Windows printer and triggers the cutter.
6. Cocktaillo records the print job as `printed` or `failed`.
7. Failed jobs display **Receipt printing failed – Retry**. Paid receipts remain paid.
8. Manual reprints create a new explicit reprint job and are available from the POS **Receipts** screen.

## Security

The agent listens on loopback only and cannot be reached from another computer on the LAN. Keep the pairing token private. If the production Cocktaillo domain changes, add the exact new HTTPS origin to `allowed_origins` in `config.json`, then restart the scheduled task.

## Troubleshooting

Check that the Windows printer name exactly matches `Customer Receipt`, the scheduled task is running, and `http://127.0.0.1:17483` is not blocked by local endpoint security software. Use **Test Agent & Load Printers** in Cocktaillo Settings to verify the browser can reach the agent and enumerate Windows printers.
