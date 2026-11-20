import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { HelpCircle, LogOut, Wallet } from 'lucide-react'
import { useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { Avatar } from './utils/ui'
import GuideModal from './components/GuideModal'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Groups from './pages/Groups'
import GroupDetail from './pages/GroupDetail'
import ResetPassword from './pages/ResetPassword'

function Header() {
  const { user } = useAuth()
  const location = useLocation()
  const [memberships, setMemberships] = useState(null)
  const [openMenu, setOpenMenu] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const menusRef = useRef(null)

  const loadApartment = useCallback(async () => {
    if (!user?.id) { setMemberships([]); return }
    const { data } = await supabase.from('group_members').select('group_id,left_at,groups(id,name)').eq('user_id', user.id)
    setMemberships(data || [])
  }, [user?.id])

  const currentGroupId = location.pathname.match(/^\/groups\/([^/]+)\/?$/)?.[1] || null

  useEffect(() => { loadApartment() }, [loadApartment, currentGroupId])

  useEffect(() => { setOpenMenu(null) }, [location.pathname, location.search])

  useEffect(() => {
    if (!openMenu) return
    const onPointerDown = (e) => {
      if (!menusRef.current?.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [openMenu])

  const apartment = (memberships || []).find((m) => !m.left_at)?.groups || null
  const logoTo = apartment ? `/groups/${apartment.id}` : '/'
  const name = user?.user_metadata?.full_name || user?.email || 'You'

  async function logOut() {
    setOpenMenu(null)
    await supabase.auth.signOut()
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-header">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 md:h-16 md:px-8">
          <Link to={logoTo} className="flex shrink-0 items-center gap-2 text-base font-bold tracking-tight text-ink sm:text-lg">
            <span className="rounded-xl bg-primary p-1.5 text-white"><Wallet size={18} /></span>
            <span>SplitMate</span>
          </Link>

          <div ref={menusRef} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1 px-1">
              {apartment ? (
                <p className="truncate text-sm font-semibold text-ink">{apartment.name}</p>
              ) : memberships === null ? (
                <p className="text-sm text-muted">Loading...</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-ink">Welcome</p>
                  <Link to="/" className="block truncate text-xs font-medium text-muted transition hover:text-primary">Set up your apartment</Link>
                </>
              )}
            </div>

            <button
              type="button"
              aria-label="How to use SplitMate"
              onClick={() => { setOpenMenu(null); setGuideOpen(true) }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-card text-muted transition hover:bg-primary-soft hover:text-primary"
            >
              <HelpCircle size={18} />
            </button>

            <div className="relative shrink-0">
              <button className="flex items-center" aria-label="Account menu" aria-haspopup="menu" aria-expanded={openMenu === 'user'} onClick={() => setOpenMenu(openMenu === 'user' ? null : 'user')}>
                <Avatar name={name} size="h-9 w-9" />
              </button>

              {openMenu === 'user' && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw_-_4rem)] rounded-2xl border border-line bg-card p-2 shadow-card" role="menu">
                  <div className="flex items-center gap-3 px-2 py-2">
                    <Avatar name={name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      <p className="truncate text-xs text-muted">{user?.email}</p>
                    </div>
                  </div>
                  <button role="menuitem" onClick={logOut} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-bg"><LogOut size={16} className="shrink-0 text-muted" />Log out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  )
}

function Shell() {
  const { session, recovery } = useAuth()
  if (session === undefined) return <div className="p-10 text-muted">Loading...</div>
  if (!session) return <Navigate to="/login" replace />
  if (recovery) return <ResetPassword />
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto w-full max-w-5xl p-4 pb-10 sm:p-6 md:p-8"><Outlet /></main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Auth />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Home />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
