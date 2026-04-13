import { useRef, useEffect, useCallback } from 'react';

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// ═══════════════════════════════════════════════════════════════
//  DONUT CHART
// ═══════════════════════════════════════════════════════════════
export function DonutChart({ pillars, pillarStats, selectedPillar, setSelectedPillar, totalContent }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const cx = w / 2, cy = h / 2;
    const outerR = Math.min(cx, cy) - 50;
    const innerR = outerR * 0.55;

    const textColor = cssVar('--text', '#f0f0f3');
    const mutedColor = cssVar('--text-muted', '#6b6b76');
    const bgBody = cssVar('--bg-body', '#0f1117');
    const bgCard = cssVar('--bg-card', '#181b25');

    ctx.clearRect(0, 0, w, h);

    if (pillars.length === 0) {
      ctx.fillStyle = mutedColor;
      ctx.font = '600 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add your first pillar to see the chart', cx, cy);
      return;
    }

    const dataPoints = pillars.map(p => ({ pillar: p, count: pillarStats[p.id]?.total || 0 }));
    const hasContent = dataPoints.some(d => d.count > 0);
    const totalSlice = hasContent ? dataPoints.reduce((s, d) => s + (d.count || 0.5), 0) : pillars.length;

    let startAngle = -Math.PI / 2;
    dataPoints.forEach(({ pillar, count }) => {
      const val = hasContent ? (count || 0.5) : 1;
      const sliceAngle = (val / totalSlice) * Math.PI * 2;
      const midAngle = startAngle + sliceAngle / 2;
      const isActive = selectedPillar === pillar.id;
      const bump = isActive ? 8 : 0;
      const ox = Math.cos(midAngle) * bump;
      const oy = Math.sin(midAngle) * bump;

      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, outerR, startAngle, startAngle + sliceAngle);
      ctx.arc(cx + ox, cy + oy, innerR, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = pillar.color + (isActive ? 'ee' : 'aa');
      ctx.fill();
      ctx.strokeStyle = bgBody;
      ctx.lineWidth = 3;
      ctx.stroke();

      const labelR = outerR + 24;
      const lx = cx + Math.cos(midAngle) * labelR;
      const ly = cy + Math.sin(midAngle) * labelR;
      ctx.fillStyle = isActive ? textColor : mutedColor;
      ctx.font = (isActive ? '700' : '600') + ' ' + (isActive ? '12' : '11') + 'px Inter, system-ui, sans-serif';
      ctx.textAlign = Math.cos(midAngle) < -0.1 ? 'right' : Math.cos(midAngle) > 0.1 ? 'left' : 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pillar.label, lx, ly);

      ctx.font = '700 10px Inter, system-ui, sans-serif';
      ctx.fillStyle = pillar.color;
      ctx.fillText(count + ' piece' + (count !== 1 ? 's' : ''), lx, ly + 14);

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(midAngle) * (outerR + 4 + bump), cy + Math.sin(midAngle) * (outerR + 4 + bump));
      ctx.lineTo(cx + Math.cos(midAngle) * (labelR - 8), cy + Math.sin(midAngle) * (labelR - 8));
      ctx.strokeStyle = pillar.color + '44';
      ctx.lineWidth = 1;
      ctx.stroke();

      startAngle += sliceAngle;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
    ctx.fillStyle = bgCard;
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = '800 24px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(totalContent), cx, cy - 8);
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    ctx.fillStyle = mutedColor;
    ctx.fillText('total pieces', cx, cy + 10);
  }, [pillars, pillarStats, selectedPillar, totalContent]);

  useEffect(() => {
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  const handleClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || pillars.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const cx = rect.width / 2, cy = rect.height / 2;
    const outerR = Math.min(cx, cy) - 50;
    const innerR = outerR * 0.55;
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > outerR + 10 || dist < innerR - 5) { setSelectedPillar(null); return; }

    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) angle += Math.PI * 2;

    const dataPoints = pillars.map(p => ({ pillar: p, count: pillarStats[p.id]?.total || 0 }));
    const hasContent = dataPoints.some(d => d.count > 0);
    const totalSlice = hasContent ? dataPoints.reduce((s, d) => s + (d.count || 0.5), 0) : pillars.length;
    let cum = -Math.PI / 2;
    for (const { pillar, count } of dataPoints) {
      const val = hasContent ? (count || 0.5) : 1;
      const sa = (val / totalSlice) * Math.PI * 2;
      let adj = angle;
      if (adj < cum) adj += Math.PI * 2;
      if (adj >= cum && adj < cum + sa) {
        setSelectedPillar(prev => prev === pillar.id ? null : pillar.id);
        return;
      }
      cum += sa;
    }
  };

  return <canvas ref={canvasRef} className="pillar-wheel-canvas" onClick={handleClick} />;
}

