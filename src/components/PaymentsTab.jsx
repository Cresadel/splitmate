import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { peso, toCents, formatAmountInput, parseAmount } from '../utils/money'
import {
  addMonths,
  computePayments,
  monthKeyOf,
  monthLabel,
  PAYMENT_STATUS_STYLES,
  remainingTextClass,
  statusLabel,
} from '../utils/payments'
import { Avatar } from '../utils/ui'

export default function PaymentsTab({ gid, members, me, onGoBudget, isOwner, isLeft = false }) {
  const [payments, setPayments] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ user_id: me, amount: formatAmountInput(''), month: monthKeyOf(new Date()), note: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const activeMembers = members.filter((m) => !m.left_at)

  const load = useCallback(async () => {
    const [paymentsResult, itemsResult] = await Promise.all([
      supabase.from('budget_payments').select('*').eq('group_id', gid).order('month', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('budget_items').select('id,amount').eq('group_id', gid),
    ])
    if (paymentsResult.error) toast.error(paymentsResult.error.message)
    if (itemsResult.error) toast.error(itemsResult.error.message)
    setPayments(paymentsResult.data || [])
    setItems(itemsResult.data || [])
    setLoading(false)
  }, [gid])

  useEffect(() => { setLoading(true); load() }, [load])

  function openForm() {
    if (isLeft) return
    setForm({ user_id: me, amount: '', month: monthKeyOf(selectedMonth), note: '' })
    setShowForm(true)
  }

  async function submit(e) {
    e.preventDefault()
    const cents = toCents(form.amount)
    if (!form.user_id) return toast.error('Choose a member')
    if (cents <= 0) return toast.error('Amount must be greater than zero')
    if (!form.month) return toast.error('Choose a month')
    setSaving(true)
    const { error } = await supabase.from('budget_payments').insert({
      group_id: gid,
      user_id: form.user_id,
      amount: cents / 100,
      month: `${form.month}-01`,
      note: form.note.trim() || null,
      created_by: me,
    })
    setSaving(false)
    if (error) return toast.error('Only the apartment owner can record payments.')
    setShowForm(false)
    setForm({ user_id: me, amount: '', month: monthKeyOf(selectedMonth), note: '' })
    load()
  }

  async function removePayment(id) {
    if (!confirm('Delete this payment?')) return
    setDeleting(id)
    const { error } = await supabase.from('budget_payments').delete().eq('id', id)
    setDeleting(null)
    error ? toast.error('Only the apartment owner can record payments.') : load()
  }

  if (loading) return <div className="card text-sm text-muted">Loading payments...</div>

  const selectedKey = monthKeyOf(selectedMonth)
  const {
    totalCents,
    requiredCents,
    paidInMonth,
    creditFor,
    rows,
    leftRows,
    collectedCents,
    pendingCents,
    paidCount,
    allPaid,
    hasPaymentsThisMonth,
    progress,
  } = computePayments({ members, budgetItems: items, payments, monthKey: selectedKey })

  if (totalCents <= 0) {
    return (
      <div className="card flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted">Add your monthly budget first to track payments.</p>
        <button className="btn" onClick={onGoBudget}>Go to Budget</button>
      </div>
    )
  }

  const formRequired = requiredCents[form.user_id] || 0
  const formMonth = form.month || selectedKey
  const formRemaining = Math.max(0, formRequired - (paidInMonth(form.user_id, formMonth) + creditFor(form.user_id, formMonth)))

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button aria-label="Previous month" className="btn-ghost h-10 w-10 justify-center !p-0" onClick={() => setSelectedMonth(addMonths(selectedMonth, -1))}><ChevronLeft size={18} /></button>
          <p className="text-sm font-semibold">{monthLabel(selectedMonth)}</p>
          <button aria-label="Next month" className="btn-ghost h-10 w-10 justify-center !p-0" onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}><ChevronRight size={18} /></button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted">Collected</p>
            <p className="text-xl font-bold text-[#166534]">{peso(collectedCents / 100)} <span className="text-sm font-medium text-muted">of {peso(totalCents / 100)}</span></p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted">Pending</p>
            <p className="text-xl font-bold text-[#991b1b]">{peso(pendingCents / 100)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted">Paid</p>
            <p className="text-xl font-bold">{paidCount} of {rows.length}</p>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${progress}%` }} />
        </div>

        {allPaid && <p className="text-sm font-medium">Everyone has paid for this month 🎉</p>}
      </div>

      {showForm && !isLeft && (
        <form onSubmit={submit} className="card space-y-3">
          <h2 className="font-medium">Record payment</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="label">Member</label><select className="input" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>{activeMembers.map((m) => <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></div>
            <div>
              <div className="flex items-end justify-between gap-2">
<label className="label">Amount (₱)</label>
              {isOwner && !isLeft && (
                <button type="button" onClick={() => setForm({ ...form, amount: formatAmountInput(String(formRemaining / 100)) })} disabled={formRemaining <= 0} className="mb-1.5 text-xs font-medium text-ink underline disabled:text-muted disabled:no-underline">Pay full share</button>
              )}
              </div>
              <input type="text" inputMode="decimal" className="input" value={formatAmountInput(form.amount)} onChange={(e) => setForm({ ...form, amount: formatAmountInput(e.target.value) })} placeholder="0.00" />
            </div>
            <div><label className="label">Month</label><input type="month" className="input" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></div>
            <div><label className="label">Note (optional)</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="GCash, Cash..." /></div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row"><button className="btn w-full sm:w-auto" disabled={saving}>{saving ? 'Saving...' : 'Save payment'}</button><button type="button" className="btn-ghost w-full justify-center sm:w-auto" onClick={() => setShowForm(false)}>Cancel</button></div>
        </form>
      )}

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Member payments</h2>
          {isOwner && !isLeft && <button className="btn-ghost !px-3 !text-xs sm:!px-4 sm:!text-sm" onClick={openForm}><Plus size={16} />Record payment</button>}
        </div>

        {!hasPaymentsThisMonth && <p className="text-sm text-muted">No payments recorded this month.</p>}

        {!isOwner && !isLeft && <p className="text-sm text-muted">Only the apartment owner records payments.</p>}

        <div className="divide-y divide-line">
          {rows.map((r) => {
            const isOpen = expanded === r.member.user_id
            return (
              <div key={r.member.user_id} className="py-3 text-sm">
                <div className="flex items-start gap-3">
                  <Avatar name={r.member.profiles?.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <p className="min-w-0 flex-1 truncate font-semibold">{r.member.profiles?.full_name}</p>
                      <div className="flex max-w-full shrink-0 flex-col items-end gap-1">
                        <span className={`max-w-full rounded-full px-2.5 py-1 text-xs font-semibold ${PAYMENT_STATUS_STYLES[r.type]}`}>{statusLabel(r.type, r.extra)}</span>
                        {(r.type === 'partial' || r.type === 'unpaid') && <span className={`text-xs ${remainingTextClass(r.type)}`}>Remaining {peso(r.remaining / 100)}</span>}
                      </div>
                    </div>
                    <p className="mt-0.5 break-words text-xs text-muted">Paid {peso(r.paid / 100)} / Required {peso(r.required / 100)}</p>
                    {r.credit > 0 && <p className="break-words text-xs text-muted">Credit from previous months {peso(r.credit / 100)}</p>}
                  </div>
                </div>

                {r.monthPayments.length > 0 && (
                  <div className="mt-2 sm:pl-[52px]">
                    <button type="button" onClick={() => setExpanded(isOpen ? null : r.member.user_id)} className="flex items-center gap-1 text-xs font-medium text-muted transition hover:text-ink">
                      Payments ({r.monthPayments.length}) {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {isOpen && (
                      <div className="mt-1 space-y-1">
                        {r.monthPayments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 break-words text-muted">{format(new Date(p.created_at), 'MMM d')} · {peso(p.amount)}{p.note && ` · ${p.note}`}</span>
                            {isOwner && !isLeft && <button type="button" aria-label="Delete payment" onClick={() => removePayment(p.id)} disabled={deleting === p.id} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-bad disabled:opacity-50"><Trash2 size={14} /></button>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {leftRows.length > 0 && (
          <div className="space-y-2 border-t border-line pt-3 opacity-70">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Left members</p>
            {leftRows.map((r) => (
              <div key={r.member.user_id} className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar name={r.member.profiles?.full_name} size="h-8 w-8" />
                    <p className="truncate font-medium text-muted">{r.member.profiles?.full_name}</p>
                    <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-muted">Left</span>
                  </div>
                  <span className="text-xs text-muted">Paid {peso(r.paid / 100)}{r.required > 0 && ` / Required ${peso(r.required / 100)}`}</span>
                </div>
                {r.monthPayments.length > 0 ? (
                  <div className="mt-1 space-y-0.5 sm:pl-[40px]">
                    {r.monthPayments.map((p) => (
                      <p key={p.id} className="break-words text-xs text-muted">{format(new Date(p.created_at), 'MMM d')} · {peso(p.amount)}{p.note && ` · ${p.note}`}</p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted sm:pl-[40px]">No payments this month.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
