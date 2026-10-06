import { NavLink, Outlet } from 'react-router-dom';
import {
  HomeIcon,
  SparklesIcon,
  BeakerIcon,
  QueueListIcon,
  PhotoIcon,
  RectangleStackIcon,
  ChartBarIcon,
  CogIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Concepts', href: '/', icon: HomeIcon },
  { name: 'Builder 2.0', href: '/builder-v2', icon: SparklesIcon },
  { name: 'Builder', href: '/builder', icon: BeakerIcon },
  { name: 'Queue', href: '/queue', icon: QueueListIcon },
  { name: 'Gallery', href: '/gallery', icon: PhotoIcon },
  { name: 'Collections', href: '/collections', icon: RectangleStackIcon },
  { name: 'Videos', href: '/videos', icon: VideoCameraIcon },
  { name: 'Stats', href: '/stats', icon: ChartBarIcon },
  { name: 'Settings', href: '/settings/etsy', icon: CogIcon },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col w-64 border-r border-white/10">
        <div className="flex items-center h-16 px-6 border-b border-white/10">
          <h1 className="text-lg font-semibold text-white">Gamer Art Factory</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                classNames(
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-md',
                  isActive ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                )
              }
            >
              <item.icon className="mr-3 h-6 w-6 flex-shrink-0" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}