// ═══════════════════════════════════════════════════════════════
//  TREE MAP
// ═══════════════════════════════════════════════════════════════
export function TreeChart({ pillars, pillarStats, selectedPillar, setSelectedPillar }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;

    const textColor = cssVar('--text', '#f0f0f3');
    const mutedColor = cssVar('--text-muted', '#6b6b76');
    const borderColor = cssVar('--border', '#2a2d38');
    const bgCard = cssVar('--bg-card', '#181b25');

    ctx.clearRect(0, 0, w, h);

    if (pillars.length === 0) {
      ctx.fillStyle = mutedColor;
      ctx.font = '600 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add pillars to see the tree map', w / 2, h / 2);
      return;
    }

    const rootX = w / 2, rootY = 38;
    ctx.beginPath();
    ctx.arc(rootX, rootY, 22, 0, Math.PI * 2);
    ctx.fillStyle = bgCard;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = '700 9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Content', rootX, rootY - 5);
    ctx.fillText('Strategy', rootX, rootY + 6);

    const pillarY = 115;
    const spacing = Math.min(160, (w - 80) / Math.max(pillars.length, 1));
    const startX = w / 2 - ((pillars.length - 1) * spacing) / 2;

    pillars.forEach((pillar, pi) => {
      const px = startX + pi * spacing;
      const isActive = selectedPillar === pillar.id;
      const count = pillarStats[pillar.id]?.total || 0;

      ctx.beginPath();
      ctx.moveTo(rootX, rootY + 22);
      ctx.quadraticCurveTo(rootX, pillarY - 28, px, pillarY - 20);
      ctx.strokeStyle = pillar.color + '66';
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.stroke();

      const nw = 110, nh = 46;
      const nx = px - nw / 2, ny = pillarY - nh / 2;
      ctx.beginPath();
      ctx.moveTo(nx + 8, ny);
      ctx.lineTo(nx + nw - 8, ny);
      ctx.arcTo(nx + nw, ny, nx + nw, ny + 8, 8);
      ctx.lineTo(nx + nw, ny + nh - 8);
      ctx.arcTo(nx + nw, ny + nh, nx + nw - 8, ny + nh, 8);
      ctx.lineTo(nx + 8, ny + nh);
      ctx.arcTo(nx, ny + nh, nx, ny + nh - 8, 8);
      ctx.lineTo(nx, ny + 8);
      ctx.arcTo(nx, ny, nx + 8, ny, 8);
      ctx.closePath();
      ctx.fillStyle = pillar.color + (isActive ? '33' : '18');
      ctx.fill();
      ctx.strokeStyle = pillar.color + (isActive ? 'bb' : '55');
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle = isActive ? textColor : mutedColor;
      ctx.font = (isActive ? '700' : '600') + ' 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lbl = pillar.label.length > 14 ? pillar.label.slice(0, 13) + '..' : pillar.label;
      ctx.fillText(lbl, px, pillarY - 6);
      ctx.font = '600 9px Inter, system-ui, sans-serif';
      ctx.fillStyle = pillar.color;
      ctx.fillText(count + ' pieces', px, pillarY + 10);

      const topics = pillar.topics || [];
      if (topics.length > 0 && (isActive || pillars.length <= 4)) {
        const topicY = pillarY + 58;
        const show = topics.slice(0, 4);
        const ts = Math.min(80, spacing / Math.max(show.length, 1));
        const tsx = px - ((show.length - 1) * ts) / 2;
        show.forEach((topic, ti) => {
          const tx = tsx + ti * ts;
          ctx.beginPath();
          ctx.moveTo(px, pillarY + nh / 2);
          ctx.lineTo(tx, topicY - 8);
          ctx.strokeStyle = pillar.color + '33';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(tx, topicY - 3, 4, 0, Math.PI * 2);
          ctx.fillStyle = pillar.color + '88';
          ctx.fill();
          ctx.fillStyle = mutedColor;
          ctx.font = '500 8px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          const tl = topic.length > 10 ? topic.slice(0, 9) + '..' : topic;
          ctx.fillText(tl, tx, topicY + 10);
        });
        if (topics.length > 4) {
          ctx.fillStyle = mutedColor;
          ctx.font = '600 8px Inter, system-ui, sans-serif';
          ctx.fillText('+' + (topics.length - 4) + ' more', px, topicY + 26);
        }
      }
    });
  }, [pillars, pillarStats, selectedPillar]);

  useEffect(() => {
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  const handleClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || pillars.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = rect.width;
    const spacing = Math.min(160, (w - 80) / Math.max(pillars.length, 1));
    const startX = w / 2 - ((pillars.length - 1) * spacing) / 2;
    for (let i = 0; i < pillars.length; i++) {
      const px = startX + i * spacing;
      if (Math.abs(mx - px) < 60 && Math.abs(my - 115) < 28) {
        setSelectedPillar(prev => prev === pillars[i].id ? null : pillars[i].id);
        return;
      }
    }
    setSelectedPillar(null);
  };

  return <canvas ref={canvasRef} className="pillar-wheel-canvas" onClick={handleClick} />;
}

