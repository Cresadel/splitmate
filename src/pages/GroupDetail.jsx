import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { peso, toCents, splitEqual, netOf } from '../utils/money'
import { Avatar, catIcon, catLabel, CATEGORIES } from '../utils/ui'
import BudgetTab from '../components/BudgetTab'
import PaymentsTab from '../components/PaymentsTab'
import BudgetPaymentsCard from '../components/BudgetPaymentsCard'

const QUICK_PICKS = ['Rent', 'Electricity', 'Water', 'Internet', 'Groceries']
const today = () => format(new Date(), 'yyyy-MM-dd')

function whoPaysWhom(bal) {
  const cents = (n) => Math.round(Number(n) * 100)
  const debtors = []
  const creditors = []
  for (const b of bal) {
    const n = cents(netOf(b))
    if (n < 0) debtors.push({ user_id: b.user_id, amount: -n })
    else if (n > 0) creditors.push({ user_id: b.user_id, amount: n })
  }
  const payments = []
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.amount - a.amount)
    creditors.sort((a, b) => b.amount - a.amount)
    const d = debtors[0]
    const c = creditors[0]
    const amount = Math.min(d.amount, c.amount)
    if (amount <= 0) break
    payments.push({ from: d.user_id, to: c.user_id, amount: amount / 100 })
    d.amount -= amount
    c.amount -= amount
    if (d.amount === 0) debtors.shift()
    if (c.amount === 0) creditors.shift()
  }
  return payments
}

