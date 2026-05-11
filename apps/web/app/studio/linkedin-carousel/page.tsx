"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { BrandAssetRecord, BrandDetail, ProjectDetail, ProjectRecord } from "@image-lab/contracts";
import { getBrandDetail, getProjectDetail, getProjects } from "../../../lib/api";
import { useStudio } from "../studio-context";
import { useRegisterTopbarControls, useRegisterTopbarMeta } from "../topbar-actions-context";
import { ELEMENT_CATEGORIES, type ElementDef } from "../ai-edit/lib/elements-registry";
import { GOOGLE_FONTS, generateGoogleFontsUrl } from "../ai-edit/lib/fonts-registry";

type DeckMode = "document" | "ad";
type DeckGoal = "project_launch" | "location" | "amenity" | "investment" | "construction" | "channel_partner";
type SlideLayout = "cover" | "split" | "stat" | "checklist" | "quote" | "cta";
type EditorTab = "content" | "style" | "layout" | "elements" | "assets";
type PreviewDevice = "desktop" | "mobile";
type TextFieldKey = "eyebrow" | "headline" | "body" | "footer";
type SettingsPanel = "palette" | "text" | "background" | "counter" | "creator";
type TemplateId = "project-launch" | "location-story" | "investor-proof" | "amenity-tour" | "construction-update" | "nri-guide";
type BackgroundEffectCategory = "featured" | "all" | "gradients" | "shapes" | "textures" | "patterns" | "arrows";
type BackgroundEffectId =
  | "paper-of-sorrows"
  | "urban-jungle"
  | "vertical-gradient"
  | "horizontal-gradient"
  | "bubbly-blobs"
  | "pebble-patch"
  | "poly-grid"
  | "pulse-radar"
  | "sketchy-directions"
  | "arrow-lane"
  | "speckle-paper"
  | "soft-spotlight";
type IconName =
  | "assets"
  | "bold"
  | "building"
  | "check"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "copy"
  | "download"
  | "file"
  | "image"
  | "italic"
  | "layout"
  | "list"
  | "maximize"
  | "mobile"
  | "refresh"
  | "search"
  | "share"
  | "spark"
  | "type"
  | "undo"
  | "redo";

type CarouselSlide = {
  id: string;
  layout: SlideLayout;
  eyebrow: string;
  headline: string;
  body: string;
  footer: string;
  stat?: string;
  elements?: CarouselElement[];
  richText?: CarouselRichText;
  textStyles?: Partial<Record<TextFieldKey, CarouselTextStyle>>;
};

type CarouselRichText = {
  headline?: RichTextMarks;
  body?: RichTextMarks;
};

type RichTextMarks = {
  bold?: boolean;
  italic?: boolean;
  list?: boolean;
  link?: string;
};

type CarouselElement = {
  id: string;
  elementId: string;
  label: string;
  svg: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  colorRole: "accent" | "secondary" | "ink";
};

type CarouselTextStyle = {
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
};

type TextDragState = {
  field: TextFieldKey;
  offsetX: number;
  offsetY: number;
};

type DeckSpec = {
  label: string;
  ratio: string;
  width: number;
  height: number;
};

type DeckPalette = {
  ink: string;
  paper: string;
  soft: string;
  accent: string;
  secondary: string;
};

type ResolvedTextLayout = {
  x: number;
  y: number;
  maxWidth: number;
  fontSize: number;
  fontFamily: string;
  color: string;
};

type CarouselPalettePreset = {
  id: string;
  name: string;
  mood: string;
  colors: string[];
};

type BackgroundEffect = {
  id: BackgroundEffectId;
  name: string;
  category: Exclude<BackgroundEffectCategory, "featured" | "all">;
  featured?: boolean;
};

const deckModes: Record<DeckMode, DeckSpec> = {
  document: {
    label: "Document PDF",
    ratio: "4:5",
    width: 1080,
    height: 1350
  },
  ad: {
    label: "Ad cards",
    ratio: "1:1",
    width: 1080,
    height: 1080
  }
};

const deckGoals: Array<{ value: DeckGoal; label: string }> = [
  { value: "project_launch", label: "Project launch" },
  { value: "location", label: "Location story" },
  { value: "amenity", label: "Amenity spotlight" },
  { value: "investment", label: "Investment case" },
  { value: "construction", label: "Construction update" },
  { value: "channel_partner", label: "Partner enablement" }
];

const slideLayouts: Array<{ value: SlideLayout; label: string }> = [
  { value: "cover", label: "Cover" },
  { value: "split", label: "Split" },
  { value: "stat", label: "Proof" },
  { value: "checklist", label: "Checklist" },
  { value: "quote", label: "Statement" },
  { value: "cta", label: "CTA" }
];

const editorTabs: Array<{ value: EditorTab; label: string; icon: IconName }> = [
  { value: "content", label: "Content", icon: "type" },
  { value: "style", label: "Style", icon: "spark" },
  { value: "layout", label: "Layout", icon: "layout" },
  { value: "elements", label: "Elements", icon: "assets" },
  { value: "assets", label: "Assets", icon: "assets" }
];

const textFieldOptions: Array<{ value: TextFieldKey; label: string }> = [
  { value: "eyebrow", label: "Eyebrow" },
  { value: "headline", label: "Headline" },
  { value: "body", label: "Body" },
  { value: "footer", label: "Footer" }
];

const carouselFontOptions = [
  { label: "Brand Sans", value: "Poppins, Arial" },
  { label: "Modern Sans", value: "'Helvetica Neue', Arial, sans-serif" },
  { label: "Editorial Serif", value: "Georgia, 'Times New Roman', serif" },
  ...GOOGLE_FONTS
];

const carouselPalettePresets: CarouselPalettePreset[] = [
  { id: "editorial-ivory-navy", name: "Editorial Ivory Navy", mood: "Luxury real estate", colors: ["#F7F1E8", "#102A4C", "#D6AE55", "#111111", "#FFFFFF"] },
  { id: "sandstone-olive", name: "Sandstone Olive", mood: "Organic premium", colors: ["#F4E7D3", "#8A8F49", "#3E4635", "#C6A15B", "#FFFFFF"] },
  { id: "charcoal-cream-gold", name: "Charcoal Cream Gold", mood: "Classic premium", colors: ["#171717", "#F8F1E7", "#C9A35A", "#5E5347", "#FFFFFF"] },
  { id: "sage-marble", name: "Sage Marble", mood: "Calm interiors", colors: ["#F5F4EE", "#A8B7A2", "#526B5B", "#D7CEC2", "#1E2A22"] },
  { id: "cobalt-sand", name: "Cobalt Sand", mood: "Modern contrast", colors: ["#F1E6D2", "#123C69", "#2D7DD2", "#D9A441", "#0B172A"] },
  { id: "terracotta-linen", name: "Terracotta Linen", mood: "Warm residential", colors: ["#F8EFE4", "#B8613B", "#7A3F2B", "#D8B28A", "#2D2019"] },
  { id: "mist-blue-stone", name: "Mist Blue Stone", mood: "Clean architecture", colors: ["#EEF3F6", "#AFC5D3", "#456174", "#D3B88C", "#17212B"] },
  { id: "forest-brass", name: "Forest Brass", mood: "Heritage luxury", colors: ["#12251C", "#2F5D45", "#BFA46A", "#F4EBDD", "#0B0F0C"] },
  { id: "warm-mono", name: "Warm Mono", mood: "Minimal editorial", colors: ["#F7F2EB", "#D8D0C6", "#8F867B", "#3E3934", "#141210"] },
  { id: "sunlit-concrete", name: "Sunlit Concrete", mood: "Daylight tower", colors: ["#F4F1EA", "#CFC7B8", "#9DA6A8", "#E0B15B", "#263238"] },
  { id: "indigo-copper", name: "Indigo Copper", mood: "Evening premium", colors: ["#101A3A", "#293B78", "#C87941", "#F0E6DA", "#0D0D12"] },
  { id: "olive-ink", name: "Olive Ink", mood: "Quiet confidence", colors: ["#EEF0E7", "#7B8544", "#2B3426", "#111827", "#BFA36B"] },
  { id: "pearl-emerald", name: "Pearl Emerald", mood: "Upscale fresh", colors: ["#FAF7F0", "#0F5B4A", "#71A894", "#D6B56D", "#10201C"] },
  { id: "desert-dusk", name: "Desert Dusk", mood: "Warm cinematic", colors: ["#F6E2C4", "#D28A5C", "#8F4C45", "#3B2A35", "#15121A"] },
  { id: "graphite-sky", name: "Graphite Sky", mood: "Urban clean", colors: ["#F4F7F8", "#B8D7EA", "#556B7B", "#222831", "#FFFFFF"] },
  { id: "champagne-plum", name: "Champagne Plum", mood: "Boutique luxury", colors: ["#F5E7D3", "#B99B6B", "#5A2A43", "#2C1824", "#FFFDF8"] },
  { id: "clay-sage", name: "Clay Sage", mood: "Human and warm", colors: ["#F2E8DC", "#C9825B", "#9AA17A", "#58614A", "#27251F"] },
  { id: "midnight-azure", name: "Midnight Azure", mood: "Sharp digital", colors: ["#070B1D", "#153E75", "#2C7BE5", "#E6EEF8", "#FFFFFF"] },
  { id: "cream-burgundy", name: "Cream Burgundy", mood: "Prestige launch", colors: ["#FBF2E6", "#7A1E2C", "#C2A261", "#2A1C1F", "#FFFFFF"] },
  { id: "stone-teal", name: "Stone Teal", mood: "Balanced modern", colors: ["#E8E3DA", "#6D7D7A", "#006D77", "#83C5BE", "#1C2B2D"] },
  { id: "butter-charcoal", name: "Butter Charcoal", mood: "Soft premium", colors: ["#FFF2B8", "#F6E8C8", "#343434", "#909090", "#FFFFFF"] },
  { id: "rosewood-cream", name: "Rosewood Cream", mood: "Warm affluent", colors: ["#FFF6EC", "#8A3A3A", "#B56B5E", "#D8B58A", "#251817"] },
  { id: "ivory-cobalt-red", name: "Ivory Cobalt Red", mood: "Bold modern", colors: ["#F8F4EA", "#0047AB", "#C1121F", "#0B1320", "#FFFFFF"] },
  { id: "sage-citrus", name: "Sage Citrus", mood: "Fresh lifestyle", colors: ["#F3F1E8", "#9CAF88", "#D6D84F", "#4F6F52", "#1B251C"] },
  { id: "black-tan", name: "Black Tan", mood: "Premium monochrome", colors: ["#0E0E0E", "#C8A06A", "#F1E5D0", "#7A6A57", "#FFFFFF"] },
  { id: "ocean-sand", name: "Ocean Sand", mood: "Coastal calm", colors: ["#EFF7F8", "#1B4965", "#5FA8D3", "#DCC7AA", "#112B3C"] },
  { id: "muted-rainbow", name: "Muted Rainbow", mood: "Festive refined", colors: ["#D95D39", "#E9C46A", "#2A9D8F", "#457B9D", "#6D597A"] },
  { id: "heritage-blue", name: "Heritage Blue", mood: "Institutional trust", colors: ["#F5F1E6", "#113B5D", "#2F5F8F", "#C9A66B", "#0C1D2B"] },
  { id: "moss-cream", name: "Moss Cream", mood: "Nature-led", colors: ["#F8F5EC", "#6B7D47", "#3A4A2F", "#CBB994", "#FFFFFF"] },
  { id: "golden-hour", name: "Golden Hour", mood: "Warm skyline", colors: ["#FFF0D4", "#F2B84B", "#C47A2C", "#344E41", "#101820"] },
  { id: "blueprint", name: "Blueprint", mood: "Architecture proof", colors: ["#F4F7FB", "#0A2540", "#2F80ED", "#98A6B3", "#FFFFFF"] },
  { id: "deep-green-ivory", name: "Deep Green Ivory", mood: "Evergreen luxury", colors: ["#F7F3E8", "#0B3D2E", "#2E6F55", "#BFA56A", "#FFFFFF"] },
  { id: "terrace-night", name: "Terrace Night", mood: "Night luxury", colors: ["#08111F", "#183B56", "#C79B45", "#EADDC8", "#FFFFFF"] },
  { id: "royal-cream", name: "Royal Cream", mood: "Formal premium", colors: ["#F8EDD8", "#1A2E5A", "#384E8A", "#C8A45D", "#0B1020"] }
];

