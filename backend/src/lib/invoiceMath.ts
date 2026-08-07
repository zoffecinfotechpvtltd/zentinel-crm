export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type LineItemInput = { description: string; quantity: number; rate: number; gst_rate: number };

// Each line's subtotal and tax are rounded independently, then summed —
// this is what makes multi-rate invoices match hand calculation to the
// paisa (rounding the whole invoice at once instead of per-line can drift
// by a paisa on mixed-rate invoices).
export function computeTotals(lines: LineItemInput[]) {
  let subtotal = 0;
  let tax = 0;
  const computed = lines.map((l) => {
    const lineSubtotal = roundMoney(l.quantity * l.rate);
    const lineTax = roundMoney(lineSubtotal * (l.gst_rate / 100));
    subtotal = roundMoney(subtotal + lineSubtotal);
    tax = roundMoney(tax + lineTax);
    return { ...l, lineSubtotal, lineTax };
  });
  return { subtotal, tax, total: roundMoney(subtotal + tax), lines: computed };
}
