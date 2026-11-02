import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { authErrorMessage } from '../../lib/authErrors'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'

// Supabase allows one verification email per address per minute (auth.email.max_frequency).
export const RESEND_COOLDOWN_SECONDS = 60

export default function ResendVerification({ email }) {
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function resend() {
    if (cooldown > 0) return
    setSending(true)
    setResult(null)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setSending(false)
    if (error) {
      setResult({ tone: 'error', text: authErrorMessage(error) })
      return
    }
    setResult({ tone: 'success', text: `Verification email sent to ${email}.` })
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  return (
    <div className="space-y-3">
      {result && <Alert tone={result.tone}>{result.text}</Alert>}
      {/* aria-disabled rather than disabled so keyboard focus stays on the button during the cooldown */}
      <Button variant="secondary" onClick={resend} loading={sending} aria-disabled={cooldown > 0 || undefined}>
        {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend verification email'}
      </Button>
    </div>
  )
}