export default function GroupDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const [tab, setTab] = useState('budget')
  const [g, setG] = useState(null)
  const [members, setMembers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [bal, setBal] = useState([])
  const [settles, setSettles] = useState([])
  const [form, setForm] = useState(null)
  const [settleInit, setSettleInit] = useState(null)

  const load = useCallback(async () => {
    const [a, b, c, d, e] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('group_members').select('user_id,role,left_at,profiles(full_name,email)').eq('group_id', id),
      supabase.from('expenses').select('*').eq('group_id', id).order('expense_date', { ascending: false }),
      supabase.rpc('group_balances', { gid: id }),
      supabase.from('settlements').select('*').eq('group_id', id).order('settlement_date', { ascending: false }),
    ])
    if (a.error) { toast.error('Apartment not found'); return nav('/groups') }
    setG(a.data); setMembers(b.data || []); setExpenses(c.data || []); setBal(d.data || []); setSettles(e.data || [])
  }, [id, nav])
  useEffect(() => { load() }, [load])
  if (!g) return <p className="text-muted">Loading...</p>

  const name = (uid) => members.find((m) => m.user_id === uid)?.profiles?.full_name || 'Unknown'
  const isOwner = members.some((m) => m.user_id === user.id && m.role === 'owner')
  const activeMembers = members.filter((m) => !m.left_at)
  const leftMembers = members.filter((m) => m.left_at)
  const activeIds = new Set(activeMembers.map((m) => m.user_id))
  const meMember = members.find((m) => m.user_id === user.id)
  const isLeft = Boolean(meMember?.left_at)
  const isLeftUser = (uid) => Boolean(members.find((m) => m.user_id === uid)?.left_at)
  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const payments = whoPaysWhom(bal)
  const sortedBal = [...bal].sort((a, b) => netOf(a) - netOf(b))
  const visibleBal = sortedBal.filter((b) => activeIds.has(b.user_id) || netOf(b) !== 0)
  const zeroLeftBal = sortedBal.filter((b) => !activeIds.has(b.user_id) && netOf(b) === 0)
  const balanceFor = (uid) => { const b = bal.find((x) => x.user_id === uid); return b ? netOf(b) : 0 }
  const myNet = balanceFor(user.id)
  const leftTag = (uid) => isLeftUser(uid) ? <span className="ml-1 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-muted">Left</span> : null

  async function delExpense(eid) {
    if (!confirm('Delete this expense?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', eid)
    error ? toast.error(error.message) : (toast.success('Expense deleted'), load())
  }
  async function delGroup() {
    if (!confirm(`Delete "${g.name}" and all its expenses? This cannot be undone.`)) return
    const { error } = await supabase.from('groups').delete().eq('id', id)
    error ? toast.error(error.message) : (toast.success('Apartment deleted'), nav('/'))
  }
  async function addMember(e) {
    e.preventDefault()
    const email = String(new FormData(e.target).get('email') || '').trim()
    if (activeMembers.some((m) => String(m.profiles?.email || '').trim().toLowerCase() === email.toLowerCase())) {
      return toast('Already a roommate.')
    }
    const { error } = await supabase.rpc('add_member_by_email', { gid: id, member_email: email })
    if (error) {
      if (error.code === '23505' || /one_active_apartment_per_user/i.test(error.message || '')) {
        return toast.error('This person is already in another apartment. They need to leave it first or use a different account.')
      }
      return toast.error(error.message)
    }
    toast.success('Roommate added'); e.target.reset(); load()
  }
  async function leaveOrRemove(target) {
    if (target === user.id && isOwner && activeMembers.length > 1) {
      return toast.error('Transfer ownership or remove the other members first.')
    }
    const n = balanceFor(target)
    const memberName = name(target)
    const balanceText = n < 0
      ? `${memberName} owes ${peso(-n)}. They will stay in the balances until settled.`
      : n > 0
        ? `${memberName} is owed ${peso(n)}. They will stay in the balances until settled.`
        : `${memberName} has no balance.`
    if (!confirm(`${balanceText} Continue?`)) return
    const { error } = await supabase.rpc('leave_group', { gid: id, target })
    if (error) return toast.error(error.message)
    toast.success(target === user.id ? 'You left the apartment' : 'Roommate removed')
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-primary to-primary-alt p-5 text-white shadow-card sm:flex-row sm:flex-wrap sm:items-start sm:justify-between md:p-6">
        <div className="min-w-0 w-full sm:w-auto">
          <h1 className="truncate text-xl font-bold sm:text-2xl">{g.name}</h1>
          <p className="break-words text-sm text-white">{g.description}</p>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            <div><p className="text-xs text-white">Total spent</p><p className="text-xl font-bold sm:text-2xl">{peso(total)}</p></div>
            <div><p className="text-xs text-white">Roommates</p><p className="text-xl font-bold sm:text-2xl">{activeMembers.length}</p></div>
            <div><p className="text-xs text-white">Your balance</p><p className="break-words text-xl font-bold text-white sm:text-2xl">{myNet < 0 ? `You owe ${peso(-myNet)}` : myNet > 0 ? `You get back ${peso(myNet)}` : 'You are settled'}</p></div>
          </div>
        </div>
        <div className="flex w-full gap-1.5 sm:gap-2 sm:w-auto">
          <button className="btn-ghost flex-1 justify-center !px-2 !text-xs sm:flex-none sm:!px-4 sm:!text-sm" onClick={() => { setSettleInit(null); setTab('settlements'); setForm('settle') }}>Settle up</button>
          {!isLeft && <button className="btn flex-1 !bg-card !px-2 !text-xs !text-primary hover:!bg-primary-soft sm:flex-none sm:!px-5 sm:!text-sm" onClick={() => { setTab('expenses'); setForm('expense') }}><Plus size={16} />Add expense</button>}
          {isOwner && !isLeft && <button aria-label="Delete apartment" className="btn-ghost h-10 w-10 shrink-0 justify-center !p-0 text-bad sm:w-auto sm:!px-4" onClick={delGroup}><Trash2 size={16} /></button>}
        </div>
      </div>

      {isLeft && <p className="text-sm text-muted">You left this apartment. You can still view the history.</p>}

      {form === 'expense' && !isLeft && <ExpenseForm gid={id} members={activeMembers} me={user.id} onDone={() => { setForm(null); load() }} />}
      {form === 'settle' && <SettleForm key={settleInit ? JSON.stringify(settleInit) : 'blank'} gid={id} members={members} balances={bal} me={user.id} initial={settleInit} onDone={() => { setForm(null); setSettleInit(null); load() }} />}

      <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-full bg-card p-1 shadow-card md:inline-flex md:w-auto">
        {['budget', 'payments', 'balances', 'members', 'expenses', 'settlements'].map((t) => (
          <button key={t} onClick={(e) => { setTab(t); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }) }} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium capitalize transition md:py-1.5 ${tab === t ? 'bg-primary text-white' : 'text-muted hover:text-primary'}`}>{t === 'members' ? 'Roommates' : t}</button>))}
      </div>

      {tab === 'budget' && <BudgetTab gid={id} members={members} isOwner={isOwner} isLeft={isLeft} expenses={expenses} />}

      {tab === 'payments' && <PaymentsTab gid={id} members={members} me={user.id} isLeft={isLeft} onGoBudget={() => setTab('budget')} />}

      {tab === 'expenses' && (expenses.length === 0 ? <div className="card text-center text-sm text-muted">No expenses yet. Add the first one, like rent or electricity.</div> :
        <div className="card divide-y divide-line p-0">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 p-4 text-sm">
              <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-xl sm:h-11 sm:w-11">{catIcon(e.category)}</span><div className="min-w-0"><p className="truncate font-semibold">{e.title}</p><p className="break-words text-xs text-muted">{catLabel(e.category)} · paid by {name(e.paid_by)} · {format(parseISO(e.expense_date), 'MMM d, yyyy')} · {e.split_type}</p></div></div>
              <div className="flex shrink-0 items-center gap-3"><span className="font-medium">{peso(e.amount)}</span>
                {(isOwner || e.paid_by === user.id) && !isLeft && <button aria-label="Delete expense" onClick={() => delExpense(e.id)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:text-bad"><Trash2 size={15} /></button>}</div>
            </div>))}
        </div>)}

      {tab === 'balances' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-3 font-semibold">Who pays whom</h2>
            {expenses.length === 0 && <p className="mb-3 text-xs text-muted">Balances come from the Expenses tab. Add an expense to see who owes whom.</p>}
            {payments.length === 0 ? (
              <p className="text-sm text-muted">Everyone is settled up 🎉</p>
            ) : (
              <div className="divide-y divide-line">
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={name(p.from)} />
                      <p className="min-w-0 truncate"><span className="font-semibold">{name(p.from)}{leftTag(p.from)}</span> <span className="text-muted">pays</span> <span className="font-semibold">{name(p.to)}{leftTag(p.to)}</span></p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                      <span className="font-bold">{peso(p.amount)}</span>
                      {user.id === p.from && (
                        <button className="btn-ghost !px-3 !text-xs" onClick={() => { setSettleInit({ by: p.from, to: p.to, amount: String(p.amount) }); setTab('settlements'); setForm('settle') }}>Settle up</button>
                      )}
                      {user.id === p.to && <span className="text-xs text-muted">Waiting for payment</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <BudgetPaymentsCard gid={id} members={members} onOpenPayments={() => setTab('payments')} onGoBudget={() => setTab('budget')} />

          <div className="card divide-y divide-line p-0">
            {visibleBal.map((b) => { const n = netOf(b); return (
              <div key={b.user_id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div className="flex min-w-0 items-center gap-3"><Avatar name={name(b.user_id)} /><div className="min-w-0"><p className="truncate font-semibold">{name(b.user_id)}{leftTag(b.user_id)}</p><p className="break-words text-xs text-muted">Paid {peso(b.paid)} · Share {peso(b.shares)}</p></div></div>
                {n === 0
                  ? <span className="shrink-0 text-sm font-medium text-muted">Settled</span>
                  : <span className={`shrink-0 rounded-full bg-bg px-3 py-1 text-sm font-semibold ${n > 0 ? 'text-[#166534]' : 'text-[#991b1b]'}`}>{n > 0 ? `Gets back ${peso(n)}` : `Owes ${peso(-n)}`}</span>}
              </div>)})}
          </div>

          {zeroLeftBal.length > 0 && (
            <details className="card p-0">
              <summary className="cursor-pointer p-4 text-sm font-medium text-muted">Left members ({zeroLeftBal.length})</summary>
              <div className="divide-y divide-line border-t border-line">
                {zeroLeftBal.map((b) => (
                  <div key={b.user_id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm opacity-70">
                    <div className="flex min-w-0 items-center gap-3"><Avatar name={name(b.user_id)} /><div className="min-w-0"><p className="truncate font-semibold text-muted">{name(b.user_id)} <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-muted">Left</span></p><p className="break-words text-xs text-muted">Paid {peso(b.paid)} · Share {peso(b.shares)}</p></div></div>
                    <span className="shrink-0 text-sm font-medium text-muted">Settled</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>)}

      {tab === 'members' && (
        <div className="space-y-4">
          {isOwner && !isLeft && <form onSubmit={addMember} className="flex flex-col gap-2 sm:flex-row"><input name="email" type="email" required className="input w-full sm:max-w-xs" placeholder="Registered user's email" /><button className="btn w-full sm:w-auto">Add roommate</button></form>}
          <div className="card divide-y divide-line p-0">
            {activeMembers.length === 0 && <p className="p-4 text-sm text-muted">No active members.</p>}
            {activeMembers.map((m) => (
              <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={m.profiles?.full_name} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.profiles?.full_name} {m.role === 'owner' && <span className="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">owner</span>}</p>
                    <p className="truncate text-xs text-muted">{m.profiles?.email}</p>
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 gap-2">
                  {m.user_id === user.id && <button className="btn-ghost !min-h-[36px] !px-3 !py-1.5 !text-xs" onClick={() => leaveOrRemove(m.user_id)}>Leave apartment</button>}
                  {isOwner && !isLeft && m.user_id !== user.id && <button className="btn-ghost !min-h-[36px] !px-3 !py-1.5 !text-xs" onClick={() => leaveOrRemove(m.user_id)}>Remove</button>}
                </div>
              </div>
            ))}
          </div>

          {leftMembers.length > 0 && (
            <div className="space-y-2">
              <h2 className="px-1 text-sm font-semibold text-muted">Left members</h2>
              <div className="card divide-y divide-line p-0 opacity-70">
                {leftMembers.map((m) => (
                  <div key={m.user_id} className="flex min-w-0 items-center gap-3 p-4 text-sm">
                    <Avatar name={m.profiles?.full_name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-muted">{m.profiles?.full_name} <span className="ml-1 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-muted">Left</span></p>
                      <p className="truncate text-xs text-muted">{m.profiles?.email} · Left {format(new Date(m.left_at), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>)}

      {tab === 'settlements' && (settles.length === 0 ? <div className="card text-center text-sm text-muted">No payments recorded yet.</div> :
        <div className="card divide-y divide-line p-0">
          {settles.map((s) => (
            <div key={s.id} className="flex justify-between gap-3 p-4 text-sm">
              <div className="min-w-0 break-words">{name(s.paid_by)} paid {name(s.received_by)}<p className="text-xs text-muted">{format(parseISO(s.settlement_date), 'MMM d, yyyy')} {s.note && `· ${s.note}`}</p></div>
              <span className="shrink-0 font-medium">{peso(s.amount)}</span>
            </div>))}
        </div>)}
    </div>
  )
}

function ExpenseForm({ gid, members, me, onDone }) {
  const [f, setF] = useState({ title: '', description: '', amount: '', category: CATEGORIES[0], date: today(), paid_by: me, type: 'equal' })
  const [picked, setPicked] = useState(members.map((m) => m.user_id))
  const [custom, setCustom] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const toggle = (uid) => setPicked(picked.includes(uid) ? picked.filter((x) => x !== uid) : [...picked, uid])

  async function submit(e) {
    e.preventDefault()
    const cents = toCents(f.amount)
    if (!f.title.trim()) return toast.error('Title is required')
    if (cents <= 0) return toast.error('Amount must be greater than zero')
    if (picked.length === 0) return toast.error('Select at least one participant')
    const splits = f.type === 'equal' ? splitEqual(cents, picked) : picked.map((user_id) => ({ user_id, share: toCents(custom[user_id]) / 100 }))
    const sum = splits.reduce((s, x) => s + toCents(x.share), 0)
    if (sum !== cents) return toast.error(`Shares total ${peso(sum / 100)} but the expense is ${peso(cents / 100)}`)
    setBusy(true)
    const { error } = await supabase.rpc('create_expense', { p_group: gid, p_title: f.title.trim(), p_description: f.description, p_amount: cents / 100, p_category: f.category, p_paid_by: f.paid_by, p_split_type: f.type, p_date: f.date, p_splits: splits })
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Expense added'); onDone()
  }
  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="font-medium">Add expense</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label">Title</label><input className="input" value={f.title} onChange={set('title')} /></div>
        <div><label className="label">Amount (₱)</label><input type="number" step="0.01" min="0" className="input" value={f.amount} onChange={set('amount')} /></div>
        <div><label className="label">Category</label><select className="input" value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label">Date</label><input type="date" className="input" value={f.date} onChange={set('date')} /></div>
        <div><label className="label">Paid by</label><select className="input" value={f.paid_by} onChange={set('paid_by')}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></div>
        <div><label className="label">Split type</label><select className="input" value={f.type} onChange={set('type')}><option value="equal">Equal</option><option value="custom">Custom</option></select></div>
      </div>
      <div>
        <label className="label">Description (optional)</label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_PICKS.map((label) => {
            const selected = f.description === label
            return (
              <button key={label} type="button" onClick={() => setF({ ...f, description: selected ? '' : label })} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${selected ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-card text-ink hover:bg-primary-soft'}`}>{label}</button>
            )
          })}
        </div>
        <input className="input" value={f.description} onChange={set('description')} />
      </div>
      <div><label className="label">Participants</label>
        {members.map((m) => (
          <div key={m.user_id} className="flex min-h-[40px] items-center justify-between gap-3 py-2 text-sm">
            <label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={picked.includes(m.user_id)} onChange={() => toggle(m.user_id)} /><span className="truncate">{m.profiles?.full_name}</span></label>
            {f.type === 'custom' && picked.includes(m.user_id) && <input type="number" step="0.01" className="input w-28" placeholder="Share" value={custom[m.user_id] || ''} onChange={(e) => setCustom({ ...custom, [m.user_id]: e.target.value })} />}
          </div>))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row"><button className="btn w-full sm:w-auto" disabled={busy}>Save expense</button><button type="button" className="btn-ghost w-full justify-center sm:w-auto" onClick={onDone}>Cancel</button></div>
    </form>
  )
}

