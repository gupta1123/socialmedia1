/**
 * Elements Registry
 *
 * Architecture:
 * - Each category has an id, label, and an array of ElementDef items.
 * - Each ElementDef has an id, label, and an SVG string (viewBox "0 0 100 100").
 * - To add new categories or elements, simply extend ELEMENT_CATEGORIES below.
 * - The pane renders these without any hardcoding — pure data-driven.
 */

export interface ElementDef {
  id: string;
  label: string;
  svg: string; // full <svg> string, viewBox="0 0 100 100"
}

export interface ElementCategory {
  id: string;
  label: string;
  elements: ElementDef[];
}

// ─── Helper to build clean SVG strings ────────────────────────────────────────
function svg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor">${body}</svg>`;
}

// ─── CATEGORY: Basic Shapes ───────────────────────────────────────────────────
const SHAPES: ElementCategory = {
  id: "shapes",
  label: "Shapes",
  elements: [
    { id: "rect", label: "Rectangle", svg: svg('<rect x="10" y="25" width="80" height="50" rx="4"/>') },
    { id: "circle", label: "Circle", svg: svg('<circle cx="50" cy="50" r="40"/>') },
    { id: "triangle", label: "Triangle", svg: svg('<polygon points="50,10 90,90 10,90"/>') },
    { id: "diamond", label: "Diamond", svg: svg('<polygon points="50,5 95,50 50,95 5,50"/>') },
    { id: "pentagon", label: "Pentagon", svg: svg('<polygon points="50,5 95,35 77,90 23,90 5,35"/>') },
    { id: "hexagon", label: "Hexagon", svg: svg('<polygon points="50,5 90,27.5 90,72.5 50,95 10,72.5 10,27.5"/>') },
    { id: "octagon", label: "Octagon", svg: svg('<polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30"/>') },
    { id: "star-4", label: "4-Point Star", svg: svg('<polygon points="50,5 55,45 95,50 55,55 50,95 45,55 5,50 45,45"/>') },
    { id: "star-5", label: "5-Point Star", svg: svg('<polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35"/>') },
    { id: "star-6", label: "6-Point Star", svg: svg('<polygon points="50,5 62,30 90,20 75,45 95,65 65,62 60,92 45,70 15,80 30,55 5,40 32,38"/>') },
    { id: "parallelogram", label: "Parallelogram", svg: svg('<polygon points="25,25 90,25 75,75 10,75"/>') },
    { id: "trapezoid", label: "Trapezoid", svg: svg('<polygon points="20,25 80,25 95,75 5,75"/>') },
  ],
};

// ─── CATEGORY: Lines & Arrows ─────────────────────────────────────────────────
const LINES: ElementCategory = {
  id: "lines",
  label: "Lines & Arrows",
  elements: [
    { id: "line-h", label: "Horizontal Line", svg: svg('<rect x="5" y="46" width="90" height="8" rx="4"/>') },
    { id: "line-v", label: "Vertical Line", svg: svg('<rect x="46" y="5" width="8" height="90" rx="4"/>') },
    { id: "line-diag", label: "Diagonal Line", svg: svg('<line x1="10" y1="10" x2="90" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" fill="none"/>') },
    { id: "arrow-right", label: "Arrow Right", svg: svg('<path d="M10 50 H75 M60 30 L85 50 L60 70" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>') },
    { id: "arrow-left", label: "Arrow Left", svg: svg('<path d="M90 50 H25 M40 30 L15 50 L40 70" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>') },
    { id: "arrow-up", label: "Arrow Up", svg: svg('<path d="M50 90 V25 M30 40 L50 15 L70 40" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>') },
    { id: "arrow-down", label: "Arrow Down", svg: svg('<path d="M50 10 V75 M30 60 L50 85 L70 60" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>') },
    { id: "arrow-double", label: "Double Arrow", svg: svg('<path d="M15 50 H85 M25 30 L5 50 L25 70 M75 30 L95 50 L75 70" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>') },
    { id: "arrow-curved", label: "Curved Arrow", svg: svg('<path d="M20 70 Q20 20 70 20 M55 10 L75 20 L60 35" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>') },
    { id: "double-ended", label: "Double Ended", svg: svg('<path d="M10 50 H90" stroke="currentColor" stroke-width="8" stroke-linecap="round" fill="none"/><circle cx="10" cy="50" r="8"/><circle cx="90" cy="50" r="8"/>') },
  ],
};

