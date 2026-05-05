"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getBrandDetail } from "../../../lib/api";
import { useStudio } from "../studio-context";
import { useRegisterTopbarControls } from "../topbar-actions-context";

export default function BrandKitIndexPage() {
  const { bootstrap, sessionToken, activeBrandId, setActiveBrandId } = useStudio();
  const [brandPalettes, setBrandPalettes] = useState<Record<string, string[]>>({});
  const brands = bootstrap?.brands ?? [];

  const topbarControls = useMemo(
    () => (
      <Link className="button button-primary" href="/studio/brands" prefetch={false}>
        New Brand Kit
      </Link>
    ),
    []
  );

  useRegisterTopbarControls(topbarControls);

  useEffect(() => {
    if (!sessionToken || brands.length === 0) return;
    let cancelled = false;
    const missingBrands = brands.filter((brand) => !brandPalettes[brand.id]);
    if (missingBrands.length === 0) return;

    Promise.all(
      missingBrands.map(async (brand) => {
        try {
          const detail = await getBrandDetail(sessionToken, brand.id);
          const palette = detail.activeProfile?.profile.palette;
          if (!palette) return null;
          return [
            brand.id,
            [palette.primary, palette.secondary, palette.accent, ...(palette.neutrals ?? [])].filter(Boolean)
          ] as const;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      setBrandPalettes((current) => {
        const next = { ...current };
        results.forEach((entry) => {
          if (entry) {
            next[entry[0]] = entry[1];
          }
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [brandPalettes, brands, sessionToken]);

  return (
    <div className="page-stack brand-kit-page">
      <section className="brand-kit-board">
        <div className="brand-kit-card-grid">
          {brands.map((brand, index) => {
            const isActive = brand.id === activeBrandId;
            const brandAssets = bootstrap?.brandAssets.filter((asset) => asset.brandId === brand.id) ?? [];
            const palette = normalizeCardPalette(brandPalettes[brand.id] ?? fallbackPalette(index));

            return (
              <Link
                className={`brand-kit-card${isActive ? " is-active" : ""}`}
                href={`/studio/brand-kit/${brand.id}`}
                key={brand.id}
                onClick={() => setActiveBrandId(brand.id)}
                prefetch={false}
              >
                <div className="brand-kit-card-cover" style={{ background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` }}>
                  <span>{brand.name}</span>
                </div>
                <div className="brand-kit-card-body">
                  <strong>{brand.name}</strong>
                  <p>{brand.description ?? "Brand identity and reusable creative rules"}</p>
                  <div className="brand-kit-card-meta">
                    <span>{brandAssets.length} Assets</span>
                    <span>Updated recently</span>
                  </div>
                  <div className="brand-kit-dot-row">
                    {palette.slice(0, 5).map((color, colorIndex) => (
                      <span key={`${brand.id}-${colorIndex}`} style={{ background: color }} />
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}

          <Link className="brand-kit-create-card" href="/studio/brands" prefetch={false}>
            <span>+</span>
            <strong>Create New Brand Kit</strong>
          </Link>
        </div>
      </section>
    </div>
  );
}

function fallbackPalette(index: number) {
  const palettes = [
    ["#0f2a24", "#688f71", "#d9c0a8", "#f2eee7", "#1e1e1e"],
    ["#1c3556", "#93a889", "#d7b486", "#f4efe7", "#27323a"],
    ["#20304a", "#807460", "#e1c49b", "#f2f0ea", "#111111"],
    ["#2d241f", "#9a6b3c", "#dac2a8", "#f1ece3", "#242424"]
  ];
  return palettes[index % palettes.length] ?? palettes[0]!;
}

function normalizeCardPalette(palette: string[]) {
  const valid = palette.filter((color) => /^#[0-9A-Fa-f]{6}$/.test(color));
  return valid.length >= 5
    ? valid.slice(0, 5)
    : [...valid, "#f2eee7", "#1e1e1e", "#ffffff"].slice(0, 5);
}
