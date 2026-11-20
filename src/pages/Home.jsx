import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ClipboardList, Home as HomeIcon, Users, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PAYMENT_STATUS_STYLES } from '../utils/payments'
import GuideModal from '../components/GuideModal'

const STEPS = [
  {
    title: 'Set the monthly bills',
    body: 'Rent, electricity, water and internet. See how much each person pays.',
    icon: ClipboardList,
  },
  {
    title: 'Record who paid',
    body: "Track each housemate's payment and shared costs.",
    icon: Wallet,
  },
  {
    title: 'See who owes whom',
    body: 'The simplest way to pay everyone back.',
    icon: Users,
  },
]

const SAMPLE_MEMBERS = [
  { name: 'Ana', status: 'Paid', style: PAYMENT_STATUS_STYLES.paid },
  { name: 'Ben', status: 'Partial', style: PAYMENT_STATUS_STYLES.partial },
  { name: 'Carl', status: 'Unpaid', style: PAYMENT_STATUS_STYLES.unpaid },
]

export default function Home() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, activeId: null, pastId: null })
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    let active = true
    supabase.from('group_members').select('group_id,left_at').eq('user_id', user.id)
      .then(({ data }) => {
        if (!active) return
        const rows = data || []
        const current = rows.find((m) => !m.left_at)?.group_id || null
        const past = rows
          .filter((m) => m.left_at)
          .sort((a, b) => new Date(b.left_at) - new Date(a.left_at))[0]?.group_id || null
        setState({ loading: false, activeId: current, pastId: past })
      })
    return () => { active = false }
  }, [user?.id])

  if (state.loading) return <p className="text-muted">Loading...</p>
  if (state.activeId) return <Navigate to={`/groups/${state.activeId}`} replace />

  return (
    <>
      <div className="mx-auto w-full max-w-3xl space-y-10 py-8 sm:space-y-14 sm:py-12">
        <section className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-soft text-primary">
            <HomeIcon size={36} strokeWidth={1.8} />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-ink">Welcome to SplitMate</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">Split rent and bills with your housemates, without the confusion.</p>
          <div className="mt-7 flex w-full max-w-xs flex-col items-center gap-2">
            <Link to="/groups" state={{ create: true }} className="btn w-full !min-h-[44px]">Set up your apartment</Link>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex min-h-[44px] items-center justify-center px-2 text-xs font-medium text-muted underline decoration-line underline-offset-4 transition hover:text-primary"
            >
              How to use SplitMate
            </button>
            {state.pastId && (
              <Link to={`/groups/${state.pastId}`} className="inline-flex min-h-[36px] items-center justify-center px-2 text-xs font-medium text-muted transition hover:text-primary">
                View my past apartment
              </Link>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-center text-lg font-semibold text-ink">How it works</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon
              return (
                <div key={step.title} className="card flex flex-col items-start gap-3 text-left">
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">{index + 1}</span>
                    <Icon size={20} className="shrink-0 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-ink">{step.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{step.body}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="card relative">
          <span className="absolute right-4 top-4 rounded-full bg-bg px-2.5 py-1 text-[11px] font-medium text-muted sm:right-5 sm:top-5">Sample only</span>
          <h2 className="pr-24 text-lg font-bold tracking-tight text-ink">Example: 4 housemates</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-line">
            <div className="divide-y divide-line">
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 text-muted">Total monthly bills</span>
                <span className="shrink-0 font-semibold">₱8,300.00</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 text-muted">Each pays</span>
                <span className="shrink-0 font-semibold">₱2,075.00</span>
              </div>
              {SAMPLE_MEMBERS.map((member) => (
                <div key={member.name} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate font-medium text-ink">{member.name}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${member.style}`}>{member.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <p className="mx-auto max-w-md text-center text-xs leading-5 text-muted">One account, one apartment. Each housemate needs their own account.</p>
      </div>
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  )
}