// ─── CATEGORY: Frames & Borders ───────────────────────────────────────────────
const FRAMES: ElementCategory = {
  id: "frames",
  label: "Frames & Borders",
  elements: [
    { id: "frame-rect", label: "Rect Frame", svg: svg('<rect x="10" y="10" width="80" height="80" rx="4" stroke="currentColor" stroke-width="8" fill="none"/>') },
    { id: "frame-rounded", label: "Rounded Frame", svg: svg('<rect x="10" y="10" width="80" height="80" rx="20" stroke="currentColor" stroke-width="8" fill="none"/>') },
    { id: "frame-circle", label: "Circle Frame", svg: svg('<circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="8" fill="none"/>') },
    { id: "frame-double", label: "Double Frame", svg: svg('<rect x="8" y="8" width="84" height="84" rx="4" stroke="currentColor" stroke-width="4" fill="none"/><rect x="18" y="18" width="64" height="64" rx="4" stroke="currentColor" stroke-width="4" fill="none"/>') },
    { id: "frame-dashed", label: "Dashed Frame", svg: svg('<rect x="10" y="10" width="80" height="80" rx="4" stroke="currentColor" stroke-width="6" fill="none" stroke-dasharray="10 6"/>') },
    { id: "badge-rect", label: "Badge Rect", svg: svg('<rect x="5" y="25" width="90" height="50" rx="25"/><rect x="18" y="35" width="64" height="30" rx="15" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>') },
    { id: "badge-pill", label: "Pill Badge", svg: svg('<rect x="5" y="30" width="90" height="40" rx="20"/>') },
    { id: "tag", label: "Tag", svg: svg('<path d="M10 10 H60 L90 50 L60 90 H10 Z"/>') },
    { id: "banner", label: "Banner", svg: svg('<path d="M5 20 H95 V70 H55 L50 85 L45 70 H5 Z"/>') },
    { id: "ribbon", label: "Ribbon", svg: svg('<path d="M50 5 L90 20 L85 50 L50 95 L15 50 L10 20 Z"/>') },
    { id: "label-left", label: "Label Left", svg: svg('<path d="M20 25 H85 Q95 25 95 50 Q95 75 85 75 H20 L5 50 Z"/>') },
    { id: "label-right", label: "Label Right", svg: svg('<path d="M80 25 H15 Q5 25 5 50 Q5 75 15 75 H80 L95 50 Z"/>') },
  ],
};

// ─── CATEGORY: UI Elements ─────────────────────────────────────────────────────
const UI_ELEMENTS: ElementCategory = {
  id: "ui",
  label: "UI Elements",
  elements: [
    { id: "btn-primary", label: "Button", svg: svg('<rect x="10" y="35" width="80" height="30" rx="6"/><rect x="20" y="44" width="60" height="12" rx="3" fill="rgba(255,255,255,0.3)"/>') },
    { id: "badge-new", label: "New Badge", svg: svg('<rect x="15" y="30" width="70" height="40" rx="20"/><text x="50" y="56" text-anchor="middle" font-size="22" font-weight="bold" fill="white" font-family="Arial">NEW</text>') },
    { id: "badge-hot", label: "Hot Badge", svg: svg('<rect x="15" y="30" width="70" height="40" rx="20"/><text x="50" y="56" text-anchor="middle" font-size="22" font-weight="bold" fill="white" font-family="Arial">HOT</text>') },
    { id: "badge-sale", label: "Sale Badge", svg: svg('<circle cx="50" cy="50" r="42"/><text x="50" y="58" text-anchor="middle" font-size="26" font-weight="bold" fill="white" font-family="Arial">SALE</text>') },
    { id: "badge-off", label: "% Off", svg: svg('<polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35"/><text x="50" y="57" text-anchor="middle" font-size="20" font-weight="bold" fill="white" font-family="Arial">%</text>') },
    { id: "chat-bubble", label: "Chat Bubble", svg: svg('<path d="M10 15 Q10 5 20 5 H80 Q90 5 90 15 V55 Q90 65 80 65 H55 L40 85 L40 65 H20 Q10 65 10 55 Z"/>') },
    { id: "chat-left", label: "Chat Left", svg: svg('<path d="M10 15 Q10 5 20 5 H80 Q90 5 90 15 V55 Q90 65 80 65 H30 L15 85 L20 65 H20 Q10 65 10 55 Z"/>') },
    { id: "tooltip", label: "Tooltip", svg: svg('<path d="M10 10 Q10 5 15 5 H85 Q90 5 90 10 V60 Q90 65 85 65 H55 L50 75 L45 65 H15 Q10 65 10 60 Z"/>') },
    { id: "check-circle", label: "Check Circle", svg: svg('<circle cx="50" cy="50" r="42"/><path d="M30 50 L44 64 L70 36" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>') },
    { id: "progress-bar", label: "Progress Bar", svg: svg('<rect x="5" y="40" width="90" height="20" rx="10" fill="currentColor" opacity="0.2"/><rect x="5" y="40" width="55" height="20" rx="10"/>') },
  ],
};

