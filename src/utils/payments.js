import { peso, splitEqual, toCents } from './money'

const pad = (n) => String(n).padStart(2, '0')

export const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
export const monthKeyFromDb = (month) => String(month || '').slice(0, 7)
export const monthDateFromKey = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1)
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)
export const monthLabel = (d) => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d)

export const PAYMENT_STATUS_STYLES = {
  paid: 'bg-[#dcfce7] text-[#166534]',
  partial: 'bg-[#fef3c7] text-[#92400e]',
  unpaid: 'bg-[#fee2e2] text-[#991b1b]',
  advance: 'bg-[#dbeafe] text-[#1e40af]',
}

export const remainingTextClass = (type) => (type === 'partial' ? 'text-[#92400e]' : type === 'unpaid' ? 'text-[#991b1b]' : 'text-muted')

export const statusLabel = (type, extraCents = 0) => {
  if (type === 'advance') return `Advance +${peso(extraCents / 100)}`
  if (type === 'partial') return 'Partial'
  if (type === 'unpaid') return 'Unpaid'
  return 'Paid'
}

// Required shares use the members who were active in that month. For the current and future
// months only currently active members are counted; past months keep members who left later
// (left_at is null or after the end of that month) so history is not rewritten.
const monthEnd = (key) => {
  const next = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1)
  return new Date(next.getTime() - 1)
}

const wasActiveInMonth = (member, monthKey) => {
  if (monthKey >= monthKeyOf(new Date())) return !member.left_at
  return !member.left_at || new Date(member.left_at) > monthEnd(monthKey)
}

export function computePayments({ members, budgetItems, payments, monthKey }) {
  const sortedMembers = [...members].sort((a, b) => (a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0))
  const totalCents = budgetItems.reduce((s, i) => s + toCents(i.amount), 0)

  function requiredFor(targetKey) {
    const eligible = sortedMembers.filter((m) => wasActiveInMonth(m, targetKey))
    const shares = eligible.length ? splitEqual(totalCents, eligible.map((m) => m.user_id)) : []
    return Object.fromEntries(shares.map((s) => [s.user_id, toCents(s.share)]))
  }

  const requiredCents = requiredFor(monthKey)

  const paidByMember = {}
  for (const p of payments) {
    const month = monthKeyFromDb(p.month)
    if (!month) continue
    const months = paidByMember[p.user_id] || (paidByMember[p.user_id] = {})
    months[month] = (months[month] || 0) + toCents(p.amount)
  }
  const paidInMonth = (uid, month) => paidByMember[uid]?.[month] || 0

  const earliestKey = payments.reduce((min, p) => {
    const key = monthKeyFromDb(p.month)
    return key && (!min || key < min) ? key : min
  }, null)

  function creditFor(uid, targetKey) {
    if (!earliestKey || earliestKey >= targetKey) return 0
    let cursor = monthDateFromKey(earliestKey)
    let carry = 0
    while (monthKeyOf(cursor) < targetKey) {
      const month = monthKeyOf(cursor)
      const required = requiredFor(month)[uid] || 0
      carry = Math.max(0, paidInMonth(uid, month) + carry - required)
      cursor = addMonths(cursor, 1)
    }
    return carry
  }

  const buildRow = (member) => {
    const required = requiredCents[member.user_id] || 0
    const paid = paidInMonth(member.user_id, monthKey)
    const credit = creditFor(member.user_id, monthKey)
    const net = paid + credit
    const type = net > required ? 'advance' : net >= required ? 'paid' : net > 0 ? 'partial' : 'unpaid'
    return {
      member,
      required,
      paid,
      credit,
      net,
      remaining: Math.max(0, required - net),
      extra: Math.max(0, net - required),
      type,
      monthPayments: payments.filter((p) => p.user_id === member.user_id && monthKeyFromDb(p.month) === monthKey),
    }
  }

  const rows = sortedMembers.filter((m) => !m.left_at).map(buildRow)
  const leftRows = sortedMembers.filter((m) => m.left_at).map(buildRow)

  const collectedCents = [...rows, ...leftRows].reduce((s, r) => s + Math.min(r.required, r.net), 0)
  const pendingCents = Math.max(0, totalCents - collectedCents)
  const paidCount = rows.filter((r) => r.type === 'paid' || r.type === 'advance').length
  const hasPaymentsThisMonth = payments.some((p) => monthKeyFromDb(p.month) === monthKey)

  return {
    sortedMembers,
    totalCents,
    requiredCents,
    paidInMonth,
    creditFor,
    rows,
    leftRows,
    collectedCents,
    pendingCents,
    paidCount,
    allPaid: totalCents > 0 && pendingCents <= 0,
    hasPaymentsThisMonth,
    progress: totalCents > 0 ? Math.round((collectedCents / totalCents) * 100) : 0,
  }
}