function SettleForm({ gid, members, balances = [], me, initial, onDone }) {
  const payerId = initial?.by || me
  const balMap = new Map(balances.map((b) => [b.user_id, netOf(b)]))
  const eligible = members.filter((m) => !m.left_at || Math.round((balMap.get(m.user_id) || 0) * 100) !== 0)
  const receivers = eligible.filter((m) => m.user_id !== payerId)
  const [f, setF] = useState({ to: initial?.to || eligible.filter((m) => m.user_id !== me)[0]?.user_id || '', amount: initial?.amount || '', note: '', date: today() })
  const payerName = members.find((m) => m.user_id === payerId)?.profiles?.full_name || ''
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault()
    const cents = toCents(f.amount)
    if (!f.to || cents <= 0) return toast.error('Choose a person and enter a valid amount')
    const { error } = await supabase.rpc('create_settlement', { p_group: gid, p_received_by: f.to, p_amount: cents / 100, p_note: f.note, p_date: f.date })
    if (error) return toast.error(error.message)
    toast.success('Settlement recorded'); onDone()
  }
  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="font-medium">{initial?.by && initial.by !== me ? 'Record a payment' : 'Record a payment you made'}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label">Paid by</label><input className="input" value={payerName} disabled /></div>
        <div><label className="label">Paid to</label><select className="input" value={f.to} onChange={set('to')}>{receivers.map((m) => <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></div>
        <div><label className="label">Amount (₱)</label><input type="number" step="0.01" min="0" className="input" value={f.amount} onChange={set('amount')} /></div>
        <div><label className="label">Date</label><input type="date" className="input" value={f.date} onChange={set('date')} /></div>
        <div><label className="label">Note (optional)</label><input className="input" value={f.note} onChange={set('note')} /></div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row"><button className="btn w-full sm:w-auto">Record settlement</button><button type="button" className="btn-ghost w-full justify-center sm:w-auto" onClick={onDone}>Cancel</button></div>
    </form>
  )
}