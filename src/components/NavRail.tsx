import {
  MessageSquareText,
  CircleDashed,
  Users,
  Phone,
  Star,
  Archive,
  Settings,
  Moon,
  Sun,
  Palette,
  LogOut
} from 'lucide-react';
import { Avatar } from './Avatar';
import type { NavTab, ThemeMode, UserProfile } from '../types/chat';

interface NavRailProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  totalUnread: number;
  archivedCount: number;
  theme: ThemeMode;
  onToggleTheme: () => void;
  currentUser: UserProfile;
  hideMobileNav?: boolean;
  onSignOut?: () => void;
}

export function NavRail({
  activeTab,
  onSelectTab,
  totalUnread,
  archivedCount,
  theme,
  onToggleTheme,
  currentUser,
  hideMobileNav = false,
  onSignOut
}: NavRailProps) {
  const navItems: { id: NavTab; label: string; icon: typeof MessageSquareText; badge?: number }[] = [
    { id: 'chats', label: 'الدردشات', icon: MessageSquareText, badge: totalUnread },
    { id: 'status', label: 'الحالات', icon: CircleDashed },
    { id: 'communities', label: 'المجتمعات', icon: Users },
    { id: 'calls', label: 'المكالمات', icon: Phone },
    { id: 'starred', label: 'المميزة بنجمة', icon: Star },
    { id: 'archived', label: 'المؤرشفة', icon: Archive, badge: archivedCount },
    { id: 'omar', label: 'إضافات وثيمات أكرم', icon: Palette }
  ];

  return (
    <>
      {/* Desktop Vertical Rail */}
      <nav
        aria-label="القائمة الرئيسية"
        className="hidden md:flex flex-col items-center justify-between w-16 shrink-0 bg-[#F0F2F5] dark:bg-[#202C33] border-l border-[#E9EDEF] dark:border-[#222D34] py-3 select-none"
      >
        <div className="flex flex-col items-center gap-2 w-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                onClick={() => onSelectTab(item.id)}
                className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)]'
                    : 'text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942]/60'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--wa-accent)] text-white text-[10px] font-bold flex items-center justify-center font-mono-code">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-2.5 w-full">
          <button
            type="button"
            aria-label={theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
            title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
            onClick={onToggleTheme}
            className="w-11 h-11 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942]/60 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Moon className="w-5 h-5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            aria-label="الإعدادات"
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            title="الإعدادات"
            onClick={() => onSelectTab('settings')}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)]'
                : 'text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942]/60'
            }`}
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="ملفي الشخصي"
            title={currentUser.displayName}
            onClick={() => onSelectTab('settings')}
            className="mt-1 rounded-full focus-visible:outline-2 focus-visible:outline-[var(--wa-accent)] cursor-pointer"
          >
            <Avatar src={currentUser.avatarUrl} name={currentUser.displayName} size="sm" isOnline />
          </button>

          {onSignOut && (
            <button
              type="button"
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
              onClick={onSignOut}
              className="w-11 h-11 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
            >
              <LogOut className="w-4.5 h-4.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Bottom Tab Bar (compact, safe-area aware, thumb-friendly) */}
      {!hideMobileNav && (
        <nav
          aria-label="شريط التنقل للجوال"
          className="md:hidden fixed bottom-0 left-0 right-0 z-30 min-h-[58px] pb-safe bg-white/95 dark:bg-[#202C33]/95 backdrop-blur-md border-t border-[#E9EDEF] dark:border-[#222D34] grid grid-cols-5 items-center px-1"
        >
          {[
            { id: 'chats' as NavTab, label: 'الدردشات', icon: MessageSquareText, badge: totalUnread },
            { id: 'status' as NavTab, label: 'الحالات', icon: CircleDashed },
            { id: 'communities' as NavTab, label: 'القنوات', icon: Users },
            { id: 'calls' as NavTab, label: 'المكالمات', icon: Phone },
            { id: 'settings' as NavTab, label: 'الإعدادات', icon: Settings }
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(item.id)}
                className={`relative min-h-[46px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                  isActive ? 'text-[var(--wa-accent-strong)] font-bold' : 'text-[#54656F] dark:text-[#8696A0]'
                }`}
              >
                <div
                  className={`relative px-3 py-0.5 rounded-full transition-colors ${
                    isActive ? 'bg-[var(--wa-accent-soft)]' : ''
                  }`}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="absolute -top-1 -left-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--wa-accent)] text-white text-[9px] font-bold flex items-center justify-center font-mono-code">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="truncate max-w-full px-0.5">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
}