// ─── CATEGORY: Icons ──────────────────────────────────────────────────────────
const ICONS: ElementCategory = {
  id: "icons",
  label: "Icons",
  elements: [
    { id: "icon-heart", label: "Heart", svg: svg('<path d="M50 80 C50 80 10 55 10 30 A20 20 0 0 1 50 25 A20 20 0 0 1 90 30 C90 55 50 80 50 80Z"/>') },
    { id: "icon-star", label: "Star", svg: svg('<polygon points="50,8 61,35 92,35 68,55 78,85 50,65 22,85 32,55 8,35 39,35"/>') },
    { id: "icon-lightning", label: "Lightning", svg: svg('<polygon points="60,5 25,55 48,55 40,95 75,45 52,45"/>') },
    { id: "icon-location", label: "Location Pin", svg: svg('<path d="M50 5 A25 25 0 0 1 75 30 C75 50 50 70 50 70 C50 70 25 50 25 30 A25 25 0 0 1 50 5Z"/><circle cx="50" cy="30" r="10" fill="white"/>') },
    { id: "icon-phone", label: "Phone", svg: svg('<path d="M30 10 Q25 10 25 15 L25 85 Q25 90 30 90 L70 90 Q75 90 75 85 L75 15 Q75 10 70 10 Z"/><circle cx="50" cy="80" r="5" fill="white"/><rect x="38" y="18" width="24" height="4" rx="2" fill="white"/>') },
    { id: "icon-mail", label: "Envelope", svg: svg('<rect x="10" y="20" width="80" height="60" rx="6"/><path d="M10 26 L50 55 L90 26" stroke="white" stroke-width="5" fill="none"/>') },
    { id: "icon-camera", label: "Camera", svg: svg('<rect x="5" y="25" width="90" height="60" rx="8"/><circle cx="50" cy="55" r="18" fill="white" opacity="0.3"/><circle cx="50" cy="55" r="12" fill="white" opacity="0.6"/><circle cx="50" cy="55" r="6" fill="white"/><rect x="35" y="17" width="30" height="12" rx="4"/>') },
    { id: "icon-crown", label: "Crown", svg: svg('<path d="M10 75 L20 35 L40 60 L50 20 L60 60 L80 35 L90 75 Z"/>') },
    { id: "icon-diamond", label: "Gem", svg: svg('<polygon points="50,10 80,35 80,35 50,90 20,35"/><polygon points="20,35 50,35 50,90" opacity="0.6"/><polygon points="80,35 50,35 50,90" opacity="0.4"/><polygon points="20,35 35,10 50,35" opacity="0.8"/><polygon points="80,35 65,10 50,35" opacity="0.7"/>') },
    { id: "icon-fire", label: "Fire", svg: svg('<path d="M50 95 C25 95 10 78 10 60 C10 45 22 35 30 28 C28 40 35 45 40 42 C35 30 45 15 50 5 C50 5 65 25 58 40 C63 37 68 32 65 22 C75 32 90 48 90 65 C90 82 72 95 50 95Z"/>') },
    { id: "icon-leaf", label: "Leaf", svg: svg('<path d="M50 90 C50 90 15 70 15 35 C15 20 30 5 50 5 C70 5 85 20 85 35 C85 70 50 90 50 90Z M50 90 L50 50" stroke="rgba(255,255,255,0.5)" stroke-width="3" fill="none"/>') },
    { id: "icon-wave", label: "Wave", svg: svg('<path d="M5 50 Q20 30 35 50 Q50 70 65 50 Q80 30 95 50" stroke="currentColor" stroke-width="8" stroke-linecap="round" fill="none"/>') },
  ],
};

