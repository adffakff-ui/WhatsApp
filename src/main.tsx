import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { injectSpeedInsights } from '@vercel/speed-insights';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisterError() {
      // Ignore registration errors in sandboxed iframes
    }
  });
}

// Initialize Vercel Speed Insights
injectSpeedInsights();

createRoot(document.getElementById('root')!).render(<App />);
