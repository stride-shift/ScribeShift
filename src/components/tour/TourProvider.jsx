import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useAuth } from '../AuthProvider';
import { stepsForRole, tourForView, viewTours } from './steps';
import CustomTour from './CustomTour';

// Three tour modes flow through this provider:
//
//   * 'main'       — keyed by role, persisted in users table. Auto-runs once
//                    per role on first login. Walks across every nav view.
//
//   * 'view'       — a single tab's tour, keyed by view id, persisted in
//                    localStorage. Triggered by the Help button menu, or
//                    auto-shown the first time a user lands on a new tab.
//
//   * 'sequential' — runs every per-tab tour in order, switching the active
//                    view between them. Triggered by "Walk through all tabs"
//                    in the Help menu. Ideal for showing a stakeholder around.

const TourContext = createContext({
  startTour: () => {},
  startViewTour: () => {},
  startSequentialTour: () => {},
  availableTours: [],
  available: false,
});
export const useTour = () => useContext(TourContext);

const AUTO_START_DELAY_MS = 1200;
const VIEW_SWITCH_DELAY_MS = 350;

// Order the per-tab tours follow when running "sequential" mode. Matches the
// nav order so the journey feels natural.
const VIEW_TOUR_ORDER = ['create', 'history', 'schedule', 'planner', 'analytics', 'brands', 'settings', 'admin'];

const VIEW_LABELS = {
  create: 'Create',
  history: 'History',
  schedule: 'Schedule',
  planner: 'Pillars',
  analytics: 'Analytics',
  brands: 'Brands',
  settings: 'Settings',
  admin: 'Admin',
};

function completedKeyForRole(role) {
  if (role === 'super_admin') return 'tour_super_admin_completed';
  if (role === 'admin') return 'tour_admin_completed';
  return 'tour_user_completed';
}

function viewSeenKey(userId, viewId) {
  return `scribeshift-tour-view-${userId}-${viewId}`;
}

function isViewSeen(userId, viewId) {
  if (!userId || !viewId || typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(viewSeenKey(userId, viewId)) === '1'; }
  catch { return false; }
}

function markViewSeen(userId, viewId) {
  if (!userId || !viewId || typeof window === 'undefined') return;
  try { window.localStorage.setItem(viewSeenKey(userId, viewId), '1'); } catch {}
}

function clearViewSeen(userId, viewId) {
  if (!userId || !viewId || typeof window === 'undefined') return;
  try { window.localStorage.removeItem(viewSeenKey(userId, viewId)); } catch {}
}

