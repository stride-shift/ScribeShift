"use client";

import { useEffect, useState, useRef } from "react";

/**
 * SidebarShapes — subtle blue cursor spotlight that follows the mouse
 * inside the sidebar, matching the login page's hover effect.
 */
function SidebarShapes() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -1000, y: -1000 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current?.parentElement; // the .app-sidebar container
    if (!el) return;

    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (!visible) setVisible(true);
    };
    const handleEnter = () => setVisible(true);
    const handleLeave = () => setVisible(false);

    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseenter", handleEnter);
    el.addEventListener("mouseleave", handleLeave);
    return () => {
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseenter", handleEnter);
      el.removeEventListener("mouseleave", handleLeave);
    };
  }, [visible]);

  return (
    <div ref={ref} className="sidebar-shapes-bg">
      {/* Subtle ambient gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/[0.04] via-transparent to-blue-500/[0.03]" />

      {/* Cursor spotlight halo */}
      <div
        className="absolute pointer-events-none transition-opacity duration-300"
        style={{
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          opacity: visible ? 1 : 0,
          background: `radial-gradient(circle 220px at ${pos.x}px ${pos.y}px, rgba(59,130,246,0.18), rgba(96,165,250,0.06) 40%, transparent 70%)`,
        }}
      />

      {/* Inner glow dot */}
      <div
        className="absolute pointer-events-none rounded-full transition-opacity duration-300"
        style={{
          left: pos.x - 10,
          top: pos.y - 10,
          width: 20,
          height: 20,
          opacity: visible ? 1 : 0,
          background: "radial-gradient(circle, rgba(96,165,250,0.5), transparent 70%)",
          filter: "blur(8px)",
        }}
      />
    </div>
  );
}

export { SidebarShapes };
