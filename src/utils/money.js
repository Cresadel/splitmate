export const peso = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n) || 0)
export const toCents = (n) => Math.round((Number(n) || 0) * 100)
// Equal split in centavos; leftovers go to the first participants (100 / 3 -> 33.34, 33.33, 33.33)
export function splitEqual(totalCents, ids) {
  const base = Math.floor(totalCents / ids.length), rem = totalCents % ids.length
  return ids.map((user_id, i) => ({ user_id, share: (base + (i < rem ? 1 : 0)) / 100 }))
}
export const netOf = (b) =>
  Math.round((Number(b.paid) - Number(b.shares) + Number(b.settled_paid) - Number(b.settled_received)) * 100) / 100
