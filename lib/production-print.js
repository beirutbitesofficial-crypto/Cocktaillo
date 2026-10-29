// Which production stations get a printed ticket, and on which Windows printer.
// Kitchen printing is off until the manager enables it, so tickets never pile up for a printer that is not installed yet.
export const printsStation = (settings, station) =>
  station === 'bar' || station === 'hookah' || (station === 'kitchen' && settings?.kitchen_printing_enabled === true);

export function productionPrinterName(settings = {}, station) {
  if (station === 'hookah') return settings.hookah_printer_name || 'HOOKAH';
  if (station === 'kitchen') return settings.kitchen_printer_name || 'Kitchen Printer';
  return settings.bar_printer_name || 'Bar Printer';
}
