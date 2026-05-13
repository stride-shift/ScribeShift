import { useEffect, useState } from 'react';
import { CanvasRevealEffect } from './sign-in-flow-1';

/**
 * AppBackground — fixed-position animated dot canvas that sits behind the
 * whole app shell. Same effect as the login page, tuned to be subtle so it
 * doesn't fight content for attention. Adapts colour + opacity to light /
 * dark mode by watching `data-theme` on <html>.
 */
export default function AppBackground() {
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined'
      ? (document.documentElement.getAttribute('data-theme') || 'light')
      : 'light'
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') || 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const isDark = theme === 'dark';

  return (
    <div className={`app-background ${isDark ? 'app-background--dark' : 'app-background--light'}`} aria-hidden="true">
      <CanvasRevealEffect
        animationSpeed={4}
        colors={isDark ? [[59, 130, 246]] : [[37, 99, 235]]}
        opacities={
          isDark
            ? [0.08, 0.08, 0.1, 0.1, 0.15, 0.18, 0.22, 0.28, 0.32, 0.4]
            : [0.12, 0.12, 0.15, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5]
        }
        dotSize={2}
        showGradient={false}
      />
    </div>
  );
}
