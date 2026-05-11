// Self-contained product tour. Replaces react-joyride, which had too many
// v3 quirks (silently-dropped options, controlled-mode timing bugs, awkward
// scroll handling) for our use case.
//
// What this component does:
//   1. Computes the target element's bounding rect on every step / scroll / resize
//   2. Renders a full-screen SVG overlay with a "hole" cut around the target
//   3. Positions a tooltip card next to the target (auto-flips to avoid edges)
//   4. Scrolls the target into view BEFORE measuring (so off-screen targets work)
//   5. Falls back to a centered modal when target is `body` or not found
//
// The caller (TourProvider) controls which step is active via the `stepIndex`
// prop and is told to advance via `onAdvance({ direction })`.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PADDING = 8;
const TIP_WIDTH = 360;
const TIP_GAP = 14;
const VIEWPORT_MARGIN = 16;

// Compute a tooltip placement (top/bottom/left/right) given a target rect.
// Picks the side that has the most room; centers along the cross-axis.
function placeTooltip(rect, tipSize, viewport) {
  if (!rect) {
    return {
      placement: 'center',
      left: (viewport.w - tipSize.w) / 2,
      top: (viewport.h - tipSize.h) / 2,
    };
  }
  const spaceBelow = viewport.h - rect.bottom;
  const spaceAbove = rect.top;
  const spaceRight = viewport.w - rect.right;
  const spaceLeft = rect.left;

  // Prefer below > right > above > left, but pick the one that actually fits.
  const candidates = [
    { side: 'bottom', space: spaceBelow, fits: spaceBelow >= tipSize.h + TIP_GAP },
    { side: 'right', space: spaceRight, fits: spaceRight >= tipSize.w + TIP_GAP },
    { side: 'top', space: spaceAbove, fits: spaceAbove >= tipSize.h + TIP_GAP },
    { side: 'left', space: spaceLeft, fits: spaceLeft >= tipSize.w + TIP_GAP },
  ];
  const chosen = candidates.find((c) => c.fits) || candidates.sort((a, b) => b.space - a.space)[0];

  let left;
  let top;
  if (chosen.side === 'bottom') {
    top = rect.bottom + TIP_GAP;
    left = rect.left + rect.width / 2 - tipSize.w / 2;
  } else if (chosen.side === 'top') {
    top = rect.top - tipSize.h - TIP_GAP;
    left = rect.left + rect.width / 2 - tipSize.w / 2;
  } else if (chosen.side === 'right') {
    left = rect.right + TIP_GAP;
    top = rect.top + rect.height / 2 - tipSize.h / 2;
  } else {
    left = rect.left - tipSize.w - TIP_GAP;
    top = rect.top + rect.height / 2 - tipSize.h / 2;
  }

  // Clamp into viewport.
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewport.w - tipSize.w - VIEWPORT_MARGIN));
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, viewport.h - tipSize.h - VIEWPORT_MARGIN));

  return { placement: chosen.side, left, top };
}

// Scroll the target element into the centre of the viewport. Returns a promise
// that resolves once the scroll has settled. Browsers don't give us a reliable
// "scroll done" event for smooth scroll, so we wait a fixed timeout.
function scrollIntoCenter(el) {
  return new Promise((resolve) => {
    if (!el) {
      resolve();
      return;
    }
    const rect = el.getBoundingClientRect();
    const inView =
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.left >= 0 &&
      rect.right <= window.innerWidth;
    if (inView) {
      resolve();
      return;
    }
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    } catch {
      el.scrollIntoView();
    }
    // Smooth scroll typically completes within ~400ms.
    setTimeout(resolve, 450);
  });
}

