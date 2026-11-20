export const peso = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n) || 0)
export const toCents = (n) => Math.round((Number((n || '').toString().replace(/,/g, '')) * 100))
export const parseAmount = (text) => { const v = text || ''; return v ? Number(v.toString().replace(/,/g, '')) : 0 }
export const formatAmountInput = (value) => { const v = String(value || '').trim(); if (!v) return ''; const hasTrailingDot = v.endsWith('.') && !/\d+\.\d+$/.test(v); let clean = v.replace(/,/g, ''); clean = clean.replace(/\.(?=[^.]*\.)/g, ''); const parts = clean.split('.'); const intPart = parts[0]; const decPart = parts[1]; const formattedInt = new Intl.NumberFormat('en-US').format(Number(intPart) || 0); let result = formattedInt; if (decPart) { result += '.' + decPart.slice(0, 2); } else if (hasTrailingDot) { result += '.'; } return result }
// Equal split in centavos; leftovers go to the first participants (100 / 3 -> 33.34, 33.33, 33.33)
export function splitEqual(totalCents, ids) {
  const base = Math.floor(totalCents / ids.length), rem = totalCents % ids.length
  return ids.map((user_id, i) => ({ user_id, share: (base + (i < rem ? 1 : 0)) / 100 }))
}
export const netOf = (b) =>
  Math.round((Number(b.paid) - Number(b.shares) + Number(b.settled_paid) - Number(b.settled_received)) * 100) / 100