// ─── CATEGORY: Decorative ─────────────────────────────────────────────────────
const DECORATIVE: ElementCategory = {
  id: "decorative",
  label: "Decorative",
  elements: [
    { id: "deco-burst", label: "Sunburst", svg: svg('<circle cx="50" cy="50" r="15"/>' + Array.from({ length: 12 }, (_, i) => { const a = (i * 30 * Math.PI) / 180; const x1 = 50 + 20 * Math.cos(a); const y1 = 50 + 20 * Math.sin(a); const x2 = 50 + 42 * Math.cos(a); const y2 = 50 + 42 * Math.sin(a); return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`; }).join('')) },
    { id: "deco-dots-3", label: "3 Dots", svg: svg('<circle cx="20" cy="50" r="10"/><circle cx="50" cy="50" r="10"/><circle cx="80" cy="50" r="10"/>') },
    { id: "deco-dots-grid", label: "Dot Grid", svg: svg([20, 50, 80].flatMap(x => [20, 50, 80].map(y => `<circle cx="${x}" cy="${y}" r="6"/>`)).join('')) },
    { id: "deco-line-group", label: "Line Group", svg: svg('<rect x="10" y="30" width="80" height="8" rx="4"/><rect x="10" y="46" width="60" height="8" rx="4"/><rect x="10" y="62" width="70" height="8" rx="4"/>') },
    { id: "deco-quote-open", label: "Open Quote", svg: svg('<path d="M15 25 C15 25 5 38 5 50 C5 60 12 67 20 67 C28 67 35 60 35 52 C35 44 28 37 20 37 C22 30 28 24 35 20 Z M55 25 C55 25 45 38 45 50 C45 60 52 67 60 67 C68 67 75 60 75 52 C75 44 68 37 60 37 C62 30 68 24 75 20 Z"/>') },
    { id: "deco-quote-close", label: "Close Quote", svg: svg('<path d="M65 75 C65 75 75 62 75 50 C75 40 68 33 60 33 C52 33 45 40 45 48 C45 56 52 63 60 63 C58 70 52 76 45 80 Z M25 75 C25 75 35 62 35 50 C35 40 28 33 20 33 C12 33 5 40 5 48 C5 56 12 63 20 63 C18 70 12 76 5 80 Z"/>') },
    { id: "deco-corner-tl", label: "Corner TL", svg: svg('<path d="M5 60 L5 5 L60 5" stroke="currentColor" stroke-width="8" stroke-linecap="round" fill="none"/>') },
    { id: "deco-corner-br", label: "Corner BR", svg: svg('<path d="M95 40 L95 95 L40 95" stroke="currentColor" stroke-width="8" stroke-linecap="round" fill="none"/>') },
    { id: "deco-cross", label: "Cross", svg: svg('<rect x="40" y="5" width="20" height="90" rx="5"/><rect x="5" y="40" width="90" height="20" rx="5"/>') },
    { id: "deco-plus", label: "Plus", svg: svg('<rect x="43" y="15" width="14" height="70" rx="4"/><rect x="15" y="43" width="70" height="14" rx="4"/>') },
    { id: "deco-minus", label: "Minus", svg: svg('<rect x="10" y="43" width="80" height="14" rx="4"/>') },
    { id: "deco-infinity", label: "Infinity", svg: svg('<path d="M35 50 C35 35 20 25 10 35 C0 45 0 55 10 65 C20 75 35 65 50 50 C65 35 80 25 90 35 C100 45 100 55 90 65 C80 75 65 65 50 50 Z" stroke="currentColor" stroke-width="8" fill="none" stroke-linecap="round"/>') },
  ],
};

// ─── Master list ───────────────────────────────────────────────────────────────
export const ELEMENT_CATEGORIES: ElementCategory[] = [
  SHAPES,
  LINES,
  FRAMES,
  UI_ELEMENTS,
  ICONS,
  DECORATIVE,
];

export function getAllElements(): ElementDef[] {
  return ELEMENT_CATEGORIES.flatMap((cat) => cat.elements);
}

export function getElementById(id: string): ElementDef | undefined {
  return getAllElements().find((el) => el.id === id);
}
