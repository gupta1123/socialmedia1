import type { CSSProperties } from 'react';

export interface TextEffectDefinition {
  id: string;
  label: string;
  category: 'Basic' | 'Neon' | 'Retro' | 'Modern' | 'Distortion';
  colors: number; // 0, 1, or 2
  generateStyle: (color1: string, color2: string) => CSSProperties;
}

export const TEXT_EFFECTS_REGISTRY: TextEffectDefinition[] = [
  // --- BASIC ---
  { id: 'none', label: 'None', category: 'Basic', colors: 0, generateStyle: () => ({}) },
  { id: 'drop', label: 'Drop Shadow', category: 'Basic', colors: 1, generateStyle: (c1) => ({ textShadow: `4px 4px 0px ${c1}` }) },
  { id: 'glow', label: 'Glow', category: 'Basic', colors: 1, generateStyle: (c1) => ({ textShadow: `0 0 10px ${c1}, 0 0 20px ${c1}` }) },
  { id: 'echo', label: 'Echo', category: 'Basic', colors: 2, generateStyle: (c1, c2) => ({ textShadow: `3px 3px 0px ${c1}, 6px 6px 0px ${c2}` }) },
  { id: 'outline', label: 'Outline', category: 'Basic', colors: 1, generateStyle: (c1) => ({ WebkitTextStroke: `2px ${c1}`, color: 'transparent' }) },
  { id: 'hollow', label: 'Hollow', category: 'Basic', colors: 1, generateStyle: (c1) => ({ WebkitTextStroke: `1px ${c1}`, color: 'transparent', textShadow: `3px 3px 0 ${c1}40` }) },
  { id: 'splice', label: 'Splice', category: 'Basic', colors: 2, generateStyle: (c1, c2) => ({ WebkitTextStroke: `1px ${c1}`, textShadow: `3px 3px 0px ${c2}` }) },
  { id: 'background', label: 'Background', category: 'Basic', colors: 1, generateStyle: (c1) => ({ backgroundColor: c1, padding: '0 8px', borderRadius: '4px' }) },
  { id: 'highlight', label: 'Highlight', category: 'Basic', colors: 1, generateStyle: (c1) => ({ boxShadow: `inset 0 -10px 0 ${c1}` }) },
  { id: 'emboss', label: 'Emboss', category: 'Basic', colors: 2, generateStyle: (c1, c2) => ({ textShadow: `-1px -1px 0 ${c1}, 1px 1px 0 ${c2}` }) },
  
  // --- NEON ---
  { id: 'neon-classic', label: 'Classic Neon', category: 'Neon', colors: 1, generateStyle: (c1) => ({ color: '#fff', textShadow: `0 0 5px #fff, 0 0 10px #fff, 0 0 20px ${c1}, 0 0 40px ${c1}` }) },
  { id: 'cyberpunk', label: 'Cyberpunk', category: 'Neon', colors: 2, generateStyle: (c1, c2) => ({ color: c1, textShadow: `2px 2px 0px ${c2}, 0 0 10px ${c1}` }) },
  { id: 'vaporwave', label: 'Vaporwave', category: 'Neon', colors: 2, generateStyle: (c1, c2) => ({ textShadow: `-3px 0px 0 ${c1}, 3px 0px 0 ${c2}` }) },
  { id: 'acid', label: 'Acid Sign', category: 'Neon', colors: 1, generateStyle: (c1) => ({ color: c1, filter: 'contrast(150%) brightness(120%)', textShadow: `0 0 8px ${c1}` }) },
  { id: 'synthwave', label: 'Synthwave', category: 'Neon', colors: 2, generateStyle: (c1, c2) => ({ backgroundImage: `linear-gradient(to bottom, ${c1}, ${c2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textShadow: `0 0 15px ${c1}80` }) },
  { id: 'plasma', label: 'Plasma', category: 'Neon', colors: 2, generateStyle: (c1, c2) => ({ textShadow: `0 0 10px ${c1}, 0 0 20px ${c2}, 0 0 30px ${c1}` }) },
  { id: 'halogen', label: 'Halogen', category: 'Neon', colors: 1, generateStyle: (c1) => ({ color: '#ffffee', textShadow: `0 0 10px ${c1}, 0 0 30px ${c1}` }) },
  { id: 'pulse', label: 'Pulse Glow', category: 'Neon', colors: 1, generateStyle: (c1) => ({ textShadow: `0 0 5px ${c1}, 0 0 15px ${c1}` }) }, // Animation added in CSS
  { id: 'laser', label: 'Laser', category: 'Neon', colors: 2, generateStyle: (c1, c2) => ({ color: '#fff', WebkitTextStroke: `1px ${c1}`, textShadow: `0 0 15px ${c2}` }) },
  { id: 'neon-dark', label: 'Dark Neon', category: 'Neon', colors: 1, generateStyle: (c1) => ({ color: '#111', WebkitTextStroke: `1px ${c1}`, textShadow: `0 0 10px ${c1}` }) },

  // --- RETRO ---
  { id: 'retro-70s', label: '70s Stripe', category: 'Retro', colors: 2, generateStyle: (c1, c2) => ({ textShadow: `2px 2px 0 ${c1}, 4px 4px 0 ${c2}` }) },
  { id: 'arcade', label: 'Arcade', category: 'Retro', colors: 1, generateStyle: (c1) => ({ fontFamily: 'monospace', color: c1, textShadow: `2px 2px 0px #000` }) },
  { id: 'vhs', label: 'VHS Glitch', category: 'Retro', colors: 2, generateStyle: (c1, c2) => ({ textShadow: `2px 0 ${c1}, -2px 0 ${c2}` }) },
  { id: 'pixel', label: 'Pixelated', category: 'Retro', colors: 1, generateStyle: (c1) => ({ color: c1, imageRendering: 'pixelated' }) }, // Needs pixel font realistically
  { id: 'pop-art', label: 'Pop Art', category: 'Retro', colors: 2, generateStyle: (c1, c2) => ({ WebkitTextStroke: `2px #000`, textShadow: `4px 4px 0 ${c1}, 6px 6px 0 ${c2}` }) },
  { id: 'typewriter', label: 'Typewriter', category: 'Retro', colors: 1, generateStyle: (c1) => ({ fontFamily: '"Courier New", Courier, monospace', color: c1 }) },
  { id: 'western', label: 'Western', category: 'Retro', colors: 2, generateStyle: (c1, c2) => ({ fontFamily: 'serif', WebkitTextStroke: `1.5px ${c1}`, textShadow: `3px 3px 0 ${c2}` }) },
  { id: 'chrome-80s', label: '80s Chrome', category: 'Retro', colors: 2, generateStyle: (c1, c2) => ({ backgroundImage: `linear-gradient(to bottom, #fff 0%, ${c1} 50%, ${c2} 51%, #fff 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', WebkitTextStroke: '1px #000' }) },
  { id: 'stamp', label: 'Stamp', category: 'Retro', colors: 1, generateStyle: (c1) => ({ color: c1, border: `4px solid ${c1}`, padding: '4px 12px', borderRadius: '4px', transform: 'rotate(-5deg)' }) },
  { id: 'newsprint', label: 'Newsprint', category: 'Retro', colors: 1, generateStyle: (c1) => ({ color: c1, filter: 'contrast(150%) grayscale(100%)' }) },

  // --- MODERN ---
  { id: 'glass', label: 'Glassmorphism', category: 'Modern', colors: 1, generateStyle: (c1) => ({ color: 'rgba(255,255,255,0.8)', textShadow: `0 4px 10px ${c1}40`, backdropFilter: 'blur(10px)' }) },
  { id: 'brutalist', label: 'Brutalist', category: 'Modern', colors: 2, generateStyle: (c1, c2) => ({ backgroundColor: c1, color: c2, padding: '4px 8px', border: `3px solid ${c2}`, boxShadow: `6px 6px 0 ${c2}` }) },
  { id: 'neumorphic', label: 'Neumorphic', category: 'Modern', colors: 1, generateStyle: (c1) => ({ color: c1, textShadow: `3px 3px 6px #00000030, -3px -3px 6px #ffffff30` }) }, // Best on gray bg
  { id: 'gradient', label: 'Gradient', category: 'Modern', colors: 2, generateStyle: (c1, c2) => ({ backgroundImage: `linear-gradient(45deg, ${c1}, ${c2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }) },
  { id: 'foil', label: 'Gold Foil', category: 'Modern', colors: 2, generateStyle: (c1, c2) => ({ backgroundImage: `linear-gradient(45deg, ${c1}, ${c2}, ${c1})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }) },
  { id: 'minimal-3d', label: 'Minimal 3D', category: 'Modern', colors: 1, generateStyle: (c1) => ({ textShadow: `1px 1px 0 ${c1}, 2px 2px 0 ${c1}, 3px 3px 0 ${c1}, 4px 4px 0 ${c1}` }) },
  { id: 'frosted', label: 'Frosted', category: 'Modern', colors: 1, generateStyle: (c1) => ({ color: c1, opacity: 0.8, filter: 'blur(1px)' }) },
  { id: 'bubble-gum', label: 'Bubble Gum', category: 'Modern', colors: 2, generateStyle: (c1, c2) => ({ backgroundColor: c1, color: c2, borderRadius: '50px', padding: '8px 24px' }) },
  { id: 'duotone', label: 'Duotone', category: 'Modern', colors: 2, generateStyle: (c1, c2) => ({ WebkitTextStroke: `1px ${c1}`, textShadow: `-2px -2px 0 ${c1}, 2px 2px 0 ${c2}` }) },
  { id: 'chic', label: 'Chic', category: 'Modern', colors: 1, generateStyle: (c1) => ({ fontFamily: 'serif', letterSpacing: '0.2em', textTransform: 'uppercase', color: c1 }) },

  // --- DISTORTION / ABSTRACT ---
  { id: 'glitch-anim', label: 'Glitch Anim', category: 'Distortion', colors: 2, generateStyle: (c1, c2) => ({ textShadow: `2px 0 ${c1}, -2px 0 ${c2}`, animation: 'glitch-anim 2s infinite linear alternate-reverse' }) }, // requires CSS class for animation
  { id: 'shatter', label: 'Shatter', category: 'Distortion', colors: 2, generateStyle: (c1, c2) => ({ clipPath: 'polygon(0 0, 100% 0, 100% 45%, 0 55%)', color: c1, textShadow: `2px 2px 0 ${c2}` }) },
  { id: 'slice', label: 'Slice', category: 'Distortion', colors: 1, generateStyle: (c1) => ({ textShadow: `0 4px 0 ${c1}` }) }, // Requires pseudo-element for full effect, simple version here
  { id: 'anaglyph', label: 'Anaglyph', category: 'Distortion', colors: 0, generateStyle: () => ({ textShadow: '3px 0 0 red, -3px 0 0 cyan' }) },
  { id: 'motion-blur', label: 'Motion Blur', category: 'Distortion', colors: 1, generateStyle: (c1) => ({ color: 'transparent', textShadow: `0 0 8px ${c1}, 10px 0 12px ${c1}, -10px 0 12px ${c1}` }) },
  { id: 'ripple', label: 'Ripple', category: 'Distortion', colors: 1, generateStyle: (c1) => ({ WebkitTextStroke: `1px ${c1}`, color: 'transparent', textShadow: `0 0 4px ${c1}80, 0 0 8px ${c1}40` }) },
  { id: 'noise', label: 'Noise', category: 'Distortion', colors: 1, generateStyle: (c1) => ({ color: c1, filter: 'contrast(150%) url(#noise)' }) }, // SVG filter needed, or just standard CSS
  { id: 'melt', label: 'Melt', category: 'Distortion', colors: 1, generateStyle: (c1) => ({ textShadow: `0 2px 1px ${c1}, 0 4px 2px ${c1}, 0 6px 4px ${c1}` }) },
  { id: 'echo-blur', label: 'Echo Blur', category: 'Distortion', colors: 2, generateStyle: (c1, c2) => ({ textShadow: `0 0 10px ${c1}, 5px 5px 20px ${c2}` }) },
  { id: 'ghost', label: 'Ghost', category: 'Distortion', colors: 1, generateStyle: (c1) => ({ color: 'transparent', textShadow: `0 0 15px ${c1}` }) }
];

export const EFFECT_CATEGORIES = ['Basic', 'Neon', 'Retro', 'Modern', 'Distortion'] as const;

export function getEffectDefinition(id: string): TextEffectDefinition {
  const fallback = TEXT_EFFECTS_REGISTRY[0];
  if (!fallback) {
    throw new Error("Text effects registry is empty.");
  }

  return TEXT_EFFECTS_REGISTRY.find(e => e.id === id) ?? fallback;
}