const slideCounts = [4, 5, 6, 7, 8];

const platformFormats = [
  { id: "linkedin-45", label: "LinkedIn (4:5, Recommended)", mode: "document" as DeckMode },
  { id: "linkedin-11", label: "LinkedIn (1:1)", mode: "ad" as DeckMode },
  { id: "instagram-45", label: "Instagram Feed (4:5)", mode: "document" as DeckMode },
  { id: "instagram-11", label: "Instagram Feed (1:1)", mode: "ad" as DeckMode },
  { id: "stories-916", label: "Stories/Reels (9:16 preview)", mode: "document" as DeckMode },
  { id: "ppt-169", label: "PowerPoint (16:9 export later)", mode: "document" as DeckMode }
];

const carouselTemplates: Array<{ id: TemplateId; label: string; goal: DeckGoal; description: string; color: string }> = [
  { id: "project-launch", label: "Project Launch", goal: "project_launch", description: "Introduce a project with positioning, product clarity, and CTA.", color: "#f0c766" },
  { id: "location-story", label: "Location Advantage", goal: "location", description: "Turn connectivity, daily convenience, and micro-market pull into a story.", color: "#8eb7c8" },
  { id: "investor-proof", label: "Investor Proof", goal: "investment", description: "Frame price, trust, progress, and long-term confidence.", color: "#c7946b" },
  { id: "amenity-tour", label: "Amenity Tour", goal: "amenity", description: "Show lifestyle value without becoming a feature dump.", color: "#a6b98a" },
  { id: "construction-update", label: "Construction Update", goal: "construction", description: "Make progress updates feel credible and easy to share.", color: "#9aa5b1" },
  { id: "nri-guide", label: "NRI Buyer Guide", goal: "channel_partner", description: "Create an explainer for remote buyers and partner teams.", color: "#9f8ad0" }
];

const fontPairOptions = [
  "Poppins + Inter",
  "Playfair Display + Chivo",
  "DM Serif Display + DM Sans",
  "Archivo Black + Archivo",
  "Lora + Ubuntu",
  "Montserrat + Work Sans",
  "Bebas + Lato",
  "Libre Baskerville + Space Grotesk"
];

const backgroundEffectCategories: Array<{ id: BackgroundEffectCategory; label: string }> = [
  { id: "featured", label: "Featured" },
  { id: "all", label: "All Effects" },
  { id: "gradients", label: "Gradients" },
  { id: "shapes", label: "Shapes" },
  { id: "textures", label: "Textures" },
  { id: "patterns", label: "Patterns" },
  { id: "arrows", label: "Arrows" }
];

const backgroundEffectLibrary: BackgroundEffect[] = [
  { id: "paper-of-sorrows", name: "Paper Of Sorrows", category: "textures", featured: true },
  { id: "urban-jungle", name: "Urban Jungle", category: "textures", featured: true },
  { id: "vertical-gradient", name: "Vertical Gradient", category: "gradients", featured: true },
  { id: "horizontal-gradient", name: "Horizontal Gradient", category: "gradients" },
  { id: "bubbly-blobs", name: "Bubbly Blobs", category: "shapes", featured: true },
  { id: "pebble-patch", name: "Pebble Patch", category: "shapes" },
  { id: "poly-grid", name: "Poly Grid", category: "patterns", featured: true },
  { id: "pulse-radar", name: "Pulse Radar", category: "patterns" },
  { id: "sketchy-directions", name: "Sketchy Directions", category: "arrows", featured: true },
  { id: "arrow-lane", name: "Arrow Lane", category: "arrows" },
  { id: "speckle-paper", name: "Speckle Paper", category: "textures" },
  { id: "soft-spotlight", name: "Soft Spotlight", category: "gradients" }
];
const defaultBackgroundEffect = backgroundEffectLibrary[0] as BackgroundEffect;

