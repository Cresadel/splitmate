import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { peso, toCents } from '../utils/money'
import { catLabel } from '../utils/ui'

const SUGGESTIONS = ['Rent', 'Electricity', 'Water', 'Internet', 'Groceries', 'Supplies']
const norm = (s) => String(s || '').trim().toLowerCase()

export default function BudgetTab({ gid, members, isOwner, isLeft = false, expenses = [] }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('budget_items').select('*').eq('group_id', gid).order('created_at', { ascending: true })
    if (error) toast.error(error.message)
    setItems(data || [])
    setLoading(false)
  }, [gid])

  useEffect(() => { setLoading(true); load() }, [load])

  const memberCount = members.filter((m) => !m.left_at).length
  const totalBudget = items.reduce((s, i) => s + Number(i.amount), 0)
  const totalCents = toCents(totalBudget)
  const eachCents = memberCount > 0 ? Math.floor(totalCents / memberCount) : 0
  const remainderCents = memberCount > 0 ? totalCents - eachCents * memberCount : totalCents
  const now = new Date()
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  function actualFor(item) {
    const key = norm(item.title)
    return expenses
      .filter((e) => String(e.expense_date).startsWith(monthPrefix) && (norm(e.title) === key || norm(catLabel(e.category)) === key))
      .reduce((s, e) => s + toCents(e.amount), 0)
  }

  async function addItem(e) {
    e.preventDefault()
    const cents = toCents(amount)
    if (!title.trim()) return toast.error('Title is required')
    if (cents <= 0) return toast.error('Amount must be greater than zero')
    setAdding(true)
    const { error } = await supabase.from('budget_items').insert({ group_id: gid, title: title.trim(), amount: cents / 100 })
    setAdding(false)
    if (error) return toast.error(error.message)
    setTitle(''); setAmount('')
    load()
  }

  async function saveEdit(e) {
    e.preventDefault()
    const cents = toCents(editing.amount)
    if (!editing.title.trim()) return toast.error('Title is required')
    if (cents <= 0) return toast.error('Amount must be greater than zero')
    setSavingEdit(true)
    const { error } = await supabase.from('budget_items').update({ title: editing.title.trim(), amount: cents / 100 }).eq('id', editing.id)
    setSavingEdit(false)
    if (error) return toast.error(error.message)
    setEditing(null)
    load()
  }

  async function removeItem(id) {
    if (!confirm('Delete this budget item?')) return
    setDeleting(id)
    const { error } = await supabase.from('budget_items').delete().eq('id', id)
    setDeleting(null)
    error ? toast.error(error.message) : load()
  }

  if (loading) return <div className="card text-sm text-muted">Loading budget...</div>

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted">Total budget</p>
            <p className="text-2xl font-bold">{peso(totalBudget)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted">Roommates</p>
            <p className="text-2xl font-bold">{memberCount}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted">Each pays</p>
            <p className="break-words text-lg font-bold">{peso(totalBudget)} ÷ {memberCount} = {peso(eachCents / 100)}</p>
          </div>
        </div>
        {remainderCents > 0 && <p className="mt-2 text-xs text-muted">{peso(remainderCents / 100)} remainder</p>}
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">Planned monthly costs</h2>

        {items.length === 0 ? (
          <p className="text-sm text-muted">No budget yet. Add the monthly costs, like rent and electricity, to see how much each person pays.</p>
        ) : (
          <div className="divide-y divide-line">
            {items.map((item) => {
              const perPersonCents = memberCount > 0 ? Math.floor(toCents(item.amount) / memberCount) : 0
              const actualCents = actualFor(item)
              const diffCents = actualCents - toCents(item.amount)
              if (editing?.id === item.id) {
                return (
                  <form key={item.id} onSubmit={saveEdit} className="space-y-2 py-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                      <input type="number" step="0.01" min="0" className="input" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <button className="btn w-full sm:w-auto" disabled={savingEdit}>Save</button>
                      <button type="button" className="btn-ghost w-full justify-center sm:w-auto" onClick={() => setEditing(null)}><X size={16} />Cancel</button>
                    </div>
                  </form>
                )
              }
              return (
                <div key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.title}</p>
                    <p className="break-words text-xs text-muted">{peso(item.amount)} · {peso(perPersonCents / 100)} each</p>
                    {actualCents > 0 && (
                      <p className="mt-0.5 break-words text-xs text-muted">
                        Actual {peso(actualCents / 100)} · {diffCents > 0 ? `Over by ${peso(diffCents / 100)}` : diffCents < 0 ? `Under by ${peso(-diffCents / 100)}` : 'On budget'}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-semibold">{peso(item.amount)}</span>
                    {isOwner && !isLeft && (
                      <>
                        <button type="button" aria-label="Edit budget item" onClick={() => setEditing({ id: item.id, title: item.title, amount: String(item.amount) })} className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:text-ink"><Pencil size={15} /></button>
                        <button type="button" aria-label="Delete budget item" onClick={() => removeItem(item.id)} disabled={deleting === item.id} className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:text-bad disabled:opacity-50"><Trash2 size={15} /></button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {isOwner && !isLeft && (
          <form onSubmit={addItem} className="space-y-3 border-t border-line pt-4">
            <div>
              <label className="label">Quick add</label>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => {
                  const selected = norm(title) === norm(s)
                  return (
                    <button key={s} type="button" onClick={() => setTitle(selected ? '' : s)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${selected ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-card text-ink hover:bg-primary-soft'}`}>{s}</button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="label">Item</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rent, Electricity..." />
              </div>
              <div className="sm:w-32">
                <label className="label">Amount (₱)</label>
                <input type="number" step="0.01" min="0" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <button className="btn w-full sm:w-auto" disabled={adding}>{adding ? 'Adding...' : <><Plus size={16} />Add item</>}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
