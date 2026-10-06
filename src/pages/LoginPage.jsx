import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm p-8 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
        <h1 className="text-2xl font-bold mb-1 text-center" style={{ color: 'var(--color-primary)' }}>
          Gamer Art Factory
        </h1>
        <p className="text-sm text-center mb-6" style={{ color: 'var(--color-text-muted)' }}>
          Sign in to continue
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
              borderColor: 'var(--color-border)',
              border: '1px solid var(--color-border)',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
              borderColor: 'var(--color-border)',
              border: '1px solid var(--color-border)',
            }}
          />
          {error && (
            <p className="text-sm" style={{ color: 'var(--color-reject)' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
