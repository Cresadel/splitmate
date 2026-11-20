import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export const GUIDE_SEEN_KEY = 'splitmate_guide_seen'

export function hasSeenGuide() {
  try {
    return localStorage.getItem(GUIDE_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markGuideSeen() {
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, '1')
  } catch {}
}

const STEPS = [
  {
    title: 'Add your housemates',
    body: 'Go to Roommates and add each person by their registered email. Everyone needs their own account, and one account can only be in one apartment.',
  },
  {
    title: 'Set the monthly budget',
    body: 'In Budget, add rent, electricity, water, internet and other monthly costs. SplitMate shows how much each person pays.',
  },
  {
    title: 'Record who paid their share',
    body: 'In Payments, the owner records each person\'s payment for the month. Everyone can see the status: Paid, Partial, Unpaid or Advance. Extra money paid carries over to the next month.',
  },
  {
    title: 'Add shared costs',
    body: 'In Expenses, record a cost that one person paid for everyone, like groceries or repairs. Choose who shares it.',
  },
  {
    title: 'See who owes whom',
    body: 'Balances shows the simplest way to pay everyone back.',
  },
  {
    title: 'Settle up',
    body: 'When someone pays back a debt, record it in Settlements so the balance updates.',
  },
  {
    title: 'Leaving the apartment',
    body: 'A person who leaves stays in the history until their balance is settled.',
  },
]

export default function GuideModal({ open, onClose }) {
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/45 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-card shadow-card sm:max-h-[85dvh] sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 id="guide-title" className="text-lg font-bold tracking-tight text-ink">How to use SplitMate</h2>
            <p className="mt-0.5 text-xs text-muted">A quick guide to keeping your apartment in sync.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close guide"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-card text-muted transition hover:bg-primary-soft hover:text-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
          <ol className="space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">{index + 1}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{step.title}</p>
                  <p className="mt-0.5 text-sm leading-6 text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>,
    document.body,
  )
}
