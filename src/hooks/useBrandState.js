import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../components/AuthProvider';

export function useBrandState() {
  const { getAuthHeaders, isAuthenticated } = useAuth();

  // Brand identity (in-memory copy used by Create — synced from active brand on load)
  const [brand, setBrand] = useState({
    brandName: '',
    primaryColor: '#3b82f6',
    secondaryColor: '#475569',
    logoBase64: null,
    logoPreviewUrl: null,
    icpDescription: '',
    brandGuidelines: '',
    writingSamples: ['', '', ''],
  });

  // List of saved brands and the currently-active brand id (persisted)
  const [savedBrands, setSavedBrands] = useState([]);
  const [brandsMeta, setBrandsMeta] = useState({ limit: 1, used: 0 });
  const [activeBrandId, setActiveBrandIdRaw] = useState(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('scribeshift-active-brand') || null;
  });

  const setActiveBrandId = useCallback((id) => {
    setActiveBrandIdRaw(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('scribeshift-active-brand', id);
      else localStorage.removeItem('scribeshift-active-brand');
    }
  }, []);

  const loadBrands = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/brands', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const list = data.brands || [];
      setSavedBrands(list);
      setBrandsMeta({ limit: data.limit ?? 1, used: data.used ?? list.length });

      // Pick an active brand: stored id if still valid, else first available
      let activeId = activeBrandId;
      if (activeId && !list.some(b => b.id === activeId)) activeId = null;
      if (!activeId && list.length > 0) activeId = list[0].id;
      if (activeId !== activeBrandId) setActiveBrandId(activeId);

      // Hydrate the in-memory brand from the active record
      const active = list.find(b => b.id === activeId);
      if (active) {
        setBrand((prev) => ({
          ...prev,
          id: active.id,
          brandName: active.brand_name || '',
          primaryColor: active.primary_color || '#3b82f6',
          secondaryColor: active.secondary_color || '#475569',
          icpDescription: active.icp_description || '',
          brandGuidelines: active.brand_guidelines || '',
          writingSamples: (active.writing_samples && active.writing_samples.length > 0)
            ? active.writing_samples
            : ['', '', ''],
          ciDocumentText: active.ci_document_text || '',
          // Keep logo_url so image gen can fetch it on demand.
          logoUrl: active.logo_url || null,
          // Carry the brand-level defaults so the provider's seeding effect
          // (H1 hoist) can apply audience + image-style defaults on brand load.
          default_audience: active.default_audience || null,
          default_image_styles: Array.isArray(active.default_image_styles)
            ? active.default_image_styles
            : null,
          // Structured colour palette extracted by Wave 1 AI — may be null for
          // legacy brands created before palette extraction was added.
          brand_palette: active.brand_palette ?? null,
          // Justin-style profile fields — feed the deck-style-lock + guardrails
          // at image generation. Null for brands extracted before these existed.
          typography: active.typography ?? null,
          motif_description: active.motif_description ?? null,
          do_donts: active.do_donts ?? null,
          cover_formula: active.cover_formula ?? null,
        }));

        // If the active brand has a logo URL but no base64 yet, fetch the
        // image and convert to base64 so image generation can inline it.
        // Without this step the image-gen prompt has nothing to attach.
        if (active.logo_url) {
          (async () => {
            try {
              const r = await fetch(active.logo_url, { mode: 'cors' });
              if (!r.ok) return;
              const blob = await r.blob();
              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = String(reader.result || '');
                const base64 = dataUrl.split(',')[1] || null;
                if (base64) {
                  setBrand((p) => ({
                    ...p,
                    logoBase64: base64,
                    logoPreviewUrl: dataUrl,
                  }));
                }
              };
              reader.readAsDataURL(blob);
            } catch (err) {
              console.warn('[BRANDS] Could not load logo for image gen:', err.message);
            }
          })();
        } else {
          // Brand has no logo — clear any stale base64 from a previous brand.
          setBrand((p) => ({ ...p, logoBase64: null, logoPreviewUrl: null }));
        }
      }
    } catch (err) {
      console.warn('[BRANDS] load failed:', err.message);
    }
  }, [getAuthHeaders, isAuthenticated, activeBrandId, setActiveBrandId]);

  // Load brands on auth + when active brand changes
  useEffect(() => {
    if (isAuthenticated) loadBrands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeBrandId]);

  return { brand, setBrand, savedBrands, brandsMeta, activeBrandId, setActiveBrandId, loadBrands };
}
