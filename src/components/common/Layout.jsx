import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'

const navItems = [
  { to: '/', label: 'Concepts', icon: '{}' },
  { to: '/builder', label: 'Art Builder', icon: '+' },
  { to: '/builder-v2', label: 'Prompt Builder', icon: '✦' },
  { to: '/gallery', label: 'Art Gallery', icon: '#' },
  { to: '/collections', label: 'Collections', icon: '◇' },
  { to: '/mockups', label: 'Mockup Builder', icon: '~' },
  { to: '/mockup-gallery', label: 'Mockup Gallery', icon: '#' },
  { to: '/videos', label: 'Video Gallery', icon: '▶' },
  { to: '/batch-video', label: 'Batch Video', icon: '⏩' },
  { to: '/batch', label: 'Mug Batch', icon: '▦' },
  { to: '/bundle-maker', label: 'Bundle Maker', icon: '⊞' },
  { to: '/queue', label: 'Queue', icon: '>' },
  { to: '/analysis', label: 'Analysis', icon: '{}' },
  { to: '/stats', label: 'Statistics', icon: '📊' },
  { to: '/settings/etsy', label: 'Etsy', icon: 'E' },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const { documents: images } = useCollection('images', [], null)

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <nav
        className="w-56 flex-shrink-0 flex flex-col border-r"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
            Gamer Art Factory
          </h1>
          <p className="text-xs mt-1 font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {images.length.toLocaleString()} images generated
          </p>
        </div>

        <div className="flex-1 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive ? 'font-medium' : ''
                }`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? 'var(--color-surface-hover)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              })}
            >
              <span className="font-mono text-xs w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs truncate mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {user?.email}
          </p>
          <button
            onClick={signOut}
            className="text-xs cursor-pointer hover:underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
