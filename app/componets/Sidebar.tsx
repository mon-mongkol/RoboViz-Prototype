'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  open: boolean;
}

export default function Sidebar({ open }: SidebarProps) {
  const pathname = usePathname();

  const menu = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Settings', href: '/dashboard/settings' },
  ];

  return (
    <aside
      className={`
        fixed left-0 top-0 h-screen bg-gray-900 text-white
        transition-all duration-300
        ${open ? 'w-64' : 'w-16'}
      `}
    >
      <div className="h-16 flex items-center justify-center font-bold border-b border-gray-700">
        {open ? 'My App' : '🚀'}
      </div>

      <nav className="mt-2 flex flex-col gap-1 px-2">
        {menu.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 p-2 rounded hover:bg-gray-800
              ${pathname === item.href ? 'bg-gray-700' : ''}
            `}
          >
            <span className="text-lg">📁</span>
            {open && <span>{item.name}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  );
}