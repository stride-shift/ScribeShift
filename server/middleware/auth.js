import { supabase } from '../config/supabase.js';

// ── In-memory user cache (TTL-based) ────────────────────────────────
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedUser(token) {
  const entry = userCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(token);
    return null;
  }
  return entry.user;
}

// Drop every cached entry for a given user id. Call this when the user's
// profile, company assignment, or role changes, so the next request reloads.
export function invalidateUserCache(userId) {
  if (!userId) return;
  for (const [token, entry] of userCache) {
    if (entry.user?.id === userId) userCache.delete(token);
  }
}

function setCachedUser(token, user) {
  userCache.set(token, { user, expiresAt: Date.now() + CACHE_TTL });

  // Evict entries if cache grows too large (max 500 entries)
  if (userCache.size > 500) {
    const now = Date.now();
    // First pass: remove expired
    for (const [key, val] of userCache) {
      if (now > val.expiresAt) userCache.delete(key);
    }
    // Second pass: if still over limit, remove oldest entries
    if (userCache.size > 500) {
      const entries = [...userCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const toRemove = entries.slice(0, userCache.size - 400); // trim to 400
      for (const [key] of toRemove) userCache.delete(key);
    }
  }
}

// ── Verify Supabase JWT and attach user to request ──────────────────
export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  // Check cache first
  const cached = getCachedUser(token);
  if (cached) {
    req.user = cached;
    req.token = token;
    return next();
  }

  try {
    // Verify the JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch user profile with role and company
    let { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*, companies(*)')
      .eq('id', user.id)
      .single();

    // If no profile exists (e.g. first-time Google OAuth sign-in), create one
    if (profileError || !profile) {
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

      const { data: newProfile, error: insertError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email,
          full_name: fullName,
          avatar_url: avatarUrl,
          role: 'user',
        })
        .select('*, companies(*)')
        .single();

      if (insertError || !newProfile) {
        console.error('[AUTH] Failed to auto-create user profile:', insertError?.message);
        return res.status(401).json({ error: 'User profile not found' });
      }

      profile = newProfile;
      console.log(`[AUTH] Auto-created profile for user ${user.email}`);
    }

    if (!profile.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Build user object
    const userData = {
      id: user.id,
      email: user.email,
      role: profile.role,
      company_id: profile.company_id,
      company: profile.companies,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      tour_user_completed: !!profile.tour_user_completed,
      tour_admin_completed: !!profile.tour_admin_completed,
      tour_super_admin_completed: !!profile.tour_super_admin_completed,
    };

    // Cache and attach
    setCachedUser(token, userData);
    req.user = userData;
    req.token = token;

    next();
  } catch (err) {
    console.error('[AUTH] Token verification error:', err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// ── Role-based access middleware factory ─────────────────────────────
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

// ── Build a scoping filter based on user role ───────────────────────
// Returns a function that applies WHERE clauses to a Supabase query
export function scopeByRole(req) {
  const { role, id, company_id } = req.user;
  if (role === 'super_admin') {
    return (query) => query; // No restriction
  }
  if (role === 'admin') {
    return (query) => query.eq('company_id', company_id);
  }
  // Regular user
  return (query) => query.eq('user_id', id);
}
