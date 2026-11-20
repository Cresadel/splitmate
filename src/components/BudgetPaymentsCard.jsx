import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { peso } from '../utils/money'
import { computePayments, monthKeyOf, monthLabel, PAYMENT_STATUS_STYLES, statusLabel } from '../utils/payments'
import { Avatar } from '../utils/ui'

export default function BudgetPaymentsCard({ gid, members, onOpenPayments, onGoBudget }) {
  const [payments, setPayments] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      const [paymentsResult, itemsResult] = await Promise.all([
        supabase.from('budget_payments').select('*').eq('group_id', gid).order('month', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('budget_items').select('id,amount').eq('group_id', gid),
      ])
      if (!active) return
      if (paymentsResult.error) toast.error(paymentsResult.error.message)
      if (itemsResult.error) toast.error(itemsResult.error.message)
      setPayments(paymentsResult.data || [])
      setItems(itemsResult.data || [])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [gid])

  const now = new Date()
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const { totalCents, rows, collectedCents, paidCount } = computePayments({
    members,
    budgetItems: items,
    payments,
    monthKey: monthKeyOf(currentMonth),
  })

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Budget payments · {monthLabel(currentMonth)}</h2>
        <button className="btn-ghost !px-3 !text-xs" onClick={onOpenPayments}>Open Payments</button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading budget payments...</p>
      ) : totalCents <= 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">No budget yet.</p>
          <button className="btn-ghost !px-3 !text-xs" onClick={onGoBudget}>Go to Budget</button>
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <p>Collected <span className="font-semibold text-[#166534]">{peso(collectedCents / 100)}</span> <span className="text-muted">of {peso(totalCents / 100)}</span></p>
            <p className="text-muted">{paidCount} of {rows.length} paid</p>
          </div>
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.member.user_id} className="flex items-start gap-3 py-2.5 text-sm">
                <Avatar name={r.member.profiles?.full_name} size="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <p className="min-w-0 flex-1 truncate font-semibold">{r.member.profiles?.full_name}</p>
                    <span className={`max-w-full shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${PAYMENT_STATUS_STYLES[r.type]}`}>{statusLabel(r.type, r.extra)}</span>
                  </div>
                  <p className="mt-0.5 break-words text-xs text-muted">Paid {peso(r.paid / 100)} / Required {peso(r.required / 100)}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
