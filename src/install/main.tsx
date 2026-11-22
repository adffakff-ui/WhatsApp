import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { InstallPortal } from './InstallPortal';
import '../index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisterError() {
      // Ignore registration errors in sandboxed iframes
    }
  });
}

createRoot(document.getElementById('install-root')!).render(<InstallPortal />);
