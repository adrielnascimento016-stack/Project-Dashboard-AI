'use client';

import { useAuth } from '@/components/auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, LayoutDashboard, MessageSquare, Users, Bike, ChevronLeft, ChevronRight } from 'lucide-react';
import { auth } from '@/lib/firebase';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user || !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Insight Chat', href: '/dashboard/chat', icon: MessageSquare },
  ];

  if (profile.role === 'admin') {
    navItems.push({ name: 'Usuários', href: '/dashboard/users', icon: Users });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans selection:bg-cyan-500/30">
      {/* Sidebar */}
      <aside 
        className={`${isCollapsed ? 'w-20' : 'w-64'} transition-all duration-300 ease-in-out bg-white/80 backdrop-blur-xl border-r border-slate-200 flex flex-col relative z-20`}
      >
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-8 bg-white border border-slate-200 rounded-full p-1 text-slate-500 hover:text-cyan-600 hover:border-cyan-500/50 transition-colors z-30"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3'}`}>
          <div className="bg-cyan-500/10 border border-cyan-500/20 p-2 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.15)] flex-shrink-0">
            <Bike className="w-6 h-6 text-cyan-500" />
          </div>
          {!isCollapsed && <span className="font-bold text-lg tracking-tight text-slate-900 whitespace-nowrap">Moto Analytics</span>}
        </div>

        <nav className="flex-1 px-3 space-y-2 mt-4 overflow-hidden">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed ? item.name : undefined}
                className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 py-3 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'bg-cyan-500/10 text-cyan-600 font-medium border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50 border border-transparent'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && <span className="whitespace-nowrap">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} mb-4 px-2`}>
            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-sm font-medium text-cyan-600 flex-shrink-0">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{profile.name}</p>
                <p className="text-xs text-slate-500 capitalize">{profile.role}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => auth.signOut()}
            title={isCollapsed ? 'Sair' : undefined}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-2'} px-3 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-500/10 rounded-xl transition-colors`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!isCollapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-50 relative">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
