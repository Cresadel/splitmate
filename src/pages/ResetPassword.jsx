import { useState } from 'react'
import toast from 'react-hot-toast'
import { Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function ResetPassword() {
  const { setRecovery } = useAuth()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (pw.length < 6) return toast.error('Password must be at least 6 characters')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Password updated')
    setRecovery(false)
  }
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-2 text-ink"><span className="rounded-xl bg-primary p-2 text-white"><Wallet size={20} /></span><span className="text-xl font-bold tracking-tight">SplitMate</span></div>
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 !p-5 sm:!p-7">
        <h1 className="text-xl font-bold tracking-tight">Set a new password</h1>
        <div><label className="label">New password</label><input type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <button className="btn w-full" disabled={busy}>{busy ? 'Please wait...' : 'Update password'}</button>
      </form>
    </div>
  )
}
