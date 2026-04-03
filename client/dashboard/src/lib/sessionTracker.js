import { doPost } from './api';

const SESSION_META_KEY = 'datum_session_meta';
const SESSION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generates a unique session ID.
 * Uses crypto.randomUUID if available, otherwise falls back to a simple UUID-like string.
 */
function generateSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `sess_${crypto.randomUUID()}`;
  }
  // Fallback
  return `sess_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
}

/**
 * Collects browser/device metadata for the session.
 */
function getBrowserMetadata() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * Initializes session tracking.
 * Checks localStorage for existing session and decides whether to create a new one.
 */
export async function initializeSessionTracking(user, brandKey) {
  if (!user || !user.id && !user._id) return;

  const userId = user.id || user._id;
  const email = user.email;
  const isAdmin = !!user.isAuthor;
  const now = new Date();

  // 1. Read existing metadata
  console.log("[SessionTracker] Initializing session tracking check...", { brandKey, userId });
  let sessionMeta = null;
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    if (raw) {
      sessionMeta = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to parse session meta from localStorage', e);
  }

  // 2. Check if we need a new session
  let shouldCreateNew = false;
  if (!sessionMeta || sessionMeta.userId !== userId) {
    console.log("[SessionTracker] No existing session meta found or user mismatch. Proceeding with new registration.");
    shouldCreateNew = true;
  } else {
    const lastSessionStartedAt = new Date(sessionMeta.lastSessionStartedAt);
    if (isNaN(lastSessionStartedAt.getTime()) || (now - lastSessionStartedAt) > SESSION_WINDOW_MS) {
      console.log("[SessionTracker] Existing session expired. Proceeding with new registration.");
      shouldCreateNew = true;
    }
  }

  if (!shouldCreateNew) {
    console.log('[SessionTracker] Within 30-min window, skipping new session creation.');
    return;
  }

  // 3. Create new session object
  const sessionId = generateSessionId();
  const sessionPayload = {
    sessionId,
    userId,
    email,
    startedAt: now.toISOString(),
    brand: brandKey || null,
    isAdmin,
    ...getBrowserMetadata(),
  };

  // 4. Update localStorage immediately (optimistic)
  const newMeta = {
    userId,
    email,
    lastSessionId: sessionId,
    lastSessionStartedAt: now.toISOString(),
  };
  localStorage.setItem(SESSION_META_KEY, JSON.stringify(newMeta));

  // 5. Send to backend
  try {
    // We assume the api-gateway might proxy this or we call the service directly if exposed.
    // We add brand_key as a query parameter to satisfy the gateway's authentication requirements.
    const url = `/sessions?brand_key=${encodeURIComponent(brandKey || '')}`;
    console.log("[SessionTracker] Sending session payload to backend...", { url, payload: sessionPayload });
    const response = await doPost(url, sessionPayload);
    console.log("[SessionTracker] Backend response receipt:", response);
    
    if (response && response.success) {
      if (response.ignored) {
        console.log('[SessionTracker] Backend ignored duplicate session:', response.message);
      } else {
        console.log('[SessionTracker] New session registered:', sessionId);
      }
    } else {
      console.warn('[SessionTracker] Failed to register session:', response ? response.message : 'No response');
    }
  } catch (error) {
    console.error('[SessionTracker] Error sending session to backend:', error);
  }
}