export default function LinkedInCarouselPage() {
  const { sessionToken, activeBrandId, activeBrand, activeAssets, setMessage } = useStudio();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [brandDetail, setBrandDetail] = useState<BrandDetail | null>(null);
  const [deckMode, setDeckMode] = useState<DeckMode>("document");
  const [goal, setGoal] = useState<DeckGoal>("project_launch");
  const [topic, setTopic] = useState("Why this project deserves attention now");
  const [slideCount, setSlideCount] = useState(6);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("content");
  const [elementQuery, setElementQuery] = useState("");
  const [activeElementCategory, setActiveElementCategory] = useState("all");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [previewScale, setPreviewScale] = useState(1);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [canvasPanStart, setCanvasPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [selectedTextField, setSelectedTextField] = useState<TextFieldKey>("headline");
  const [textDragState, setTextDragState] = useState<TextDragState | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedPaletteId, setSelectedPaletteId] = useState("brand");
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateId>("project-launch");
  const [selectedPlatformId, setSelectedPlatformId] = useState("linkedin-45");
  const [activeSettingsPanel, setActiveSettingsPanel] = useState<SettingsPanel>("palette");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [showCreatorInfo, setShowCreatorInfo] = useState(true);
  const [showCounters, setShowCounters] = useState(true);
  const [backgroundEffects, setBackgroundEffects] = useState(true);
  const [selectedBackgroundEffectId, setSelectedBackgroundEffectId] = useState<BackgroundEffectId>("paper-of-sorrows");
  const [backgroundEffectCategory, setBackgroundEffectCategory] = useState<BackgroundEffectCategory>("featured");
  const [alternateSlideColors, setAlternateSlideColors] = useState(true);
  const [selectedFontPair, setSelectedFontPair] = useState("Poppins + Inter");
  const [textScale, setTextScale] = useState<"compact" | "regular" | "large">("regular");
  const [textAlignment, setTextAlignment] = useState<"left" | "center" | "right">("center");
  const [uppercaseTitles, setUppercaseTitles] = useState(false);
  const [customFontCombination, setCustomFontCombination] = useState(false);
  const [backgroundIntensity, setBackgroundIntensity] = useState(55);
  const [counterPosition, setCounterPosition] = useState<"top-right" | "bottom-right" | "bottom-center">("top-right");
  const [cornerStyle, setCornerStyle] = useState<"square" | "soft" | "round">("soft");
  const [creatorName, setCreatorName] = useState(activeBrand?.name ?? "Prescon");
  const [creatorTitle, setCreatorTitle] = useState("Real estate marketing team");
  const [status, setStatus] = useState("");
  const previewShellRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);

  const topbarControls = useMemo(
    () => (
      <div className="linkedin-carousel-topbar-controls">
        <span className="linkedin-carousel-save-state">
          <Icon name="check" />
          Saved Draft
        </span>
        <button className="linkedin-carousel-topbar-icon" disabled type="button" aria-label="Undo">
          <Icon name="undo" />
        </button>
        <button className="linkedin-carousel-topbar-icon" disabled type="button" aria-label="Redo">
          <Icon name="redo" />
        </button>
        <details className="linkedin-carousel-download-menu">
          <summary aria-label="Export carousel">
            <Icon name="download" />
            <span>{exporting ? "Saving..." : "Export"}</span>
            <Icon name="chevronDown" />
          </summary>
          <div className="linkedin-carousel-download-options">
            <button onClick={() => window.print()} type="button">
              PDF
            </button>
            <button disabled={exporting || slides.length === 0} onClick={() => void exportCurrentPng()} type="button">
              Current PNG
            </button>
            <button disabled={exporting || slides.length === 0} onClick={() => void exportAllPngs()} type="button">
              All PNGs
            </button>
          </div>
        </details>
      </div>
    ),
    [exporting, slides, activeBrand?.name, projectDetail?.project.name, topic]
  );

  const topbarMeta = useMemo(
    () => ({
      title: "LinkedIn Carousel Builder",
      subtitle: "Build editable real-estate document carousels from verified project inputs."
    }),
    []
  );

  useRegisterTopbarControls(topbarControls);
  useRegisterTopbarMeta(topbarMeta);

  useEffect(() => {
    if (!sessionToken || !activeBrandId) return;
    let cancelled = false;

    Promise.all([
      getProjects(sessionToken, { brandId: activeBrandId }),
      getBrandDetail(sessionToken, activeBrandId)
    ])
      .then(([projectRows, brand]) => {
        if (cancelled) return;
        setProjects(projectRows);
        setBrandDetail(brand);
        setProjectId((current) => current && projectRows.some((project) => project.id === current) ? current : projectRows[0]?.id ?? "");
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not load carousel context.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeBrandId, sessionToken, setMessage]);

  useEffect(() => {
    if (!sessionToken || !projectId) {
      setProjectDetail(null);
      return;
    }

    let cancelled = false;
    getProjectDetail(sessionToken, projectId)
      .then((detail) => {
        if (!cancelled) setProjectDetail(detail);
      })
      .catch((error) => {
        if (!cancelled) {
          setProjectDetail(null);
          setMessage(error instanceof Error ? error.message : "Could not load project details.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, sessionToken, setMessage]);

  const brandPalette = brandDetail?.activeProfile?.profile.palette;
  const selectedPalettePreset = useMemo(
    () => carouselPalettePresets.find((preset) => preset.id === selectedPaletteId) ?? null,
    [selectedPaletteId]
  );
  const brandColors = useMemo(() => getBrandColors(brandPalette), [brandPalette]);
  const selectedPaletteColors = useMemo(
    () => selectedPaletteId === "brand" ? brandColors : selectedPalettePreset?.colors ?? brandColors,
    [brandColors, selectedPaletteId, selectedPalettePreset]
  );
  const selectedPaletteName = selectedPaletteId === "brand" ? "Brand palette" : selectedPalettePreset?.name ?? "Brand palette";
  const selectedPaletteMood = selectedPaletteId === "brand" ? "From active brand kit" : selectedPalettePreset?.mood ?? "Curated palette";
  const palette = useMemo(() => resolveDeckPalette(brandDetail, selectedPaletteColors), [brandDetail, selectedPaletteColors]);
  const selectedBackgroundEffect = backgroundEffectLibrary.find((effect) => effect.id === selectedBackgroundEffectId) ?? defaultBackgroundEffect;
  const visibleBackgroundEffects = backgroundEffectLibrary.filter((effect) => {
    if (backgroundEffectCategory === "all") return true;
    if (backgroundEffectCategory === "featured") return effect.featured;
    return effect.category === backgroundEffectCategory;
  });
  const deck = deckModes[deckMode];
  const selectedSlide = slides.find((slide) => slide.id === selectedSlideId) ?? slides[0] ?? null;
  const currentSlideIndex = selectedSlide ? Math.max(0, slides.findIndex((slide) => slide.id === selectedSlide.id)) : 0;
  const logoAsset = activeAssets.find((asset) => asset.kind === "logo");
  const projectAssets = useMemo(
    () => activeAssets.filter((asset) => asset.projectId === projectId),
    [activeAssets, projectId]
  );
  const projectFacts = useMemo(
    () => buildProjectFacts(projectDetail),
    [projectDetail]
  );

  const filteredElementCategories = useMemo(() => {
    const query = elementQuery.trim().toLowerCase();
    return ELEMENT_CATEGORIES.map((category) => ({
      ...category,
      elements: category.elements.filter((element) => {
        const categoryMatches = activeElementCategory === "all" || activeElementCategory === category.id;
        const queryMatches = !query || element.label.toLowerCase().includes(query) || category.label.toLowerCase().includes(query);
        return categoryMatches && queryMatches;
      })
    })).filter((category) => category.elements.length > 0);
  }, [activeElementCategory, elementQuery]);

  useEffect(() => {
    const shell = previewShellRef.current;
    if (!shell) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      setPreviewZoomAroundPoint(previewScale + delta, { clientX: event.clientX, clientY: event.clientY });
    };

    shell.addEventListener("wheel", handleWheel, { passive: false });
    return () => shell.removeEventListener("wheel", handleWheel);
  }, [previewScale]);

  useEffect(() => {
    const id = "ai-edit-google-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.href = generateGoogleFontsUrl();
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (slides.length > 0 || !activeBrand) return;
    const nextSlides = buildSlides({
      brandName: activeBrand.name,
      project: projectDetail?.project ?? null,
      facts: projectFacts,
      goal,
      topic,
      slideCount
    });
    setSlides(nextSlides);
    setSelectedSlideId(nextSlides[0]?.id ?? null);
  }, [activeBrand, goal, projectDetail, projectFacts, slideCount, slides.length, topic]);

  function rebuildSlides(nextCount = slideCount) {
    const nextSlides = buildSlides({
      brandName: activeBrand?.name ?? "Brand",
      project: projectDetail?.project ?? null,
      facts: projectFacts,
      goal,
      topic,
      slideCount: nextCount
    });
    setSlides(nextSlides);
    setSelectedSlideId(nextSlides[0]?.id ?? null);
    setStatus("Deck rebuilt from saved project facts.");
  }

  function applyTemplate(templateId: TemplateId) {
    const template = carouselTemplates.find((item) => item.id === templateId) ?? carouselTemplates[0];
    if (!template) return;
    setSelectedTemplateId(template.id);
    setGoal(template.goal);
    setShowTemplateModal(false);
    const nextSlides = buildSlides({
      brandName: activeBrand?.name ?? "Brand",
      project: projectDetail?.project ?? null,
      facts: projectFacts,
      goal: template.goal,
      topic,
      slideCount
    });
    setSlides(nextSlides);
    setSelectedSlideId(nextSlides[0]?.id ?? null);
    setStatus(`${template.label} template applied.`);
  }

  function handlePlatformChange(platformId: string) {
    const platform = platformFormats.find((item) => item.id === platformId) ?? platformFormats[0];
    if (!platform) return;
    setSelectedPlatformId(platform.id);
    setDeckMode(platform.mode);
  }

  function updateSlide(patch: Partial<CarouselSlide>) {
    if (!selectedSlide) return;
    setSlides((current) => current.map((slide) => slide.id === selectedSlide.id ? { ...slide, ...patch } : slide));
  }

  function updateTextMarks(field: "headline" | "body", patch: Partial<RichTextMarks>) {
    if (!selectedSlide) return;
    const currentMarks = selectedSlide.richText?.[field] ?? {};
    updateSlide({
      richText: {
        ...(selectedSlide.richText ?? {}),
        [field]: {
          ...currentMarks,
          ...patch
        }
      }
    });
  }

  function updateTextStyle(field: TextFieldKey, patch: Partial<CarouselTextStyle>) {
    if (!selectedSlide) return;
    updateSlide({
      textStyles: {
        ...(selectedSlide.textStyles ?? {}),
        [field]: {
          ...(selectedSlide.textStyles?.[field] ?? {}),
          ...patch
        }
      }
    });
  }

  function resetTextStyle(field: TextFieldKey) {
    if (!selectedSlide) return;
    const nextStyles = { ...(selectedSlide.textStyles ?? {}) };
    delete nextStyles[field];
    updateSlide({ textStyles: nextStyles });
  }

  function toggleTextMark(field: "headline" | "body", mark: "bold" | "italic" | "list") {
    const currentValue = selectedSlide?.richText?.[field]?.[mark] === true;
    updateTextMarks(field, { [mark]: !currentValue });
  }

  function updateTextLink(field: "headline" | "body") {
    if (!selectedSlide) return;
    const currentLink = selectedSlide.richText?.[field]?.link ?? "";
    const nextLink = window.prompt("Add link URL", currentLink);
    if (nextLink === null) return;
    if (nextLink.trim()) {
      updateTextMarks(field, { link: nextLink.trim() });
      return;
    }
    const currentMarks = selectedSlide.richText?.[field] ?? {};
    const { link: _link, ...rest } = currentMarks;
    updateSlide({
      richText: {
        ...(selectedSlide.richText ?? {}),
        [field]: rest
      }
    });
  }

  function addSlideElement(element: ElementDef) {
    if (!selectedSlide) return;
    const existing = selectedSlide.elements ?? [];
    const slot = existing.length % 4;
    const fallbackPlacement = { x: 0.72, y: 0.16, size: 0.13, colorRole: "secondary" as const, opacity: 0.92 };
    const placements = [
      fallbackPlacement,
      { x: 0.10, y: 0.64, size: 0.1, colorRole: "accent" as const, opacity: 0.9 },
      { x: 0.76, y: 0.70, size: 0.09, colorRole: "ink" as const, opacity: 0.62 },
      { x: 0.12, y: 0.18, size: 0.08, colorRole: "accent" as const, opacity: 0.72 }
    ];
    const placement = placements[slot] ?? fallbackPlacement;
    updateSlide({
      elements: [
        ...existing,
        {
          id: `${element.id}-${Date.now()}`,
          elementId: element.id,
          label: element.label,
          svg: element.svg,
          ...placement
        }
      ]
    });
    setStatus(`${element.label} added to slide ${currentSlideIndex + 1}.`);
  }

  function removeSlideElement(elementId: string) {
    if (!selectedSlide) return;
    updateSlide({
      elements: (selectedSlide.elements ?? []).filter((element) => element.id !== elementId)
    });
    setStatus("Element removed.");
  }

  function resetSelectedSlide() {
    if (!selectedSlide) return;
    const generated = buildSlides({
      brandName: activeBrand?.name ?? "Brand",
      project: projectDetail?.project ?? null,
      facts: projectFacts,
      goal,
      topic,
      slideCount
    });
    const replacement = generated[currentSlideIndex];
    if (!replacement) return;
    setSlides((current) => current.map((slide, index) => index === currentSlideIndex ? replacement : slide));
    setSelectedSlideId(replacement.id);
    setStatus("Slide rebuilt from project facts.");
  }

  function selectAdjacentSlide(direction: -1 | 1) {
    if (!slides.length) return;
    const nextIndex = (currentSlideIndex + direction + slides.length) % slides.length;
    setSelectedSlideId(slides[nextIndex]?.id ?? null);
  }

  function changePreviewScale(delta: number) {
    setPreviewZoomAroundPoint(previewScale + delta);
  }

  function clampPreviewScale(value: number) {
    return Math.max(0.5, Math.min(2.5, Number(value.toFixed(2))));
  }

  function setPreviewZoomAroundPoint(nextScale: number, focusPoint?: { clientX: number; clientY: number }) {
    const shell = previewShellRef.current;
    const frame = previewFrameRef.current;
    const clampedScale = clampPreviewScale(nextScale);

    if (!shell || !frame || clampedScale === previewScale) {
      setPreviewScale(clampedScale);
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const focusClientX = focusPoint?.clientX ?? shellRect.left + shell.clientWidth / 2;
    const focusClientY = focusPoint?.clientY ?? shellRect.top + shell.clientHeight / 2;
    const focusRatioX = Math.max(0, Math.min(1, (focusClientX - frameRect.left) / frameRect.width));
    const focusRatioY = Math.max(0, Math.min(1, (focusClientY - frameRect.top) / frameRect.height));

    setPreviewScale(clampedScale);

    requestAnimationFrame(() => {
      const nextShell = previewShellRef.current;
      const nextFrame = previewFrameRef.current;
      if (!nextShell || !nextFrame) return;

      const nextFrameRect = nextFrame.getBoundingClientRect();
      nextShell.scrollLeft += nextFrameRect.left + nextFrameRect.width * focusRatioX - focusClientX;
      nextShell.scrollTop += nextFrameRect.top + nextFrameRect.height * focusRatioY - focusClientY;
    });
  }

  function fitPreviewToCanvas() {
    setPreviewScale(1);
    requestAnimationFrame(() => {
      const shell = previewShellRef.current;
      if (!shell) return;
      shell.scrollLeft = Math.max(0, (shell.scrollWidth - shell.clientWidth) / 2);
      shell.scrollTop = Math.max(0, (shell.scrollHeight - shell.clientHeight) / 2);
    });
  }

  function beginCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;

    event.preventDefault();
    setIsCanvasPanning(true);
    setCanvasPanStart({
      x: event.clientX,
      y: event.clientY,
      scrollLeft: previewShellRef.current?.scrollLeft ?? 0,
      scrollTop: previewShellRef.current?.scrollTop ?? 0
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function getFramePoint(event: ReactPointerEvent<HTMLElement>) {
    const frame = previewFrameRef.current;
    if (!frame) return null;

    const rect = frame.getBoundingClientRect();
    const x = Math.max(0, Math.min(deck.width, ((event.clientX - rect.left) / rect.width) * deck.width));
    const y = Math.max(0, Math.min(deck.height, ((event.clientY - rect.top) / rect.height) * deck.height));
    return { x, y };
  }

  function beginTextDrag(field: TextFieldKey, event: ReactPointerEvent<HTMLButtonElement>) {
    const point = getFramePoint(event);
    const layout = selectedSlide ? getSlideTextLayouts(selectedSlide, deck, palette)[field] : null;
    if (!point || !layout) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedTextField(field);
    setTextDragState({
      field,
      offsetX: point.x - layout.x,
      offsetY: point.y - layout.y
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateTextDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!textDragState) return;
    const point = getFramePoint(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    updateTextStyle(textDragState.field, {
      x: Math.round(Math.max(0, Math.min(deck.width, point.x - textDragState.offsetX))),
      y: Math.round(Math.max(0, Math.min(deck.height, point.y - textDragState.offsetY)))
    });
  }

  function endTextDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!textDragState) return;
    event.stopPropagation();
    setTextDragState(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function updateCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isCanvasPanning || !previewShellRef.current) return;

    const dx = event.clientX - canvasPanStart.x;
    const dy = event.clientY - canvasPanStart.y;
    previewShellRef.current.scrollLeft = canvasPanStart.scrollLeft - dx;
    previewShellRef.current.scrollTop = canvasPanStart.scrollTop - dy;
  }

  function endCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isCanvasPanning) return;

    setIsCanvasPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleSlideCountChange(nextCount: number) {
    setSlideCount(nextCount);
    const generated = buildSlides({
      brandName: activeBrand?.name ?? "Brand",
      project: projectDetail?.project ?? null,
      facts: projectFacts,
      goal,
      topic,
      slideCount: nextCount
    });
    const existingById = new Map(slides.map((slide) => [slide.id, slide]));
    const nextSlides = generated.map((slide) => existingById.get(slide.id) ?? slide);
    setSlides(nextSlides);
    setSelectedSlideId((current) => current && nextSlides.some((slide) => slide.id === current) ? current : nextSlides[0]?.id ?? null);
    setStatus(`${nextSlides.length} slides ready.`);
  }

  async function copyPostText() {
    const text = buildLinkedInPostText({
      brandName: activeBrand?.name ?? "Brand",
      projectName: projectDetail?.project.name ?? null,
      topic,
      slides
    });
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Post text copied.");
    } catch {
      setStatus("Copy failed. Select and copy from the browser instead.");
    }
  }

  async function downloadSlidePng(slide = selectedSlide, index = currentSlideIndex) {
    if (!slide) return;
    const svg = createSlideSvg({
      slide,
      slideIndex: index,
      slideCount: slides.length,
      deck,
      palette,
      brandName: activeBrand?.name ?? "Brand",
      projectName: projectDetail?.project.name ?? null,
      hasLogo: Boolean(logoAsset),
      backgroundEffect: selectedBackgroundEffect,
      backgroundEffectsEnabled: backgroundEffects,
      backgroundIntensity,
      alternateSlideColors
    });
    await downloadSvgAsPng(svg, deck, `${slugify(projectDetail?.project.name ?? activeBrand?.name ?? "linkedin")}-slide-${String(index + 1).padStart(2, "0")}.png`);
    setStatus("Slide PNG exported.");
  }

  async function downloadAllPngs() {
    for (let index = 0; index < slides.length; index += 1) {
      const slide = slides[index];
      if (!slide) continue;
      await downloadSlidePng(slide, index);
      await wait(180);
    }
    setStatus("PNG cards exported.");
  }

  async function exportCurrentPng() {
    setExporting(true);
    try {
      await downloadSlidePng();
    } finally {
      setExporting(false);
    }
  }

  async function exportAllPngs() {
    setExporting(true);
    try {
      await downloadAllPngs();
    } finally {
      setExporting(false);
    }
  }

  const backgroundConfig = {
    backgroundEffect: selectedBackgroundEffect,
    backgroundEffectsEnabled: backgroundEffects,
    backgroundIntensity,
    alternateSlideColors
  };

  const selectedSvg = selectedSlide
    ? createSlideSvg({
        slide: selectedSlide,
        slideIndex: currentSlideIndex,
        slideCount: slides.length,
        deck,
        palette,
        brandName: activeBrand?.name ?? "Brand",
        projectName: projectDetail?.project.name ?? null,
        hasLogo: Boolean(logoAsset),
        ...backgroundConfig
      })
    : null;
  const previewBaseWidth = previewDevice === "mobile" ? 286 : deckMode === "ad" ? 410 : 430;
  const previewFrameStyle = {
    width: `${Math.round(previewBaseWidth * previewScale)}px`,
    aspectRatio: previewDevice === "mobile" ? "9 / 16" : `${deck.width} / ${deck.height}`
  };
  const selectedTextLayouts = selectedSlide ? getSlideTextLayouts(selectedSlide, deck, palette) : null;
  const activeTextLayout = selectedTextLayouts?.[selectedTextField] ?? null;
  const textColorOptions = Array.from(new Set([palette.ink, palette.secondary, palette.accent, palette.paper, palette.soft, ...selectedPaletteColors]));
  const selectedTemplate = carouselTemplates.find((template) => template.id === selectedTemplateId) ?? carouselTemplates[0];
  const effectPreviewStyle = {
    "--effect-paper": palette.paper,
    "--effect-soft": palette.soft,
    "--effect-ink": palette.ink,
    "--effect-secondary": palette.secondary,
    "--effect-accent": palette.accent,
    "--effect-opacity": String(Math.max(0.08, Math.min(0.95, backgroundIntensity / 100)))
  } as CSSProperties;

  return (
    <div className="linkedin-carousel-page">
      <aside className="linkedin-carousel-left-rail" aria-label="Carousel tools">
        {[
          { label: "AI Carousel Generator", glyph: "🎠", active: true, action: () => setShowGenerateModal(true) },
          { label: "Portrait Generator", glyph: "🧑", active: false, action: () => setActiveSettingsPanel("creator") },
          { label: "LinkedIn Post Formatter", glyph: "✍️", active: false, action: () => setStatus("LinkedIn Post Formatter selected.") },
          { label: "Comment Generator", glyph: "💬", active: false, action: () => setStatus("Comment Generator selected.") },
          { label: "Infographic Generator", glyph: "📊", active: false, action: () => setShowTemplateModal(true) },
          { label: "Post Ideas", glyph: "💡", active: false, action: () => setShowGenerateModal(true) },
          { label: "Image Generator", glyph: "📸", active: false, action: () => setActiveSettingsPanel("background") }
        ].map((item) => (
          <button className={item.active ? "is-active" : ""} key={item.label} onClick={item.action} title={item.label} type="button">
            <span className="linkedin-carousel-rail-glyph" aria-hidden="true">{item.glyph}</span>
          </button>
        ))}
      </aside>

      <aside className="linkedin-carousel-builder-panel">
        <section className="linkedin-carousel-generator-block">
          <div className="linkedin-carousel-panel-title">
            <h2>AI Carousel Generator</h2>
            <span>Pro base</span>
          </div>
          <button className="linkedin-carousel-primary-action" onClick={() => setShowGenerateModal(true)} type="button">
            <Icon name="spark" />
            Generate Carousel...
          </button>
          <div className="linkedin-carousel-or-line"><span>or</span></div>
          <button className="linkedin-carousel-secondary-action" onClick={() => setShowImportModal(true)} type="button">
            <Icon name="download" />
            Import Carousel...
          </button>
        </section>

        <section className="linkedin-carousel-settings-block">
          <div className="linkedin-carousel-panel-title">
            <h2>Template Settings</h2>
            <button onClick={() => applyTemplate(carouselTemplates[(carouselTemplates.findIndex((item) => item.id === selectedTemplateId) + 1) % carouselTemplates.length]?.id ?? "project-launch")} type="button">
              Surprise Me
            </button>
          </div>

          <label className="linkedin-carousel-field">
            <span>Platform Format</span>
            <select value={selectedPlatformId} onChange={(event) => handlePlatformChange(event.target.value)}>
              {platformFormats.map((format) => (
                <option key={format.id} value={format.id}>{format.label}</option>
              ))}
            </select>
          </label>

          <button className="linkedin-carousel-template-button" onClick={() => setShowTemplateModal(true)} type="button">
            <Icon name="layout" />
            {selectedTemplate?.label ?? "Select Template..."}
          </button>

          <SettingsAccordion
            active={activeSettingsPanel === "palette"}
            icon="spark"
            label="Color Palette"
            onToggle={() => setActiveSettingsPanel(activeSettingsPanel === "palette" ? "text" : "palette")}
          >
            <div className="linkedin-carousel-palette-columns">
              {["Dark", "Light", "Vibrant", "Pastel", "Muted"].map((group, groupIndex) => (
                <div key={group}>
                  <strong>{group}</strong>
                  {carouselPalettePresets.slice(groupIndex * 6, groupIndex * 6 + 6).map((preset) => (
                    <button
                      className={selectedPaletteId === preset.id ? "is-active" : ""}
                      key={preset.id}
                      onClick={() => setSelectedPaletteId(preset.id)}
                      title={preset.name}
                      type="button"
                    >
                      {preset.colors.slice(0, 3).map((color) => <span key={color} style={{ background: color }} />)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="linkedin-carousel-color-inputs">
              {[
                ["Background", palette.paper],
                ["Text Color", palette.ink],
                ["Accent Color", palette.accent]
              ].map(([label, color]) => (
                <label key={label}>
                  <span>{label}</span>
                  <input readOnly value={color} />
                </label>
              ))}
            </div>
            <label className="linkedin-carousel-toggle-row">
              <input checked={alternateSlideColors} onChange={(event) => setAlternateSlideColors(event.target.checked)} type="checkbox" />
              <span>Alternate colors between slides</span>
            </label>
          </SettingsAccordion>

          <SettingsAccordion
            active={activeSettingsPanel === "text"}
            icon="type"
            label="Text Settings"
            onToggle={() => setActiveSettingsPanel(activeSettingsPanel === "text" ? "background" : "text")}
          >
            <label className="linkedin-carousel-field">
              <span>Fonts</span>
              <select value={selectedFontPair} onChange={(event) => setSelectedFontPair(event.target.value)}>
                {fontPairOptions.map((pair) => <option key={pair}>{pair}</option>)}
              </select>
            </label>
            <div className="linkedin-carousel-segment-row">
              <button className={textScale === "compact" ? "is-active" : ""} onClick={() => setTextScale("compact")} type="button">A</button>
              <button className={textScale === "regular" ? "is-active" : ""} onClick={() => setTextScale("regular")} type="button">A</button>
              <button className={textScale === "large" ? "is-active" : ""} onClick={() => setTextScale("large")} type="button">A</button>
            </div>
            <div className="linkedin-carousel-segment-row is-three">
              <button className={textAlignment === "left" ? "is-active" : ""} onClick={() => setTextAlignment("left")} type="button">Left</button>
              <button className={textAlignment === "center" ? "is-active" : ""} onClick={() => setTextAlignment("center")} type="button">Center</button>
              <button className={textAlignment === "right" ? "is-active" : ""} onClick={() => setTextAlignment("right")} type="button">Right</button>
            </div>
            <label className="linkedin-carousel-toggle-row">
              <input checked={uppercaseTitles} onChange={(event) => setUppercaseTitles(event.target.checked)} type="checkbox" />
              <span>Uppercase titles</span>
            </label>
            <label className="linkedin-carousel-toggle-row">
              <input checked={customFontCombination} onChange={(event) => setCustomFontCombination(event.target.checked)} type="checkbox" />
              <span>Custom font combination</span>
            </label>
          </SettingsAccordion>

          <SettingsAccordion active={activeSettingsPanel === "background"} icon="image" label="Background Effects" onToggle={() => setActiveSettingsPanel(activeSettingsPanel === "background" ? "counter" : "background")}>
            <label className="linkedin-carousel-toggle-row">
              <input checked={backgroundEffects} onChange={(event) => setBackgroundEffects(event.target.checked)} type="checkbox" />
              <span>Background effects</span>
            </label>
            <button className="linkedin-carousel-effect-select" onClick={() => setShowBackgroundModal(true)} type="button">
              <span className={`linkedin-carousel-effect-chip effect-${selectedBackgroundEffect.id}`} style={effectPreviewStyle} aria-hidden="true" />
              <span>
                <strong>{selectedBackgroundEffect.name}</strong>
                <small>Select Background Effect...</small>
              </span>
              <Icon name="chevronRight" />
            </button>
            <div className="linkedin-carousel-effect-quick-grid">
              {backgroundEffectLibrary.slice(0, 6).map((effect) => (
                <button
                  className={selectedBackgroundEffect.id === effect.id ? "is-active" : ""}
                  key={effect.id}
                  onClick={() => setSelectedBackgroundEffectId(effect.id)}
                  title={effect.name}
                  type="button"
                >
                  <span className={`linkedin-carousel-effect-chip effect-${effect.id}`} style={effectPreviewStyle} aria-hidden="true" />
                </button>
              ))}
            </div>
            <label className="linkedin-carousel-range-row">
              <span>Intensity</span>
              <input min={0} max={100} value={backgroundIntensity} onChange={(event) => setBackgroundIntensity(Number(event.target.value))} type="range" />
              <strong>{backgroundIntensity}%</strong>
            </label>
          </SettingsAccordion>

          <SettingsAccordion active={activeSettingsPanel === "counter"} icon="file" label="Counter & Corners" onToggle={() => setActiveSettingsPanel(activeSettingsPanel === "counter" ? "creator" : "counter")}>
            <label className="linkedin-carousel-toggle-row">
              <input checked={showCounters} onChange={(event) => setShowCounters(event.target.checked)} type="checkbox" />
              <span>Show slide counter</span>
            </label>
            <div className="linkedin-carousel-segment-row is-three">
              {(["top-right", "bottom-right", "bottom-center"] as const).map((position) => (
                <button className={counterPosition === position ? "is-active" : ""} key={position} onClick={() => setCounterPosition(position)} type="button">
                  {position.replace("-", " ")}
                </button>
              ))}
            </div>
            <div className="linkedin-carousel-segment-row is-three">
              {(["square", "soft", "round"] as const).map((style) => (
                <button className={cornerStyle === style ? "is-active" : ""} key={style} onClick={() => setCornerStyle(style)} type="button">
                  {style}
                </button>
              ))}
            </div>
          </SettingsAccordion>

          <SettingsAccordion active={activeSettingsPanel === "creator"} icon="building" label="Creator Info" onToggle={() => setActiveSettingsPanel(activeSettingsPanel === "creator" ? "palette" : "creator")}>
            <label className="linkedin-carousel-toggle-row">
              <input checked={showCreatorInfo} onChange={(event) => setShowCreatorInfo(event.target.checked)} type="checkbox" />
              <span>{activeBrand?.name ?? "Brand"} footer</span>
            </label>
            <label className="linkedin-carousel-field">
              <span>Creator name</span>
              <input value={creatorName} onChange={(event) => setCreatorName(event.target.value)} />
            </label>
            <label className="linkedin-carousel-field">
              <span>Creator title</span>
              <input value={creatorTitle} onChange={(event) => setCreatorTitle(event.target.value)} />
            </label>
            <div className="linkedin-carousel-segment-row is-three">
              <button className="is-active" type="button">Logo</button>
              <button type="button">Headshot</button>
              <button type="button">None</button>
            </div>
          </SettingsAccordion>
        </section>
        <section className="linkedin-carousel-post-tool-card">
          <button onClick={() => setStatus("LinkedIn Post Formatter selected.")} type="button">
            <span>✍️</span>
            <strong>LinkedIn Post Formatter</strong>
            <small>and Post Generator ✧</small>
          </button>
          <em>Top Pick</em>
        </section>
      </aside>

      <main className="linkedin-carousel-workspace">
        <section className="linkedin-carousel-canvas-area">
          <button className="linkedin-carousel-side-nav is-left" onClick={() => selectAdjacentSlide(-1)} type="button" aria-label="Previous slide">
            <Icon name="chevronLeft" />
          </button>

          <div className="linkedin-carousel-active-slide">
            {selectedSvg ? (
              <div className={`linkedin-carousel-canvas-frame is-${previewDevice}`} ref={previewFrameRef} style={previewFrameStyle}>
                {previewDevice === "mobile" ? (
                  <div className="linkedin-carousel-phone-frame">
                    <div className="linkedin-carousel-phone-bezel">
                      <img className="linkedin-carousel-phone-preview" alt={selectedSlide?.headline ?? "Mobile carousel slide"} draggable={false} src={svgToDataUrl(selectedSvg)} />
                    </div>
                  </div>
                ) : (
                  <img className="linkedin-carousel-preview" alt={selectedSlide?.headline ?? "Carousel slide"} draggable={false} src={svgToDataUrl(selectedSvg)} />
                )}
              </div>
            ) : null}
            <button className="linkedin-carousel-slide-badge" type="button">{currentSlideIndex + 1}</button>
          </div>

          <button className="linkedin-carousel-side-nav is-right" onClick={() => selectAdjacentSlide(1)} type="button" aria-label="Next slide">
            <Icon name="chevronRight" />
          </button>
        </section>

        <section className="linkedin-carousel-strip-section">
          <button className="linkedin-carousel-filmstrip-nav" onClick={() => selectAdjacentSlide(-1)} type="button" aria-label="Previous slide">
            <Icon name="chevronLeft" />
          </button>
          <div className="linkedin-carousel-filmstrip">
            {slides.map((slide, index) => {
              const svg = createSlideSvg({
                slide,
                slideIndex: index,
                slideCount: slides.length,
                deck,
                palette,
                brandName: activeBrand?.name ?? "Brand",
                projectName: projectDetail?.project.name ?? null,
                hasLogo: Boolean(logoAsset),
                ...backgroundConfig
              });
              return (
                <button className={`linkedin-carousel-filmstrip-item ${slide.id === selectedSlide?.id ? "is-active" : ""}`} key={slide.id} onClick={() => setSelectedSlideId(slide.id)} type="button">
                  <img alt={`Slide ${index + 1}`} src={svgToDataUrl(svg)} />
                  <strong>{index + 1}</strong>
                </button>
              );
            })}
          </div>
          <button className="linkedin-carousel-filmstrip-nav" onClick={() => selectAdjacentSlide(1)} type="button" aria-label="Next slide">
            <Icon name="chevronRight" />
          </button>
        </section>
      </main>

      <aside className="linkedin-carousel-current-editor">
        <div className="linkedin-carousel-editor-switch">
          <button className="is-active" type="button">Edit Current Slide</button>
          <button onClick={() => setShowGenerateModal(true)} type="button">Edit Carousel</button>
        </div>

        {selectedSlide ? (
          <div className="linkedin-carousel-semantic-editor">
            <div className="linkedin-carousel-intro-type">
              <span>Intro Type</span>
              {slideLayouts.slice(0, 4).map((layout) => (
                <button className={selectedSlide.layout === layout.value ? "is-active" : ""} key={layout.value} onClick={() => updateSlide({ layout: layout.value })} type="button">
                  {layout.label}
                </button>
              ))}
            </div>

            {[
              { key: "eyebrow" as const, label: "Tagline", max: 30, multiline: false },
              { key: "headline" as const, label: "Title", max: 100, multiline: false },
              { key: "body" as const, label: "Paragraph", max: 160, multiline: true },
              { key: "footer" as const, label: "Swipe Indicator", max: 30, multiline: false }
            ].map((field) => (
              <label className="linkedin-carousel-slide-field" key={field.key}>
                <span>{field.label}</span>
                {field.multiline ? (
                  <textarea value={selectedSlide[field.key]} maxLength={field.max} onChange={(event) => updateSlide({ [field.key]: event.target.value })} />
                ) : (
                  <input value={selectedSlide[field.key]} maxLength={field.max} onChange={(event) => updateSlide({ [field.key]: event.target.value })} />
                )}
              </label>
            ))}
          </div>
        ) : null}
      </aside>

      {showTemplateModal ? (
        <div
          className="linkedin-carousel-modal-backdrop"
          role="presentation"
          style={{ position: "absolute", inset: 0, zIndex: 9999 }}
        >
          <section className="linkedin-carousel-template-modal" role="dialog" aria-modal="true" aria-label="Select a customizable template">
            <div className="linkedin-carousel-modal-header">
              <div>
                <h2>Select a Customizable Template</h2>
                <p>Choose a proven carousel structure, then customize the slide fields.</p>
              </div>
              <button onClick={() => setShowTemplateModal(false)} type="button">×</button>
            </div>
            <div className="linkedin-carousel-template-filters">
              <select value={selectedPlatformId} onChange={(event) => handlePlatformChange(event.target.value)}>
                {platformFormats.slice(0, 4).map((format) => <option key={format.id} value={format.id}>{format.label.replace(", Recommended", "")}</option>)}
              </select>
              {["Featured", "Modern", "Minimal", "Bold", "Real Estate"].map((label, index) => (
                <button className={index === 0 ? "is-active" : ""} key={label} type="button">{label}</button>
              ))}
            </div>
            <div className="linkedin-carousel-template-grid">
              {carouselTemplates.map((template) => (
                <button className={selectedTemplateId === template.id ? "is-active" : ""} key={template.id} onClick={() => applyTemplate(template.id)} type="button">
                  <span style={{ background: template.color }} />
                  <strong>{template.label}</strong>
                  <small>{template.description}</small>
                </button>
              ))}
            </div>
            <label className="linkedin-carousel-toggle-row">
              <input defaultChecked type="checkbox" />
              <span>Include sample content as a reference</span>
            </label>
          </section>
        </div>
      ) : null}

      {showGenerateModal ? (
        <div
          className="linkedin-carousel-modal-backdrop"
          role="presentation"
          style={{ position: "absolute", inset: 0, zIndex: 9999 }}
        >
          <section className="linkedin-carousel-generate-modal" role="dialog" aria-modal="true" aria-label="AI carousel generator">
            <div className="linkedin-carousel-modal-header">
              <div>
                <h2>AI Carousel Generator</h2>
                <p>Create real-estate carousels from a topic, copy, URL, video, PDF, or slides.</p>
              </div>
              <button onClick={() => setShowGenerateModal(false)} type="button">×</button>
            </div>
            <div className="linkedin-carousel-source-tabs">
              {["Topic", "Text", "URL", "Video", "PDF", "Slides"].map((label, index) => (
                <button className={index === 0 ? "is-active" : ""} key={label} type="button">{label}</button>
              ))}
            </div>
            <div className="linkedin-carousel-generate-grid">
              <label>
                <span>Slides</span>
                <input value={slideCount} onChange={(event) => handleSlideCountChange(Number(event.target.value))} type="number" min={4} max={8} />
              </label>
              <label>
                <span>Topic</span>
                <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Why this project deserves attention now" />
              </label>
              <label>
                <span>Format</span>
                <select value={goal} onChange={(event) => setGoal(event.target.value as DeckGoal)}>
                  {deckGoals.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>
                <span>Output Language</span>
                <select defaultValue="English">
                  {["English", "Hindi", "Marathi", "Gujarati", "Arabic", "French", "Spanish"].map((language) => <option key={language}>{language}</option>)}
                </select>
              </label>
              <label className="is-wide">
                <span>Custom Instructions</span>
                <input placeholder="e.g., Make it sound like a premium Mumbai launch, not generic." />
              </label>
            </div>
            <div className="linkedin-carousel-modal-actions">
              <button onClick={() => { rebuildSlides(); setShowGenerateModal(false); }} type="button">Try Generate From Topic</button>
              <button onClick={() => setShowGenerateModal(false)} type="button">Sign Up To Unlock</button>
            </div>
          </section>
        </div>
      ) : null}

      {showImportModal ? (
        <div
          className="linkedin-carousel-modal-backdrop"
          role="presentation"
          style={{ position: "absolute", inset: 0, zIndex: 9999 }}
        >
          <section className="linkedin-carousel-generate-modal" role="dialog" aria-modal="true" aria-label="Import carousel">
            <div className="linkedin-carousel-modal-header">
              <div>
                <h2>Import Carousel</h2>
                <p>Paste slide copy or upload a carousel source to recreate it as editable slides.</p>
              </div>
              <button onClick={() => setShowImportModal(false)} type="button">×</button>
            </div>
            <div className="linkedin-carousel-source-tabs">
              {["PDF", "Slides", "Text", "Images"].map((label, index) => (
                <button className={index === 0 ? "is-active" : ""} key={label} type="button">{label}</button>
              ))}
            </div>
            <label className="linkedin-carousel-import-dropzone">
              <Icon name="download" />
              <strong>Drop a file here or paste carousel text</strong>
              <textarea placeholder="Slide 1: Title...\nSlide 2: Key point..." />
            </label>
            <div className="linkedin-carousel-modal-actions">
              <button onClick={() => setShowImportModal(false)} type="button">Cancel</button>
              <button onClick={() => { setStatus("Import flow prepared."); setShowImportModal(false); }} type="button">Import Draft</button>
            </div>
          </section>
        </div>
      ) : null}

      {showBackgroundModal ? (
        <div
          className="linkedin-carousel-modal-backdrop"
          role="presentation"
          style={{ position: "absolute", inset: 0, zIndex: 9999 }}
        >
          <section className="linkedin-carousel-background-modal" role="dialog" aria-modal="true" aria-label="Select a background effect">
            <div className="linkedin-carousel-modal-header">
              <div>
                <h2>Select a Background Effect</h2>
                <p>Effects adapt to the active palette, so brand colors still control the final deck.</p>
              </div>
              <button onClick={() => setShowBackgroundModal(false)} type="button">×</button>
            </div>
            <div className="linkedin-carousel-source-tabs">
              {backgroundEffectCategories.map((category) => (
                <button
                  className={backgroundEffectCategory === category.id ? "is-active" : ""}
                  key={category.id}
                  onClick={() => setBackgroundEffectCategory(category.id)}
                  type="button"
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="linkedin-carousel-background-effect-list" style={effectPreviewStyle}>
              {visibleBackgroundEffects.map((effect) => (
                <button
                  className={`linkedin-carousel-background-effect-card ${selectedBackgroundEffect.id === effect.id ? "is-active" : ""}`}
                  key={effect.id}
                  onClick={() => {
                    setSelectedBackgroundEffectId(effect.id);
                    setShowBackgroundModal(false);
                    setStatus(`${effect.name} background effect applied.`);
                  }}
                  type="button"
                >
                  <strong>{effect.name}</strong>
                  <span className={`linkedin-carousel-background-effect-preview effect-${effect.id}`} aria-hidden="true">
                    {[0, 1, 2, 3].map((panel) => <i key={panel} />)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <div className="linkedin-carousel-print-stack" aria-hidden="true">
        {slides.map((slide, index) => {
          const svg = createSlideSvg({
            slide,
            slideIndex: index,
            slideCount: slides.length,
            deck,
            palette,
            brandName: activeBrand?.name ?? "Brand",
            projectName: projectDetail?.project.name ?? null,
            hasLogo: Boolean(logoAsset),
            ...backgroundConfig
          });
          return (
            <div className={`linkedin-carousel-print-page ${deckMode === "ad" ? "is-square" : ""}`} key={slide.id}>
              <img alt={`Printable slide ${index + 1}`} src={svgToDataUrl(svg)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsAccordion({
  active,
  children,
  icon,
  label,
  onToggle
}: {
  active: boolean;
  children: ReactNode;
  icon: IconName;
  label: string;
  onToggle: () => void;
}) {
  return (
    <section className={`linkedin-carousel-settings-accordion ${active ? "is-active" : ""}`}>
      <button onClick={onToggle} type="button">
        <span>
          <Icon name={icon} />
          {label}
        </span>
        <Icon name="chevronDown" />
      </button>
      {active ? <div className="linkedin-carousel-settings-content">{children}</div> : null}
    </section>
  );
}

function getBrandColors(palette?: { primary?: string; secondary?: string; accent?: string; neutrals?: string[] }) {
  const colors = [
    palette?.primary,
    palette?.accent,
    palette?.secondary,
    ...(palette?.neutrals ?? [])
  ].filter((color): color is string => Boolean(color));
  return colors.length ? colors.slice(0, 5) : ["#0f172a", "#d6ad63", "#f2e4c2", "#ffffff", "#e5e7eb"];
}

function assetPreviewUrl(asset: BrandAssetRecord) {
  return asset.thumbnailUrl ?? asset.previewUrl ?? asset.originalUrl;
}

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  switch (name) {
    case "assets":
      return <svg {...common}><path d="M4 7h16" /><path d="M7 4v6" /><path d="M17 4v6" /><rect x="4" y="13" width="16" height="7" rx="2" /></svg>;
    case "bold":
      return <svg {...common}><path d="M7 5h6a4 4 0 0 1 0 8H7z" /><path d="M7 13h7a4 4 0 0 1 0 8H7z" /></svg>;
    case "building":
      return <svg {...common}><path d="M4 21h16" /><path d="M6 21V5l8-2v18" /><path d="M14 9h4v12" /><path d="M9 8h1" /><path d="M9 12h1" /><path d="M9 16h1" /></svg>;
    case "check":
      return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
    case "chevronDown":
      return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>;
    case "chevronLeft":
      return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>;
    case "chevronRight":
      return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
    case "copy":
      return <svg {...common}><rect x="9" y="9" width="11" height="11" rx="2" /><rect x="4" y="4" width="11" height="11" rx="2" /></svg>;
    case "download":
      return <svg {...common}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
    case "file":
      return <svg {...common}><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4" /><path d="M9 12h6" /><path d="M9 16h4" /></svg>;
    case "image":
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 15-4-4-5 5-2-2-4 4" /></svg>;
    case "italic":
      return <svg {...common}><path d="M11 5h7" /><path d="M6 19h7" /><path d="m14 5-4 14" /></svg>;
    case "layout":
      return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 10h16" /><path d="M10 10v9" /></svg>;
    case "list":
      return <svg {...common}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>;
    case "maximize":
      return <svg {...common}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>;
    case "mobile":
      return <svg {...common}><rect x="8" y="3" width="8" height="18" rx="2" /><path d="M11 18h2" /></svg>;
    case "refresh":
      return <svg {...common}><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v6h-6" /></svg>;
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>;
    case "share":
      return <svg {...common}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></svg>;
    case "spark":
      return <svg {...common}><path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>;
    case "type":
      return <svg {...common}><path d="M4 7V5h16v2" /><path d="M12 5v14" /><path d="M8 19h8" /></svg>;
    case "undo":
      return <svg {...common}><path d="M9 7H4v5" /><path d="M4 12a8 8 0 0 0 13.7 5.7" /><path d="M4 12l5-5" /></svg>;
    case "redo":
      return <svg {...common}><path d="M15 7h5v5" /><path d="M20 12A8 8 0 0 1 6.3 17.7" /><path d="m20 12-5-5" /></svg>;
    default:
      return null;
  }
}

function buildProjectFacts(detail: ProjectDetail | null) {
  const project = detail?.project ?? null;
  const profile = detail?.activeProfile?.profile ?? null;
  return {
    location: [project?.microLocation, project?.city].filter(Boolean).join(", "),
    tagline: profile?.tagline || project?.description || "",
    positioning: profile?.positioning || profile?.lifestyleAngle || "",
    configurations: profile?.configurations ?? [],
    sizeRanges: profile?.sizeRanges ?? [],
    amenities: profile?.heroAmenities?.length ? profile.heroAmenities : profile?.amenities ?? [],
    locationAdvantages: profile?.locationAdvantages?.length ? profile.locationAdvantages : profile?.connectivityPoints ?? [],
    travelTimes: profile?.travelTimes ?? [],
    credibilityFacts: profile?.credibilityFacts ?? [],
    constructionStatus: profile?.constructionStatus || profile?.latestUpdate || "",
    pricing: profile?.startingPrice || profile?.pricingBand || profile?.priceRangeByConfig?.[0] || "",
    offer: profile?.currentOffers?.[0] || profile?.paymentPlanSummary || "",
    rera: profile?.reraNumber || ""
  };
}

function buildSlides(input: {
  brandName: string;
  project: ProjectRecord | null;
  facts: ReturnType<typeof buildProjectFacts>;
  goal: DeckGoal;
  topic: string;
  slideCount: number;
}): CarouselSlide[] {
  const projectName = input.project?.name ?? input.brandName;
  const location = input.facts.location || "Prime urban location";
  const amenities = input.facts.amenities.slice(0, 3).join(", ") || "Curated lifestyle amenities";
  const locationFacts = [...input.facts.locationAdvantages, ...input.facts.travelTimes].slice(0, 3).join("\n") || location;
  const configuration = [
    input.facts.configurations.slice(0, 3).join(", "),
    input.facts.sizeRanges[0]
  ].filter(Boolean).join(" | ") || "Homes planned for modern urban living";
  const proof = input.facts.credibilityFacts[0] || input.facts.constructionStatus || input.facts.rera || "Verified project facts from the brand team";
  const pricing = input.facts.pricing || input.facts.offer || "Commercial details available through the sales team";

  const goalHeadline: Record<DeckGoal, string> = {
    project_launch: `${projectName}: a sharper way to introduce the project`,
    location: `Why ${location} changes the conversation`,
    amenity: `The amenity story behind ${projectName}`,
    investment: `A calm case for long-term confidence`,
    construction: `Progress update: what is moving on site`,
    channel_partner: `A quick project brief for channel partners`
  };

  const baseSlides: CarouselSlide[] = [
    {
      id: "slide-cover",
      layout: "cover",
      eyebrow: input.brandName,
      headline: goalHeadline[input.goal],
      body: input.topic,
      footer: projectName
    },
    {
      id: "slide-context",
      layout: "split",
      eyebrow: "Context",
      headline: input.facts.positioning || input.facts.tagline || "Built for buyers who compare carefully",
      body: `Location: ${location}\nProject stage: ${formatStage(input.project?.stage)}\n${pricing}`,
      footer: projectName
    },
    {
      id: "slide-location",
      layout: "checklist",
      eyebrow: "Location",
      headline: "The everyday advantage is the real story",
      body: locationFacts,
      footer: location
    },
    {
      id: "slide-amenity",
      layout: "quote",
      eyebrow: "Lifestyle",
      headline: "More than a feature list",
      body: amenities,
      footer: "Amenity-led story"
    },
    {
      id: "slide-home",
      layout: "stat",
      eyebrow: "Homes",
      headline: "The product needs to be easy to understand",
      body: configuration,
      footer: "Configuration snapshot",
      stat: input.facts.configurations[0] ?? "Plan"
    },
    {
      id: "slide-proof",
      layout: "split",
      eyebrow: "Trust",
      headline: "Keep the claim grounded",
      body: proof,
      footer: input.facts.rera ? `RERA: ${input.facts.rera}` : "Compliance review required"
    },
    {
      id: "slide-action",
      layout: "cta",
      eyebrow: "Next step",
      headline: "Book a focused walkthrough",
      body: "Share the buyer profile, preferred configuration, and visit window with the sales team.",
      footer: input.brandName
    },
    {
      id: "slide-close",
      layout: "cta",
      eyebrow: "Save this",
      headline: "Use the checklist before your next site visit",
      body: "Location, product clarity, legal checks, and fit with the buyer's timeline.",
      footer: projectName
    }
  ];

  const count = Math.max(4, Math.min(8, input.slideCount));
  if (count >= baseSlides.length) return baseSlides.slice(0, count);
  const closingSlide = baseSlides[6] ?? baseSlides[baseSlides.length - 1];
  return closingSlide ? [...baseSlides.slice(0, count - 1), closingSlide] : baseSlides.slice(0, count);
}

function resolveDeckPalette(detail: BrandDetail | null, selectedColors?: string[]): DeckPalette {
  const profile = detail?.activeProfile?.profile;
  const colors = selectedColors?.length ? selectedColors : getBrandColors(profile?.palette);
  return {
    ink: colors[3] ?? "#151515",
    paper: colors[0] ?? profile?.palette.secondary ?? "#f8f6ef",
    soft: "#ffffff",
    accent: colors[2] ?? profile?.palette.accent ?? "#0a66c2",
    secondary: colors[1] ?? profile?.palette.primary ?? "#22314a"
  };
}

function renderBackgroundEffect(input: {
  effect: BackgroundEffect | null;
  enabled: boolean;
  intensity: number;
  alternate: boolean;
  slideIndex: number;
  w: number;
  h: number;
  palette: DeckPalette;
}) {
  const { effect, enabled, h, palette, slideIndex, w } = input;
  const opacity = Math.max(0.08, Math.min(0.94, input.intensity / 100));
  const base = input.alternate && slideIndex % 2 === 1 ? palette.secondary : palette.paper;
  const ink = input.alternate && slideIndex % 2 === 1 ? palette.paper : palette.ink;
  const secondary = input.alternate && slideIndex % 2 === 1 ? palette.accent : palette.secondary;
  const accent = input.alternate && slideIndex % 2 === 1 ? palette.paper : palette.accent;
  const idPrefix = `bg-${effect?.id ?? "grid"}-${slideIndex}`;

  if (!enabled || !effect) {
    return [
      `<defs><pattern id="${idPrefix}-grid" width="72" height="72" patternUnits="userSpaceOnUse"><path d="M72 0H0v72" fill="none" stroke="${secondary}" stroke-opacity="0.08" stroke-width="2"/></pattern></defs>`,
      `<rect width="${w}" height="${h}" fill="${base}"/>`,
      `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#${idPrefix}-grid)" opacity="0.24"/>`
    ].join("");
  }

  const defs = [
    `<linearGradient id="${idPrefix}-vertical" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${accent}" stop-opacity="${0.62 * opacity}"/><stop offset="55%" stop-color="${base}" stop-opacity="1"/><stop offset="100%" stop-color="${secondary}" stop-opacity="${0.45 * opacity}"/></linearGradient>`,
    `<linearGradient id="${idPrefix}-horizontal" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="${accent}" stop-opacity="${0.5 * opacity}"/><stop offset="50%" stop-color="${base}" stop-opacity="1"/><stop offset="100%" stop-color="${secondary}" stop-opacity="${0.48 * opacity}"/></linearGradient>`,
    `<radialGradient id="${idPrefix}-spot" cx="42%" cy="28%" r="72%"><stop offset="0%" stop-color="${accent}" stop-opacity="${0.58 * opacity}"/><stop offset="58%" stop-color="${base}" stop-opacity="0.86"/><stop offset="100%" stop-color="${secondary}" stop-opacity="${0.26 * opacity}"/></radialGradient>`,
    `<pattern id="${idPrefix}-grid" width="72" height="72" patternUnits="userSpaceOnUse"><path d="M72 0H0v72" fill="none" stroke="${secondary}" stroke-opacity="${0.08 + opacity * 0.08}" stroke-width="2"/></pattern>`,
    `<pattern id="${idPrefix}-dots" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2.3" fill="${secondary}" opacity="${0.12 * opacity}"/></pattern>`,
    `<pattern id="${idPrefix}-speckles" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="3" cy="5" r="1.4" fill="${secondary}" opacity="${0.13 * opacity}"/><circle cx="17" cy="12" r="1" fill="${accent}" opacity="${0.13 * opacity}"/><circle cx="10" cy="22" r="1.2" fill="${ink}" opacity="${0.08 * opacity}"/></pattern>`
  ].join("");

  const baseRect = `<rect width="${w}" height="${h}" fill="${base}"/>`;
  const gridOverlay = `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#${idPrefix}-grid)" opacity="${0.12 + opacity * 0.18}"/>`;
  const softWash = `<rect width="${w}" height="${h}" fill="url(#${idPrefix}-spot)" opacity="${0.34 + opacity * 0.3}"/>`;

  const effects: Record<BackgroundEffectId, string> = {
    "paper-of-sorrows": [
      baseRect,
      softWash,
      `<path d="M-40 ${h * 0.2} C${w * 0.2} ${h * 0.06},${w * 0.3} ${h * 0.34},${w * 0.55} ${h * 0.18} S${w * 0.92} ${h * 0.12},${w + 80} ${h * 0.3}" fill="none" stroke="${secondary}" stroke-width="54" stroke-opacity="${0.08 * opacity}" stroke-linecap="round"/>`,
      `<path d="M${w * 0.1} ${h + 30} C${w * 0.28} ${h * 0.72},${w * 0.62} ${h * 0.96},${w * 0.86} ${h * 0.68}" fill="none" stroke="${accent}" stroke-width="48" stroke-opacity="${0.09 * opacity}" stroke-linecap="round"/>`,
      `<rect width="${w}" height="${h}" fill="url(#${idPrefix}-speckles)" opacity="0.72"/>`
    ].join(""),
    "urban-jungle": [
      baseRect,
      `<rect width="${w}" height="${h}" fill="url(#${idPrefix}-vertical)"/>`,
      `<path d="M${w * 0.74} 0 L${w * 0.95} 0 L${w * 0.58} ${h} L${w * 0.37} ${h} Z" fill="${secondary}" opacity="${0.12 * opacity}"/>`,
      `<path d="M0 ${h * 0.78} C${w * 0.22} ${h * 0.66},${w * 0.36} ${h * 0.92},${w * 0.56} ${h * 0.76} S${w * 0.86} ${h * 0.62},${w} ${h * 0.74} L${w} ${h} L0 ${h} Z" fill="${accent}" opacity="${0.11 * opacity}"/>`
    ].join(""),
    "vertical-gradient": `<rect width="${w}" height="${h}" fill="url(#${idPrefix}-vertical)"/>`,
    "horizontal-gradient": `<rect width="${w}" height="${h}" fill="url(#${idPrefix}-horizontal)"/>`,
    "bubbly-blobs": [
      baseRect,
      softWash,
      `<circle cx="${w * 0.18}" cy="${h * 0.16}" r="${w * 0.16}" fill="${accent}" opacity="${0.2 * opacity}"/>`,
      `<circle cx="${w * 0.82}" cy="${h * 0.2}" r="${w * 0.13}" fill="${secondary}" opacity="${0.16 * opacity}"/>`,
      `<circle cx="${w * 0.08}" cy="${h * 0.92}" r="${w * 0.12}" fill="${secondary}" opacity="${0.14 * opacity}"/>`,
      `<circle cx="${w * 0.72}" cy="${h * 0.82}" r="${w * 0.18}" fill="${accent}" opacity="${0.15 * opacity}"/>`
    ].join(""),
    "pebble-patch": [
      baseRect,
      `<rect width="${w}" height="${h}" fill="url(#${idPrefix}-horizontal)" opacity="0.7"/>`,
      `<ellipse cx="${w * 0.12}" cy="${h * 0.22}" rx="${w * 0.16}" ry="${h * 0.08}" fill="${secondary}" opacity="${0.17 * opacity}" transform="rotate(12 ${w * 0.12} ${h * 0.22})"/>`,
      `<ellipse cx="${w * 0.58}" cy="${h * 0.28}" rx="${w * 0.13}" ry="${h * 0.08}" fill="${accent}" opacity="${0.17 * opacity}" transform="rotate(22 ${w * 0.58} ${h * 0.28})"/>`,
      `<ellipse cx="${w * 0.34}" cy="${h * 0.7}" rx="${w * 0.13}" ry="${h * 0.09}" fill="${secondary}" opacity="${0.16 * opacity}" transform="rotate(-12 ${w * 0.34} ${h * 0.7})"/>`
    ].join(""),
    "poly-grid": [baseRect, softWash, gridOverlay].join(""),
    "pulse-radar": [
      baseRect,
      softWash,
      ...[
        [w * 0.16, h * 0.1],
        [w * 0.86, h * 0.12],
        [w * 0.1, h * 0.9],
        [w * 0.78, h * 0.88]
      ].map(([cx, cy]) => `<g opacity="${0.24 * opacity}"><circle cx="${cx}" cy="${cy}" r="54" fill="none" stroke="${secondary}" stroke-width="5"/><circle cx="${cx}" cy="${cy}" r="92" fill="none" stroke="${secondary}" stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="132" fill="none" stroke="${secondary}" stroke-width="3"/></g>`)
    ].join(""),
    "sketchy-directions": [
      baseRect,
      softWash,
      `<path d="M${w * 0.05} ${h * 0.18} C${w * 0.22} ${h * 0.14},${w * 0.2} ${h * 0.38},${w * 0.36} ${h * 0.33}" fill="none" stroke="${secondary}" stroke-width="18" stroke-opacity="${0.18 * opacity}" stroke-linecap="round"/>`,
      `<path d="M${w * 0.34} ${h * 0.33} l-52 -34 M${w * 0.34} ${h * 0.33} l-40 48" fill="none" stroke="${secondary}" stroke-width="18" stroke-opacity="${0.18 * opacity}" stroke-linecap="round"/>`,
      `<path d="M${w * 0.62} ${h * 0.78} C${w * 0.78} ${h * 0.68},${w * 0.72} ${h * 0.92},${w * 0.9} ${h * 0.84}" fill="none" stroke="${accent}" stroke-width="16" stroke-opacity="${0.2 * opacity}" stroke-linecap="round"/>`
    ].join(""),
    "arrow-lane": [
      baseRect,
      `<rect width="${w}" height="${h}" fill="url(#${idPrefix}-vertical)" opacity="0.84"/>`,
      `<path d="M${w * 0.02} ${h * 0.12} H${w * 0.22} l-54 -54 M${w * 0.22} ${h * 0.12} l-54 54" fill="none" stroke="${secondary}" stroke-width="20" stroke-opacity="${0.2 * opacity}" stroke-linecap="square"/>`,
      `<path d="M${w * 0.55} ${h * 0.55} H${w * 0.74} l-54 -54 M${w * 0.74} ${h * 0.55} l-54 54" fill="none" stroke="${accent}" stroke-width="18" stroke-opacity="${0.2 * opacity}" stroke-linecap="square"/>`
    ].join(""),
    "speckle-paper": [baseRect, softWash, `<rect width="${w}" height="${h}" fill="url(#${idPrefix}-speckles)" opacity="0.98"/>`].join(""),
    "soft-spotlight": [baseRect, softWash, `<circle cx="${w * 0.74}" cy="${h * 0.2}" r="${w * 0.22}" fill="${accent}" opacity="${0.12 * opacity}"/>`].join("")
  };

  return [`<defs>${defs}</defs>`, effects[effect.id], gridOverlay].join("");
}

function createSlideSvg(input: {
  slide: CarouselSlide;
  slideIndex: number;
  slideCount: number;
  deck: DeckSpec;
  palette: DeckPalette;
  brandName: string;
  projectName: string | null;
  hasLogo: boolean;
  backgroundEffect?: BackgroundEffect | null;
  backgroundEffectsEnabled?: boolean;
  backgroundIntensity?: number;
  alternateSlideColors?: boolean;
}) {
  const { slide, deck, palette } = input;
  const w = deck.width;
  const h = deck.height;
  const margin = Math.round(w * 0.085);
  const textLayouts = getSlideTextLayouts(slide, deck, palette);
  const headlineLayout = textLayouts.headline;
  const bodyLayout = textLayouts.body;
  const eyebrowLayout = textLayouts.eyebrow;
  const footerLayout = textLayouts.footer;
  const progressWidth = Math.round((w - margin * 2) * ((input.slideIndex + 1) / Math.max(1, input.slideCount)));

  const shape = slide.layout === "cover"
    ? `<rect x="${w * 0.56}" y="${h * 0.16}" width="${w * 0.34}" height="${h * 0.44}" rx="42" fill="${palette.accent}" opacity="0.16"/><rect x="${w * 0.62}" y="${h * 0.24}" width="${w * 0.21}" height="${h * 0.5}" rx="26" fill="${palette.secondary}" opacity="0.92"/>`
    : slide.layout === "stat"
      ? `<circle cx="${w - margin - 120}" cy="${margin + 190}" r="118" fill="${palette.accent}" opacity="0.18"/><text x="${w - margin - 120}" y="${margin + 210}" text-anchor="middle" font-family="Poppins, Arial" font-size="48" font-weight="800" fill="${palette.secondary}">${escapeXml(slide.stat || "01")}</text>`
      : slide.layout === "checklist"
        ? checklistMarks(margin, h, palette)
        : `<rect x="${w - margin - 260}" y="${margin + 80}" width="260" height="${h - margin * 3}" rx="24" fill="${palette.accent}" opacity="0.12"/>`;

  const headlineMarks = slide.richText?.headline;
  const headlineWeight = headlineMarks?.bold === false ? "700" : "800";
  const backgroundLayer = renderBackgroundEffect({
    effect: input.backgroundEffect ?? null,
    enabled: input.backgroundEffectsEnabled !== false,
    intensity: input.backgroundIntensity ?? 55,
    alternate: input.alternateSlideColors === true,
    slideIndex: input.slideIndex,
    w,
    h,
    palette
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    backgroundLayer,
    shape,
    renderSlideElements(slide, deck, palette),
    `<text x="${eyebrowLayout.x}" y="${eyebrowLayout.y}" font-family="${escapeXml(eyebrowLayout.fontFamily)}" font-size="${eyebrowLayout.fontSize}" font-weight="800" fill="${eyebrowLayout.color}" letter-spacing="0">${escapeXml(slide.eyebrow)}</text>`,
    renderMultilineText(slide.headline, headlineLayout.x, headlineLayout.y, headlineLayout.maxWidth, headlineLayout.fontSize, 1.08, headlineWeight, headlineMarks?.link ? palette.secondary : headlineLayout.color, compactTextOptions({
      italic: headlineMarks?.italic === true,
      underline: Boolean(headlineMarks?.link),
      fontFamily: headlineLayout.fontFamily
    })),
    renderBody(slide, bodyLayout, palette),
    input.hasLogo
      ? `<rect x="${w - margin - 138}" y="${margin - 4}" width="138" height="48" rx="12" fill="${palette.soft}" opacity="0.86"/><text x="${w - margin - 69}" y="${margin + 27}" text-anchor="middle" font-family="Poppins, Arial" font-size="17" font-weight="800" fill="${palette.secondary}">${escapeXml(shortBrand(input.brandName))}</text>`
      : `<text x="${w - margin}" y="${margin + 26}" text-anchor="end" font-family="Poppins, Arial" font-size="18" font-weight="800" fill="${palette.secondary}">${escapeXml(shortBrand(input.brandName))}</text>`,
    `<rect x="${margin}" y="${h - margin - 44}" width="${w - margin * 2}" height="4" rx="2" fill="${palette.secondary}" opacity="0.16"/>`,
    `<rect x="${margin}" y="${h - margin - 44}" width="${progressWidth}" height="4" rx="2" fill="${palette.accent}"/>`,
    `<text x="${footerLayout.x}" y="${footerLayout.y}" font-family="${escapeXml(footerLayout.fontFamily)}" font-size="${footerLayout.fontSize}" font-weight="700" fill="${footerLayout.color}" opacity="0.78">${escapeXml(slide.footer)}</text>`,
    `<text x="${w - margin}" y="${footerLayout.y}" text-anchor="end" font-family="Poppins, Arial" font-size="20" font-weight="700" fill="${palette.secondary}" opacity="0.78">${input.slideIndex + 1}/${input.slideCount}</text>`,
    `</svg>`
  ].join("");
}

function getSlideTextLayouts(slide: CarouselSlide, deck: DeckSpec, palette: DeckPalette): Record<TextFieldKey, ResolvedTextLayout> {
  const w = deck.width;
  const h = deck.height;
  const margin = Math.round(w * 0.085);
  const isSquare = w === h;
  const headlineSize = isSquare ? 62 : 72;
  const bodySize = isSquare ? 28 : 30;
  const headlineMax = slide.layout === "split" ? Math.round(w * 0.55) : w - margin * 2;
  const bodyMax = slide.layout === "split" ? Math.round(w * 0.54) : w - margin * 2;
  const headlineY = slide.layout === "cover" ? Math.round(h * 0.28) : margin + 150;
  const defaultHeadline: ResolvedTextLayout = {
    x: margin,
    y: headlineY,
    maxWidth: headlineMax,
    fontSize: headlineSize,
    fontFamily: "Poppins, Arial",
    color: palette.ink
  };
  const headlineStyle = slide.textStyles?.headline ?? {};
  const resolvedHeadline = resolveTextLayout(defaultHeadline, headlineStyle);
  const bodyY = resolvedHeadline.y + wrapText(slide.headline, resolvedHeadline.maxWidth, resolvedHeadline.fontSize, 0.58).length * (resolvedHeadline.fontSize * 1.08) + 34;

  return {
    eyebrow: resolveTextLayout({
      x: margin,
      y: margin + 18,
      maxWidth: w - margin * 2,
      fontSize: 22,
      fontFamily: "Poppins, Arial",
      color: palette.secondary
    }, slide.textStyles?.eyebrow ?? {}),
    headline: resolvedHeadline,
    body: resolveTextLayout({
      x: margin,
      y: bodyY,
      maxWidth: bodyMax,
      fontSize: bodySize,
      fontFamily: "Poppins, Arial",
      color: palette.secondary
    }, slide.textStyles?.body ?? {}),
    footer: resolveTextLayout({
      x: margin,
      y: h - margin + 4,
      maxWidth: w - margin * 2,
      fontSize: 20,
      fontFamily: "Poppins, Arial",
      color: palette.secondary
    }, slide.textStyles?.footer ?? {})
  };
}

function resolveTextLayout(defaults: ResolvedTextLayout, style: CarouselTextStyle): ResolvedTextLayout {
  return {
    ...defaults,
    x: style.x ?? defaults.x,
    y: style.y ?? defaults.y,
    fontSize: style.fontSize ?? defaults.fontSize,
    fontFamily: style.fontFamily ?? defaults.fontFamily,
    color: style.color ?? defaults.color
  };
}

function renderBody(slide: CarouselSlide, layout: ResolvedTextLayout, palette: DeckPalette) {
  const bodyMarks = slide.richText?.body;
  const bodyWeight = bodyMarks?.bold ? "800" : "600";
  const bodyOptions = compactTextOptions({ italic: bodyMarks?.italic === true, fontFamily: layout.fontFamily });
  const { x, y, maxWidth, fontSize: size } = layout;

  if (slide.layout === "checklist") {
    const items = slide.body.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 4);
    return items.map((item, index) => {
      const cy = y + index * 78;
      return [
        `<circle cx="${x + 15}" cy="${cy - 10}" r="14" fill="${palette.accent}" opacity="0.88"/>`,
        `<path d="M${x + 8} ${cy - 11}l5 5 10-13" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
        renderMultilineText(item, x + 48, cy, maxWidth - 48, size, 1.26, bodyWeight, layout.color, bodyOptions)
      ].join("");
    }).join("");
  }

  if (bodyMarks?.list) {
    const items = slide.body.split("\n").flatMap((line) => line.split(/;\s*/)).map((item) => item.trim().replace(/^[-•]\s*/, "")).filter(Boolean).slice(0, 4);
    return items.map((item, index) => {
      const cy = y + index * 58;
      return [
        `<circle cx="${x + 10}" cy="${cy - 9}" r="5" fill="${palette.accent}" opacity="0.9"/>`,
        renderMultilineText(item, x + 30, cy, maxWidth - 30, size, 1.18, bodyWeight, layout.color, bodyOptions)
      ].join("");
    }).join("");
  }

  if (slide.layout === "cta") {
    return [
      renderMultilineText(slide.body, x, y, maxWidth, size, 1.32, bodyWeight, layout.color, bodyOptions),
      `<rect x="${x}" y="${y + 168}" width="300" height="70" rx="35" fill="${palette.secondary}"/>`,
      `<text x="${x + 150}" y="${y + 212}" text-anchor="middle" font-family="Poppins, Arial" font-size="23" font-weight="800" fill="white">Start the conversation</text>`
    ].join("");
  }

  return renderMultilineText(slide.body, x, y, maxWidth, size, 1.32, bodyWeight, layout.color, bodyOptions);
}

function renderSlideElements(slide: CarouselSlide, deck: DeckSpec, palette: DeckPalette) {
  const elements = slide.elements ?? [];
  if (!elements.length) return "";
  return elements.map((element) => {
    const size = Math.round(Math.min(deck.width, deck.height) * element.size);
    const x = Math.round(deck.width * element.x);
    const y = Math.round(deck.height * element.y);
    const color = element.colorRole === "accent" ? palette.accent : element.colorRole === "secondary" ? palette.secondary : palette.ink;
    return element.svg.replace(
      "<svg ",
      `<svg x="${x}" y="${y}" width="${size}" height="${size}" color="${escapeXml(color)}" opacity="${element.opacity}" `
    );
  }).join("");
}

function compactTextOptions(input: { italic?: boolean; underline?: boolean; fontFamily?: string }) {
  const options: { italic?: boolean; underline?: boolean; fontFamily?: string } = {};
  if (input.italic === true) options.italic = true;
  if (input.underline === true) options.underline = true;
  if (input.fontFamily) options.fontFamily = input.fontFamily;
  return options;
}

function renderMultilineText(
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  weight: string,
  color: string,
  options: { italic?: boolean; underline?: boolean; fontFamily?: string } = {}
) {
  const lines = wrapText(value, maxWidth, fontSize, weight === "800" ? 0.54 : 0.5).slice(0, weight === "800" ? 5 : 8);
  return [
    `<text x="${x}" y="${y}" font-family="${escapeXml(options.fontFamily ?? "Poppins, Arial")}" font-size="${fontSize}" font-weight="${weight}" font-style="${options.italic ? "italic" : "normal"}" text-decoration="${options.underline ? "underline" : "none"}" fill="${color}">`,
    ...lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : fontSize * lineHeight}">${escapeXml(line)}</tspan>`),
    `</text>`
  ].join("");
}

function wrapText(value: string, maxWidth: number, fontSize: number, widthFactor: number) {
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * widthFactor)));
  const sourceLines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const lines: string[] = [];
  for (const source of sourceLines.length ? sourceLines : [""]) {
    const words = source.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function checklistMarks(margin: number, h: number, palette: DeckPalette) {
  return `<rect x="${margin}" y="${h * 0.18}" width="7" height="${h * 0.5}" rx="3.5" fill="${palette.accent}" opacity="0.32"/>`;
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function downloadSvgAsPng(svg: string, deck: DeckSpec, fileName: string) {
  const image = await loadImage(svgToDataUrl(svg));
  const canvas = document.createElement("canvas");
  canvas.width = deck.width;
  canvas.height = deck.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not render PNG.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not render slide."));
    image.src = src;
  });
}

function buildLinkedInPostText(input: {
  brandName: string;
  projectName: string | null;
  topic: string;
  slides: CarouselSlide[];
}) {
  const subject = input.projectName ?? input.brandName;
  return [
    `${subject}: ${input.topic}`,
    "",
    ...input.slides.map((slide, index) => `${index + 1}. ${slide.headline}`),
    "",
    "#realestate #linkedinmarketing #brandcommunication"
  ].join("\n");
}

function shortBrand(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 1) return (words[0] ?? value).slice(0, 12);
  return words.slice(0, 2).map((word) => word[0] ?? "").join("").toUpperCase();
}

function formatStage(value?: string | null) {
  if (!value) return "Not specified";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function normalizeHex(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "linkedin-carousel";
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
