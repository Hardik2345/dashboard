import { useEffect, useRef } from 'react';
import { sendHeartbeat } from '../lib/api.js';

const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const MIN_GAP_MS = 60 * 1000; // avoid duplicate noise under 60s
const LONG_INACTIVE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function getPath() {
  try {
    return `${window.location.pathname || ''}${window.location.search || ''}`.slice(0, 180);
  } catch {
    return '';
  }
}

function getVisibility() {
  try {
    return document.visibilityState || 'visible';
  } catch {
    return 'visible';
  }
}

function sendHeartbeatBeacon(meta) {
  try {
    if (navigator.sendBeacon) {
      const base = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
      const blob = new Blob([JSON.stringify({ meta })], { type: 'application/json' });
      navigator.sendBeacon(`${base}/activity/heartbeat`, blob);
      return;
    }
  } catch {
    // Fallback to standard heartbeat call
  }
  sendHeartbeat(meta);
}

export default function useSessionHeartbeat(enabled) {
  const lastSentRef = useRef(0);
  const lastInactiveRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return () => {};

    let cancelled = false;

    const doSend = (trigger) => {
      if (cancelled) return;
      const now = Date.now();
      if (trigger !== 'focus-long' && now - lastSentRef.current < MIN_GAP_MS) return;
      lastSentRef.current = now;
      const idleMs = Math.max(0, now - lastInactiveRef.current);
      const meta = {
        trigger,
        visibility: getVisibility(),
        path: getPath(),
      };
      if (trigger === 'focus-long') meta.idleMs = idleMs;
      sendHeartbeat(meta);
    };

    doSend('init');

    const intervalId = window.setInterval(() => doSend('interval'), HEARTBEAT_INTERVAL_MS);

    const handleFocus = () => {
      const now = Date.now();
      const idleMs = now - lastInactiveRef.current;
      if (idleMs >= LONG_INACTIVE_THRESHOLD_MS) {
        doSend('focus-long');
      } else {
        doSend('focus');
      }
    };

    const handleBlur = () => {
      lastInactiveRef.current = Date.now();
    };

    const handleVisibility = () => {
      if (getVisibility() === 'visible') {
        handleFocus();
      } else {
        lastInactiveRef.current = Date.now();
      }
    };

    const handleBeforeUnload = () => {
      lastInactiveRef.current = Date.now();
      const meta = {
        trigger: 'unload',
        visibility: getVisibility(),
        path: getPath(),
      };
      sendHeartbeatBeacon(meta);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled]);
}