// ═══════════════════════════════════════════════════════════════
//  RADAR CHART
// ═══════════════════════════════════════════════════════════════
export function RadarChart({ pillars, pillarStats, selectedPillar }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const cx = w / 2, cy = h / 2;
    const R = Math.min(cx, cy) - 50;

    const textColor = cssVar('--text', '#f0f0f3');
    const mutedColor = cssVar('--text-muted', '#6b6b76');
    const borderColor = cssVar('--border', '#2a2d38');

    ctx.clearRect(0, 0, w, h);

    if (pillars.length < 3) {
      ctx.fillStyle = mutedColor;
      ctx.font = '600 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add at least 3 pillars for the radar chart', cx, cy);
      return;
    }

    const n = pillars.length;
    const step = (Math.PI * 2) / n;
    const maxVal = Math.max(...pillars.map(p => pillarStats[p.id]?.total || 0), 1);
    const rings = 4;

    for (let r = 1; r <= rings; r++) {
      const rr = (R / rings) * r;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + i * step;
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = r === rings ? 1.5 : 0.5;
      ctx.stroke();
    }

    pillars.forEach((_, i) => {
      const a = -Math.PI / 2 + i * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    ctx.beginPath();
    pillars.forEach((p, i) => {
      const count = pillarStats[p.id]?.total || 0;
      const val = count / maxVal;
      const a = -Math.PI / 2 + i * step;
      const px = cx + Math.cos(a) * R * val;
      const py = cy + Math.sin(a) * R * val;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(59,130,246,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    [
      { key: 'published', color: '#10b981' },
      { key: 'ready', color: '#3b82f6' },
    ].forEach(layer => {
      ctx.beginPath();
      pillars.forEach((p, i) => {
        const count = pillarStats[p.id]?.byStatus[layer.key] || 0;
        const val = count / maxVal;
        const a = -Math.PI / 2 + i * step;
        const px = cx + Math.cos(a) * R * val;
        const py = cy + Math.sin(a) * R * val;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = layer.color + '18';
      ctx.fill();
      ctx.strokeStyle = layer.color + '66';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    pillars.forEach((p, i) => {
      const count = pillarStats[p.id]?.total || 0;
      const val = count / maxVal;
      const a = -Math.PI / 2 + i * step;
      const px = cx + Math.cos(a) * R * val;
      const py = cy + Math.sin(a) * R * val;

      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      const labelR = R + 22;
      const lx = cx + Math.cos(a) * labelR;
      const ly = cy + Math.sin(a) * labelR;
      ctx.fillStyle = selectedPillar === p.id ? textColor : mutedColor;
      ctx.font = (selectedPillar === p.id ? '700' : '600') + ' 11px Inter, system-ui, sans-serif';
      ctx.textAlign = Math.cos(a) < -0.1 ? 'right' : Math.cos(a) > 0.1 ? 'left' : 'center';
      ctx.textBaseline = Math.sin(a) < -0.5 ? 'bottom' : Math.sin(a) > 0.5 ? 'top' : 'middle';
      ctx.fillText(p.label, lx, ly);
      ctx.font = '700 10px Inter, system-ui, sans-serif';
      ctx.fillStyle = p.color;
      const ny = Math.sin(a) > 0.5 ? 13 : -13;
      ctx.fillText(String(count), lx, ly + ny);
    });
  }, [pillars, pillarStats, selectedPillar]);

  useEffect(() => {
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  return <canvas ref={canvasRef} className="pillar-wheel-canvas" />;
}