export default function CustomTour({
  steps,
  stepIndex,
  run,
  onAdvance,
  onSkip,
  onClose,
  onFinish,
  onTargetMissing,
}) {
  const step = steps[stepIndex];
  const [rect, setRect] = useState(null);
  const [tipSize, setTipSize] = useState({ w: TIP_WIDTH, h: 200 });
  const [viewport, setViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
  });
  const [ready, setReady] = useState(false);
  const tipRef = useRef(null);

  const isCentered = !step?.target || step.target === 'body';

  // Find target + scroll into view whenever the step changes.
  useEffect(() => {
    if (!run || !step) return;
    setReady(false);
    setRect(null);

    if (isCentered) {
      setReady(true);
      return;
    }

    let cancelled = false;

    // Polling because the target may appear after a view switch — we keep
    // looking for it briefly before giving up and showing the tip centered.
    const start = Date.now();
    const POLL_TIMEOUT = 1500;
    const tick = async () => {
      if (cancelled) return;
      const el = document.querySelector(step.target);
      if (el) {
        await scrollIntoCenter(el);
        if (cancelled) return;
        const r = el.getBoundingClientRect();
        setRect({
          top: r.top - PADDING,
          left: r.left - PADDING,
          width: r.width + PADDING * 2,
          height: r.height + PADDING * 2,
          right: r.right + PADDING,
          bottom: r.bottom + PADDING,
        });
        setReady(true);
        return;
      }
      if (Date.now() - start < POLL_TIMEOUT) {
        setTimeout(tick, 80);
      } else {
        // Target never appeared. If the parent wants us to skip (most cases),
        // call onTargetMissing so the step is hopped over instead of showing
        // a confusing centered modal that doesn't reference any UI. Otherwise
        // fall back to a centered card so the tour isn't completely stuck.
        if (onTargetMissing) {
          onTargetMissing();
        } else {
          setReady(true);
        }
      }
    };
    tick();

    return () => {
      cancelled = true;
    };
  }, [run, step, stepIndex, isCentered]);

  // Recompute on resize / scroll while the step is showing.
  useEffect(() => {
    if (!run) return;
    const onChange = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      if (!isCentered && step?.target) {
        const el = document.querySelector(step.target);
        if (el) {
          const r = el.getBoundingClientRect();
          setRect({
            top: r.top - PADDING,
            left: r.left - PADDING,
            width: r.width + PADDING * 2,
            height: r.height + PADDING * 2,
            right: r.right + PADDING,
            bottom: r.bottom + PADDING,
          });
        }
      }
    };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [run, step, isCentered]);

  // Measure tooltip after it mounts so positioning matches its real height.
  useLayoutEffect(() => {
    if (!ready || !tipRef.current) return;
    const r = tipRef.current.getBoundingClientRect();
    if (r.height && (Math.abs(r.height - tipSize.h) > 2 || Math.abs(r.width - tipSize.w) > 2)) {
      setTipSize({ w: r.width, h: r.height });
    }
  }, [ready, stepIndex, tipSize.h, tipSize.w]);

  const pos = useMemo(
    () => placeTooltip(isCentered ? null : rect, tipSize, viewport),
    [rect, tipSize, viewport, isCentered]
  );

  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;

  // Keyboard: Esc closes, Right/Enter advances, Left goes back.
  useEffect(() => {
    if (!run) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (isLast) onFinish?.();
        else onAdvance?.({ direction: 'next' });
      } else if (e.key === 'ArrowLeft' && !isFirst) onAdvance?.({ direction: 'prev' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, isLast, isFirst, onAdvance, onClose, onFinish]);

  if (!run || !step) return null;

  // Build the SVG mask path: full screen minus the target rect.
  const cutoutVisible = !isCentered && rect;

  return (
    <AnimatePresence>
      {run && (
        <motion.div
          key="tour-root"
          className="ct-tour-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Overlay with cutout */}
          <svg className="ct-tour-overlay" width="100%" height="100%">
            <defs>
              <mask id="ct-tour-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {cutoutVisible && (
                  <rect
                    x={rect.left}
                    y={rect.top}
                    width={rect.width}
                    height={rect.height}
                    rx="10"
                    ry="10"
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(8, 11, 20, 0.62)"
              mask="url(#ct-tour-mask)"
            />
          </svg>

          {/* Spotlight ring around the target */}
          {cutoutVisible && (
            <motion.div
              className="ct-tour-spotlight"
              initial={false}
              animate={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            />
          )}

          {/* Tooltip card */}
          {ready && (
            <motion.div
              key={`tip-${stepIndex}`}
              ref={tipRef}
              className="ct-tour-tip"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{
                top: pos.top,
                left: pos.left,
                width: TIP_WIDTH,
              }}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="ct-tour-title"
            >
              <button
                className="ct-tour-tip-close"
                onClick={onClose}
                aria-label="Close tour"
                title="Close tour"
              >
                <CloseIcon />
              </button>

              <div className="ct-tour-tip-progress">
                Step {stepIndex + 1} of {steps.length}
              </div>

              {step.title && (
                <h3 id="ct-tour-title" className="ct-tour-tip-title">
                  {step.title}
                </h3>
              )}

              <div className="ct-tour-tip-body">{step.content}</div>

              <div className="ct-tour-tip-actions">
                <div className="ct-tour-tip-actions-left">
                  {!isLast && (
                    <button
                      type="button"
                      onClick={onSkip}
                      className="ct-tour-tip-btn ct-tour-tip-btn--ghost"
                    >
                      Skip tour
                    </button>
                  )}
                </div>
                <div className="ct-tour-tip-actions-right">
                  {!isFirst && (
                    <button
                      type="button"
                      onClick={() => onAdvance?.({ direction: 'prev' })}
                      className="ct-tour-tip-btn ct-tour-tip-btn--secondary"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => (isLast ? onFinish?.() : onAdvance?.({ direction: 'next' }))}
                    className="ct-tour-tip-btn ct-tour-tip-btn--primary"
                  >
                    {isLast ? 'Finish' : 'Next'}
                    {!isLast && <ArrowIcon />}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
