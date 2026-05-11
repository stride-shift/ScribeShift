// Custom Joyride tooltip — gives us full control over the look and ensures
// the Next/Back/Skip/Close buttons forward the props Joyride passes (so they
// emit the correct ACTIONS in the callback chain). The default tooltip can
// silently swallow clicks in controlled mode if the styles object contains
// CSS variables; rendering our own avoids that entire class of bug.

export default function TourTooltip({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  size,
}) {
  // Joyride spreads role / aria attributes via tooltipProps — keep them.
  return (
    <div {...tooltipProps} className="ss-tour-tip">
      <button
        {...closeProps}
        className="ss-tour-tip-close"
        aria-label="Close tour"
        title="Close tour"
      >
        <CloseIcon />
      </button>

      <div className="ss-tour-tip-progress">
        Step {index + 1} of {size}
      </div>

      {step.title && <h3 className="ss-tour-tip-title">{step.title}</h3>}

      <div className="ss-tour-tip-body">{step.content}</div>

      <div className="ss-tour-tip-actions">
        <div className="ss-tour-tip-actions-left">
          {!isLastStep && (
            <button {...skipProps} className="ss-tour-tip-btn ss-tour-tip-btn--ghost">
              Skip tour
            </button>
          )}
        </div>
        <div className="ss-tour-tip-actions-right">
          {index > 0 && (
            <button {...backProps} className="ss-tour-tip-btn ss-tour-tip-btn--secondary">
              Back
            </button>
          )}
          <button {...primaryProps} className="ss-tour-tip-btn ss-tour-tip-btn--primary">
            {isLastStep ? 'Finish' : 'Next'}
            {!isLastStep && <ArrowIcon />}
          </button>
        </div>
      </div>
    </div>
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
