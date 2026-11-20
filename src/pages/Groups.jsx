import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import GuideModal, { hasSeenGuide, markGuideSeen } from '../components/GuideModal'

export default function Groups() {
  const { user } = useAuth()
  const [memberships, setMemberships] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [f, setF] = useState({ name: '', description: '' })

  const load = async () => {
    if (!user?.id) return []
    const { data } = await supabase.from('group_members').select('group_id,left_at').eq('user_id', user.id)
    const rows = data || []
    setMemberships(rows)
    return rows
  }

  useEffect(() => { load() }, [user?.id])

  const active = (memberships || []).find((m) => !m.left_at) || null
  const past = (memberships || [])
    .filter((m) => m.left_at)
    .sort((a, b) => new Date(b.left_at) - new Date(a.left_at))[0] || null

  async function create(e) {
    e.preventDefault()
    if (!f.name.trim()) return toast.error('Apartment name is required')
    const isFirstApartment = memberships?.length === 0
    const { error } = await supabase.from('groups').insert({ name: f.name.trim(), description: f.description, created_by: user.id })
    if (error) {
      if (error.code === '23505' || /one_active_apartment_per_user/i.test(error.message || '')) {
        return toast.error('You are already in an apartment. Leave it first, or use a different account to create a new one.')
      }
      return toast.error(error.message)
    }
    toast.success('Apartment created')
    setF({ name: '', description: '' })
    if (isFirstApartment && !hasSeenGuide()) {
      markGuideSeen()
      setGuideOpen(true)
    }
    load()
  }

  if (memberships === null) return <p className="text-muted">Loading...</p>
  if (active && !guideOpen) return <Navigate to={`/groups/${active.group_id}`} replace />

  return (
    <>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card w-full max-w-md space-y-4 text-center">
          <h1 className="text-xl font-bold tracking-tight">Welcome to SplitMate</h1>
          <p className="text-sm text-muted">Set up your apartment to start splitting rent and bills with your roommates.</p>
          <form onSubmit={create} className="space-y-3 text-left">
            <div><label className="label">Apartment name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label className="label">Description</label><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
            <button className="btn w-full">Create apartment</button>
          </form>
          {past && (
            <Link to={`/groups/${past.group_id}`} className="block text-xs font-medium text-muted transition hover:text-primary">
              View my past apartment
            </Link>
          )}
        </div>
      </div>
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  )
}