export default function TourProvider({ activeView, setActiveView, children }) {
  const { user, getAuthHeaders, refreshUser } = useAuth();
  const role = user?.role || 'user';

  // mode: 'main' | 'view' | 'sequential'
  const [mode, setMode] = useState('main');
  const [currentTourView, setCurrentTourView] = useState(null);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const mainStepsList = useMemo(() => stepsForRole(role), [role]);
  const viewStepsList = useMemo(
    () => (currentTourView ? tourForView(currentTourView) : null),
    [currentTourView]
  );
  const activeSteps = (mode === 'view' || mode === 'sequential') && viewStepsList ? viewStepsList : mainStepsList;

  // Which tabs (in order) are available to this role for sequential mode.
  // Admins/super admins get the Admin tab too; regular users don't.
  const availableViewOrder = useMemo(() => {
    return VIEW_TOUR_ORDER.filter((v) => {
      if (v === 'admin') return role === 'admin' || role === 'super_admin';
      return true;
    });
  }, [role]);

  const availableTours = useMemo(
    () => availableViewOrder.map((id) => ({ id, label: VIEW_LABELS[id] })),
    [availableViewOrder]
  );

  const mainAutoStartedRef = useRef(false);

  // ── Persistence helpers ─────────────────────────────────────────────
  const markMainCompleted = useCallback(async () => {
    try {
      await fetch('/api/auth/tour-complete', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      refreshUser?.();
    } catch {}
  }, [getAuthHeaders, refreshUser, role]);

  const resetMainCompleted = useCallback(async () => {
    try {
      await fetch('/api/auth/tour-reset', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
    } catch {}
  }, [getAuthHeaders, role]);

  // ── Auto-start logic ────────────────────────────────────────────────
  useEffect(() => {
    if (!user || mainAutoStartedRef.current) return;
    const completedKey = completedKeyForRole(role);
    if (user[completedKey]) return;
    mainAutoStartedRef.current = true;
    const t = setTimeout(() => {
      setMode('main');
      setCurrentTourView(null);
      setStepIndex(0);
      setRun(true);
    }, AUTO_START_DELAY_MS);
    return () => clearTimeout(t);
  }, [user, role]);

  // First-visit per-tab tour (only auto-shown after main tour is done, and
  // not when a sequential tour is already running).
  useEffect(() => {
    if (!user || run) return;
    const mainDone = !!user[completedKeyForRole(role)];
    if (!mainDone) return;
    if (!activeView || !tourForView(activeView)) return;
    if (isViewSeen(user.id, activeView)) return;

    const t = setTimeout(() => {
      setMode('view');
      setCurrentTourView(activeView);
      setStepIndex(0);
      setRun(true);
    }, 400);
    return () => clearTimeout(t);
  }, [activeView, user, role, run]);

  // ── Public starters ─────────────────────────────────────────────────
  const startViewTour = useCallback(
    (viewId) => {
      const target = viewId ?? activeView;
      if (!tourForView(target)) return;
      if (user?.id) clearViewSeen(user.id, target);
      if (target !== activeView) {
        setActiveView(target);
        setTimeout(() => {
          setMode('view');
          setCurrentTourView(target);
          setStepIndex(0);
          setRun(true);
        }, VIEW_SWITCH_DELAY_MS);
      } else {
        setMode('view');
        setCurrentTourView(target);
        setStepIndex(0);
        setRun(true);
      }
    },
    [activeView, setActiveView, user?.id]
  );

  // Run the main nav tour again.
  const startMainTour = useCallback(() => {
    resetMainCompleted();
    setMode('main');
    setCurrentTourView(null);
    setStepIndex(0);
    setRun(true);
  }, [resetMainCompleted]);

  // Run every per-tab tour back-to-back, navigating between tabs automatically.
  const startSequentialTour = useCallback(() => {
    const first = availableViewOrder[0];
    if (!first || !tourForView(first)) return;
    if (user?.id) availableViewOrder.forEach((v) => clearViewSeen(user.id, v));

    if (first !== activeView) {
      setActiveView(first);
      setTimeout(() => {
        setMode('sequential');
        setCurrentTourView(first);
        setStepIndex(0);
        setRun(true);
      }, VIEW_SWITCH_DELAY_MS);
    } else {
      setMode('sequential');
      setCurrentTourView(first);
      setStepIndex(0);
      setRun(true);
    }
  }, [availableViewOrder, activeView, setActiveView, user?.id]);

  // Generic startTour — keep for backwards compatibility with HelpButton callers.
  const startTour = useCallback(
    (opts = {}) => {
      const requestedView = opts.view ?? activeView;
      if (tourForView(requestedView)) {
        startViewTour(requestedView);
      } else {
        startMainTour();
      }
    },
    [activeView, startMainTour, startViewTour]
  );

  // ── Advance / finish handlers ───────────────────────────────────────
  const advance = useCallback(
    ({ direction }) => {
      const next = direction === 'prev' ? stepIndex - 1 : stepIndex + 1;
      const nextStep = activeSteps[next];
      if (!nextStep) return;

      if (nextStep.view && nextStep.view !== activeView) {
        setActiveView(nextStep.view);
        setTimeout(() => setStepIndex(next), VIEW_SWITCH_DELAY_MS);
      } else {
        setStepIndex(next);
      }
    },
    [stepIndex, activeSteps, activeView, setActiveView]
  );

  const finishTour = useCallback(() => {
    // Persist whatever we just finished.
    if (mode === 'main') markMainCompleted();
    else if (user?.id && currentTourView) markViewSeen(user.id, currentTourView);

    // Sequential mode chains into the next tab's tour automatically.
    if (mode === 'sequential' && currentTourView) {
      const idx = availableViewOrder.indexOf(currentTourView);
      const nextView = idx >= 0 ? availableViewOrder[idx + 1] : null;
      if (nextView && tourForView(nextView)) {
        // Pause the current tour, switch view, then start the next tab's tour.
        setRun(false);
        setActiveView(nextView);
        setTimeout(() => {
          setCurrentTourView(nextView);
          setStepIndex(0);
          setRun(true);
        }, VIEW_SWITCH_DELAY_MS + 100);
        return;
      }
      // No more tabs — fall through and end the run.
    }

    setRun(false);
    setStepIndex(0);
    setCurrentTourView(null);
    setMode('main');
  }, [mode, markMainCompleted, user?.id, currentTourView, availableViewOrder, setActiveView]);

  const value = useMemo(
    () => ({
      startTour,
      startViewTour,
      startSequentialTour,
      startMainTour,
      availableTours,
      available: !!user,
    }),
    [startTour, startViewTour, startSequentialTour, startMainTour, availableTours, user]
  );

  return (
    <TourContext.Provider value={value}>
      <CustomTour
        steps={activeSteps}
        stepIndex={stepIndex}
        run={run}
        onAdvance={advance}
        onSkip={finishTour}
        onClose={finishTour}
        onFinish={finishTour}
        onTargetMissing={() => {
          // If we're past the last step there's nothing to advance to; end
          // the tour instead of looping.
          if (stepIndex >= activeSteps.length - 1) {
            finishTour();
          } else {
            advance({ direction: 'next' });
          }
        }}
      />
      {children}
    </TourContext.Provider>
  );
}
