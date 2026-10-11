import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { signInWithGoogle, logOut, firebaseEnabled, describeAuthError } from '../lib/firebase';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon, BubbleMark } from './ui';

const navItems = [
  { path: '/', icon: 'home', label: 'Dashboard' },
  { path: '/builder', icon: 'edit_note', label: 'Sheet Builder' },
  { path: '/scan', icon: 'document_scanner', label: 'Scan Sheets' },
  { path: '/history', icon: 'library_books', label: 'Test History' },
  { path: '/analytics', icon: 'monitoring', label: 'Score Analytics' },
  { path: '/settings', icon: 'tune', label: 'Settings' },
];

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const location = useLocation();
  const user = useStore(state => state.user);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setSignInError(describeAuthError(e));
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-ink/40 z-20 md:hidden transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <motion.nav
        initial={false}
        animate={{ width: isCollapsed ? 76 : 248 }}
        className={`bg-form border-r border-hairline flex flex-col h-screen shrink-0 fixed left-0 top-0 z-30 transition-transform md:transition-none duration-300 ease-in-out md:translate-x-0 md:relative ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'} md:w-auto`}
      >
        {/* Wordmark — a marked bubble row */}
        <div className={`mt-5 mb-7 flex flex-col ${isCollapsed ? 'px-3' : 'px-5'} overflow-hidden whitespace-nowrap`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <Link to="/" className={`flex items-center gap-3 ${isCollapsed ? 'justify-center w-full' : ''}`} onClick={onClose}>
              <span className="w-9 h-9 rounded-md bg-mark text-on-mark flex items-center justify-center shrink-0">
                <BubbleMark size={6} />
              </span>
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col"
                  >
                    <span className="font-display text-[22px] font-bold leading-none text-ink">GradeStack</span>
                    <span className="text-[11px] text-pencil leading-tight mt-0.5">Bubble sheet grading</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </Link>

            {!isCollapsed && (
              <button
                className="hidden md:flex text-faint p-1.5 rounded-md hover:bg-surface-container-low hover:text-ink shrink-0 transition-colors"
                onClick={() => setIsCollapsed(true)}
                title="Collapse sidebar"
              >
                <Icon name="keyboard_double_arrow_left" size={18} />
              </button>
            )}

            <button className={`md:hidden text-pencil p-1.5 rounded-md hover:bg-surface-container-low ${isCollapsed ? 'hidden' : ''}`} onClick={onClose} title="Close menu">
              <Icon name="close" size={20} />
            </button>
          </div>
          {isCollapsed && (
            <button
              className="hidden md:flex mt-2 mx-auto text-faint p-1.5 rounded-md hover:bg-surface-container-low hover:text-ink transition-colors"
              onClick={() => setIsCollapsed(false)}
              title="Expand sidebar"
            >
              <Icon name="keyboard_double_arrow_right" size={18} />
            </button>
          )}
        </div>

        <div className={isCollapsed ? 'px-3' : 'px-4'}>
          <Link
            to="/builder"
            onClick={onClose}
            className={`w-full bg-mark text-on-mark py-2.5 rounded-md mb-6 hover:bg-mark-deep transition-colors flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-center gap-2 px-4'}`}
            title="New assessment"
          >
            <Icon name="add" size={18} />
            {!isCollapsed && <span className="whitespace-nowrap font-semibold text-sm">New assessment</span>}
          </Link>
        </div>

        {/* Nav — each destination is a bubble on the sheet */}
        <ul className={`flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden ${isCollapsed ? 'px-3' : 'px-4'}`}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onClose}
                  title={isCollapsed ? item.label : undefined}
                  className={`flex items-center ${isCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'} rounded-md transition-colors group ${
                    isActive
                      ? 'bg-mark-mist text-mark-deep'
                      : 'text-pencil hover:bg-surface-container-low hover:text-ink'
                  }`}
                >
                  <span
                    data-filled={isActive}
                    className="bubble shrink-0"
                    style={{ width: 26, height: 26 }}
                  >
                    <Icon name={item.icon} size={15} fill={isActive} />
                  </span>
                  {!isCollapsed && (
                    <span className={`text-sm whitespace-nowrap ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className={`border-t border-hairline py-4 ${isCollapsed ? 'px-3' : 'px-4'}`}>
          {user ? (
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-2'} w-full rounded-md hover:bg-surface-container-low cursor-pointer py-2`} onClick={logOut} title="Sign out">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full shrink-0 object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-mark-mist text-mark-deep flex items-center justify-center shrink-0">
                  <Icon name="person" size={16} />
                </div>
              )}
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-ink text-sm">{user.displayName || 'User'}</p>
                  <p className="text-faint text-xs">Signed in — sync on</p>
                </div>
              )}
            </div>
          ) : firebaseEnabled ? (
            <div>
              <button onClick={() => void handleSignIn()} className={`flex items-center justify-center ${isCollapsed ? 'p-2' : 'gap-2 px-2 py-2'} w-full border border-hairline-strong rounded-md hover:bg-surface-container-low transition-colors text-ink`} title="Sign in to sync">
                <Icon name="login" size={18} />
                {!isCollapsed && <span className="text-sm font-medium whitespace-nowrap">Sign in to sync</span>}
              </button>
              {signInError && (
                <p className="text-red text-xs leading-relaxed mt-2 px-1" title={signInError}>
                  {isCollapsed ? 'Sign-in failed' : signInError}
                </p>
              )}
            </div>
          ) : (
            !isCollapsed && (
              <p className="text-xs text-faint leading-relaxed px-2">
                Working offline — data stays in this browser.
              </p>
            )
          )}
        </div>
      </motion.nav>
    </>
  );
}
