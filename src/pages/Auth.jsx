import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Auth() {
  const { session } = useAuth()
  const [mode, setMode] = useState('login') // login | register | reset
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  if (session) return <Navigate to="/" replace />
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    if (!f.email) return toast.error('Email is required')
    if (mode !== 'reset' && f.password.length < 6) return toast.error('Password must be at least 6 characters')
    if (mode === 'register' && (!f.name.trim() || f.password !== f.confirm)) return toast.error('Check your name and that passwords match')
    setBusy(true)
    let error
    if (mode === 'login') ({ error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password }))
    else if (mode === 'register') {
      let data; ({ data, error } = await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.name.trim() }, emailRedirectTo: window.location.origin } }))
      if (!error && !data.session) toast.success('Check your email to confirm your account')
    } else {
      ({ error } = await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: window.location.origin }))
      if (!error) toast.success('Password reset email sent')
    }
    setBusy(false)
    if (error) toast.error(error.message)
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) toast.error(error.message)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center flex-col gap-6 p-4">
      <div className="text-center text-ink"><div className="mx-auto mb-3 flex w-fit items-center gap-2"><span className="rounded-xl bg-primary p-2 text-white"><Wallet size={20} /></span><span className="text-xl font-bold tracking-tight">SplitMate</span></div><p className="text-sm text-muted">Plan, split and settle shared costs.</p></div>
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 !p-5 sm:!p-7" autoComplete="off">
        <h1 className="text-xl font-bold tracking-tight">{mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset password'}</h1>
        {mode === 'register' && <div><label className="label">Full name</label><input className="input" value={f.name} onChange={set('name')} /></div>}
        <div><label className="label">Email</label><input type="email" className="input" autoComplete="off" value={f.email} onChange={set('email')} /></div>
        {mode !== 'reset' && (
          <div><label className="label">Password</label>
            <div className="relative"><input type={show ? 'text' : 'password'} className="input pr-12" autoComplete="new-password" value={f.password} onChange={set('password')} />
              <button type="button" aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted" onClick={() => setShow(!show)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
        )}
        {mode === 'register' && <div><label className="label">Confirm password</label><input type="password" className="input" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} /></div>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : 'Send reset link'}</button>
        {mode !== 'reset' && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            <button type="button" onClick={google} className="btn-ghost w-full justify-center">Continue with Google</button>
          </>
        )}
        <div className="flex justify-between text-xs font-medium text-ink">
          {mode === 'login' ? <><button type="button" onClick={() => setMode('register')}>Create account</button><button type="button" onClick={() => setMode('reset')}>Forgot password?</button></>
            : <button type="button" onClick={() => setMode('login')}>Back to login</button>}
        </div>
      </form>
    </div>
  )
}
