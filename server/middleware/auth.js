import { supabase } from '../config/supabase.js';

// ── Verify Supabase JWT and attach user to request ──────────────────
export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify the JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch user profile with role and company
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*, companies(*)')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: 'User profile not found' });
    }

    if (!profile.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Attach to request
    req.user = {
      id: user.id,
      email: user.email,
      role: profile.role,
      company_id: profile.company_id,
      company: profile.companies,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
    };
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
