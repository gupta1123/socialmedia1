"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BrandAssetRecord, FestivalRecord, PostTypeRecord, ProjectRecord } from "@image-lab/contracts";
import {
  generateCreativeV3Async,
  getCreativeV3AsyncStatus,
  getCreativeV3BrandPresets,
  getCreativeV3VisualTemplates,
  getFestivals,
  getPostTypes,
  getProjects,
  type CreativeV3BrandPreset,
  type CreativeV3CompileResponse,
  type CreativeV3CompilePayload,
  type CreativeV3GenerateAsyncStatus,
  type CreativeV3RenderResponse,
  type CreativeV3VisualTemplate
} from "../../../lib/api";
import { useStudio } from "../studio-context";

type CopyMode = "auto" | "manual";
type TextTreatment = "render_text" | "reserve_space";
type CreativeMode = NonNullable<CreativeV3CompilePayload["creativeMode"]>;
type V3Variant = CreativeV3CompileResponse["result"]["variants"][number];
type RefModalKind = "templates" | "all" | "exteriors" | "interiors" | "amenities" | "location" | "generated";
type GenerationRun = {
  id: string;
  label: string;
  result: CreativeV3CompileResponse;
  rendersByVariantId: Record<string, CreativeV3RenderResponse>;
  outputIdsByVariantId: Record<string, string[]>;
};

const formatOptions = [
  { value: "square", label: "1:1", name: "Square" },
  { value: "landscape", label: "16:9", name: "Widescreen" },
  { value: "story", label: "9:16", name: "Social story" },
  { value: "portrait", label: "4:5", name: "Social post" }
];

const contactOptions = ["phone", "email", "website", "whatsapp"] as const;
const targetAudienceOptions = [
  "Homebuyers",
  "Investors",
  "Homebuyers and investors",
  "Luxury buyers",
  "Upgrade families",
  "Young professionals",
  "NRI buyers",
  "First-time buyers",
  "Commercial investors",
  "Channel partners"
] as const;
const copyLanguageOptions = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "kn", label: "Kannada" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "bn", label: "Bengali" }
] as const;
const creativeModeHelp: Array<{ value: CreativeMode; label: string; description: string }> = [
  { value: "auto", label: "Auto", description: "Let the system choose from the brief, post type, selected template, and selected image." },
  { value: "image_led", label: "Image led", description: "Make the building/render/photo the hero; keep copy minimal." },
  { value: "copy_led", label: "Copy led", description: "Make headline and text hierarchy the visual hook; image supports the message." },
  { value: "asset_led", label: "Reference led", description: "Build around the selected reference image and preserve what it shows." },
  { value: "template_led", label: "Template led", description: "Follow the selected template layout/style more strictly." },
  { value: "proof_led", label: "Proof led", description: "Lead with verified facts like location, progress, amenities, trust, or compliance." },
  { value: "offer_led", label: "Offer led", description: "Make pricing, EMI, launch offer, or proposition the main hierarchy." },
  { value: "lifestyle_led", label: "Lifestyle led", description: "Lead with mood, aspiration, amenities, interiors, or living experience." },
  { value: "brand_led", label: "Brand led", description: "Lead with brand identity, recall, festive greeting, or minimal project context." },
  { value: "graphic_led", label: "Graphic led", description: "Lead with shapes, icons, badges, typography, and poster composition." }
];
const V3_GENERATION_POLL_INTERVAL_MS = 2500;
const V3_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
const createV3DefaultBriefs: Record<string, string> = {
  "project-launch": "Create a premium real-estate launch post with a strong architectural visual and restrained copy.",
  "amenity-spotlight": "Create a premium amenity post that highlights one lifestyle benefit with calm, polished copy.",
  "site-visit-invite": "Create a premium site visit invite with a clear visit CTA and grounded project context.",
  "location-advantage": "Create a premium location advantage post using only verified connectivity or neighbourhood facts.",
  "construction-update": "Create a premium construction update post that feels credible, current, and grounded.",
  ad: "Create a premium offer-led real-estate post using only verified or client-provided pricing details.",
  offer: "Create a premium offer-led real-estate post using only verified or client-provided offer details.",
  testimonial: "Create a premium testimonial-style post without inventing customer quotes or names.",
  "festive-greeting": "Create a premium festive greeting that feels respectful, elegant, and brand-safe."
};
const defaultBriefValues = new Set(Object.values(createV3DefaultBriefs));
const referenceFilterOptions: Array<{ value: RefModalKind; label: string; icon: Exclude<RefModalKind, "templates"> }> = [
  { value: "all", label: "All images", icon: "all" },
  { value: "exteriors", label: "Exteriors", icon: "exteriors" },
  { value: "interiors", label: "Interiors", icon: "interiors" },
  { value: "amenities", label: "Amenities", icon: "amenities" },
  { value: "location", label: "Location", icon: "location" },
  { value: "generated", label: "Generated", icon: "generated" }
];

export default function CreateV3Page() {
  const searchParams = useSearchParams();
  const urlGenerationSessionId = searchParams.get("sessionId");
  const { sessionToken, activeBrandId, activeAssets, activeBrand, setMessage } = useStudio();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [festivals, setFestivals] = useState<FestivalRecord[]>([]);
  const [brandPresets, setBrandPresets] = useState<CreativeV3BrandPreset[]>([]);
  const [visualTemplates, setVisualTemplates] = useState<CreativeV3VisualTemplate[]>([]);
  const [projectId, setProjectId] = useState("");
  const [postTypeId, setPostTypeId] = useState("");
  const [festivalId, setFestivalId] = useState("");
  const [visualTemplateId, setVisualTemplateId] = useState("");
  const [tempSelectedTemplateId, setTempSelectedTemplateId] = useState<string | null>(null);
  const [brandPresetId, setBrandPresetId] = useState("");
  const [brief, setBrief] = useState("Create a premium real-estate launch post with a strong architectural visual and restrained copy.");
  const [audience, setAudience] = useState("Homebuyers and investors");
  const [format, setFormat] = useState("portrait");
  const [variantCount, setVariantCount] = useState(2);
  const [variationStrategy, setVariationStrategy] = useState("auto");
  const [creativeMode, setCreativeMode] = useState<CreativeMode>("auto");
  const [copyMode, setCopyMode] = useState<CopyMode>("auto");
  const [textTreatment, setTextTreatment] = useState<TextTreatment>("render_text");
  const [copyLanguage, setCopyLanguage] = useState("en");
  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [cta, setCta] = useState("");
  const [includeLogo, setIncludeLogo] = useState(false);
  const [logoAssetId, setLogoAssetId] = useState("");
  const [additionalLogoAssetIds, setAdditionalLogoAssetIds] = useState<string[]>([]);
  const [showLogoPicker, setShowLogoPicker] = useState(false);
  const [showReferencePicker, setShowReferencePicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [contactItems, setContactItems] = useState<string[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [pendingVariantCount, setPendingVariantCount] = useState(variantCount);
  const [result, setResult] = useState<CreativeV3CompileResponse | null>(null);
  const [rendersByVariantId, setRendersByVariantId] = useState<Record<string, CreativeV3RenderResponse>>({});
  const [outputIdsByVariantId, setOutputIdsByVariantId] = useState<Record<string, string[]>>({});
  const [generationRuns, setGenerationRuns] = useState<GenerationRun[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [generationSessionId, setGenerationSessionId] = useState<string | null>(null);
  const [refModalKind, setRefModalKind] = useState<RefModalKind>("all");
  const [refModalProjectId, setRefModalProjectId] = useState<string>(projectId || "");
  const [refSearchQuery, setRefSearchQuery] = useState("");

  useEffect(() => {
    if (!sessionToken || !activeBrandId) return;
    let cancelled = false;

    async function load() {
      const [projectRecords, postTypeRecords, festivalRecords, presetRecords] = await Promise.all([
        getProjects(sessionToken!, { brandId: activeBrandId! }),
        getPostTypes(sessionToken!),
        getFestivals(sessionToken!),
        getCreativeV3BrandPresets(sessionToken!, { brandId: activeBrandId! })
      ]);
      if (cancelled) return;
      setProjects(projectRecords);
      setPostTypes(postTypeRecords);
      setFestivals(festivalRecords);
      setBrandPresets(presetRecords);
      setProjectId((current) => current || projectRecords[0]?.id || "");
      setPostTypeId((current) => current || postTypeRecords.find((item) => item.code === "project-launch")?.id || postTypeRecords[0]?.id || "");
    }

    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Failed to load V3 create data"));
    return () => {
      cancelled = true;
    };
  }, [activeBrandId, sessionToken, setMessage]);

  useEffect(() => {
    if (!sessionToken || !activeBrandId) {
      setVisualTemplates([]);
      return;
    }
    let cancelled = false;
    async function loadTemplates() {
      const templateRecords = await getCreativeV3VisualTemplates(sessionToken!, {
        brandId: activeBrandId!,
        projectId: projectId || null,
        postTypeId: postTypeId || null,
        format
      });
      if (!cancelled) {
        setVisualTemplates(templateRecords);
      }
    }
    void loadTemplates().catch((error) => setMessage(error instanceof Error ? error.message : "Failed to load visual templates"));
    return () => {
      cancelled = true;
    };
  }, [activeBrandId, format, postTypeId, projectId, sessionToken, setMessage]);

  const selectedTemplate = useMemo(() => visualTemplates.find((t) => t.template_id === visualTemplateId) ?? null, [visualTemplateId, visualTemplates]);

  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId) ?? null, [projectId, projects]);
  const selectedPostType = useMemo(() => postTypes.find((postType) => postType.id === postTypeId) ?? null, [postTypeId, postTypes]);
  const isFestiveGreeting = selectedPostType?.code === "festive-greeting";
  const selectedFestival = useMemo(() => festivals.find((festival) => festival.id === festivalId) ?? null, [festivalId, festivals]);
  const eligibleBrandPresets = useMemo(
    () => brandPresets.filter((preset) => !preset.project_id || !projectId || preset.project_id === projectId),
    [brandPresets, projectId]
  );
  const selectedBrandPreset = useMemo(
    () => eligibleBrandPresets.find((preset) => preset.preset_id === brandPresetId || preset.db_id === brandPresetId) ?? null,
    [brandPresetId, eligibleBrandPresets]
  );
  useEffect(() => {
    if (brandPresetId && !selectedBrandPreset) {
      setBrandPresetId("");
    }
  }, [brandPresetId, selectedBrandPreset]);
  useEffect(() => {
    setRefModalProjectId((current) => {
      if (current && projects.some((project) => project.id === current)) return current;
      return projectId || "";
    });
  }, [projectId, projects]);
  useEffect(() => {
    if (!isFestiveGreeting && festivalId) {
      setFestivalId("");
    }
  }, [festivalId, isFestiveGreeting]);
  useEffect(() => {
    if (!selectedPostType) return;
    setBrief((current) => {
      const trimmed = current.trim();
      if (!isReplaceableBrief(trimmed)) {
        return current;
      }
      return defaultBriefForPostType(selectedPostType.code, selectedFestival);
    });
  }, [selectedFestival, selectedPostType]);
  useEffect(() => {
    if (visualTemplateId && !visualTemplates.some((template) => template.template_id === visualTemplateId)) {
      setVisualTemplateId("");
    }
  }, [visualTemplateId, visualTemplates]);
  const projectAssets = useMemo(
    () => activeAssets.filter((asset) => (projectId ? asset.projectId === projectId || asset.projectId == null : asset.projectId == null)),
    [activeAssets, projectId]
  );
  const logoAssets = useMemo(() => projectAssets.filter((asset) => asset.kind === "logo"), [projectAssets]);
  const referenceAssets = useMemo(
    () => projectAssets.filter((asset) => isRenderableImage(asset) && !["logo", "rera_qr"].includes(asset.kind)),
    [projectAssets]
  );
  const selectedReferenceAsset = useMemo(
    () => referenceAssets.find((asset) => selectedAssetIds.includes(asset.id)) ?? null,
    [referenceAssets, selectedAssetIds]
  );
  const creativeModeOptions = useMemo(
    () => buildCreativeModeOptions({
      hasTemplate: Boolean(selectedTemplate),
      hasReference: Boolean(selectedReferenceAsset),
      postTypeCode: selectedPostType?.code ?? null
    }),
    [selectedPostType?.code, selectedReferenceAsset, selectedTemplate]
  );

  const filteredReferenceAssets = useMemo(() => {
    if (refModalKind === "templates") return [];
    let items = projectAssets.filter((asset) => isRenderableImage(asset) && !["logo", "rera_qr"].includes(asset.kind));
    
    if (refModalProjectId) {
      items = items.filter(a => a.projectId === refModalProjectId);
    }
    
    if (refModalKind !== "all") {
      if (refModalKind === "generated") {
        items = items.filter((a) => stringMetadata(assetMetadataRecord(a), "source") === "generated");
      } else {
        items = items.filter((a) => matchesReferenceCategory(a, refModalKind) && stringMetadata(assetMetadataRecord(a), "source") !== "generated");
      }
    }
    
    if (refSearchQuery.trim()) {
      const q = refSearchQuery.toLowerCase();
      items = items.filter((asset) => searchableText(asset).includes(q));
    }
    
    return items;
  }, [projectAssets, refModalProjectId, refModalKind, refSearchQuery]);

  const filteredTemplates = useMemo(() => {
    if (refModalKind !== "templates") return [];
    let items = [...visualTemplates];
    if (refSearchQuery.trim()) {
      const q = refSearchQuery.toLowerCase();
      items = items.filter((template) => searchableText(template).includes(q));
    }
    return items;
  }, [visualTemplates, refModalKind, refSearchQuery]);
  useEffect(() => {
    if (!selectedAssetIds.length) return;
    const allowedAssetIds = new Set(referenceAssets.map((asset) => asset.id));
    const nextSelectedAssetIds = selectedAssetIds.filter((assetId) => allowedAssetIds.has(assetId)).slice(0, 1);
    if (nextSelectedAssetIds.length !== selectedAssetIds.length || nextSelectedAssetIds[0] !== selectedAssetIds[0]) {
      setSelectedAssetIds(nextSelectedAssetIds);
    }
  }, [referenceAssets, selectedAssetIds]);

  useEffect(() => {
    if (!logoAssetId && logoAssets[0]) {
      setLogoAssetId(logoAssets[0].id);
    }
  }, [logoAssetId, logoAssets]);

  useEffect(() => {
    if (!additionalLogoAssetIds.length) return;
    const allowedLogoIds = new Set(logoAssets.map((asset) => asset.id));
    const nextAdditionalLogoAssetIds = additionalLogoAssetIds.filter((assetId) => allowedLogoIds.has(assetId) && assetId !== logoAssetId);
    if (nextAdditionalLogoAssetIds.length !== additionalLogoAssetIds.length || nextAdditionalLogoAssetIds.some((assetId, index) => assetId !== additionalLogoAssetIds[index])) {
      setAdditionalLogoAssetIds(nextAdditionalLogoAssetIds);
    }
  }, [additionalLogoAssetIds, logoAssetId, logoAssets]);

  const selectedVariant = useMemo(
    () => generationRuns[0]?.result.result.variants.find((variant) => variant.variant_id === selectedVariantId) ?? generationRuns[0]?.result.result.variants[0] ?? null,
    [generationRuns, selectedVariantId]
  );
  const canCompile = Boolean(activeBrandId && brief.trim().length >= 10 && !loading && (!isFestiveGreeting || festivalId));
  const selectedLogoAsset = logoAssets.find((asset) => asset.id === logoAssetId) ?? logoAssets[0] ?? null;
  const selectedAdditionalLogoAssets = additionalLogoAssetIds
    .map((assetId) => logoAssets.find((asset) => asset.id === assetId))
    .filter((asset): asset is BrandAssetRecord => Boolean(asset));
  const selectedLogoCount = (includeLogo && selectedLogoAsset ? 1 : 0) + selectedAdditionalLogoAssets.length;
  const logoTileAsset = includeLogo ? selectedLogoAsset : selectedAdditionalLogoAssets[0] ?? selectedLogoAsset;

  useEffect(() => {
    if (!urlGenerationSessionId && generationSessionId) {
      setGenerationSessionId(null);
      setResult(null);
      setSelectedVariantId(null);
      setRendersByVariantId({});
      setOutputIdsByVariantId({});
      setGenerationRuns([]);
    }
  }, [urlGenerationSessionId, generationSessionId]);

  useEffect(() => {
    if (!urlGenerationSessionId || !sessionToken) return;
    const sessionId: string = urlGenerationSessionId;
    const token = sessionToken;

    let cancelled = false;
    async function loadGenerationSession() {
      setLoading(true);
      setGenerationStatus("Loading generation session...");
      try {
        const status = await pollGenerationJob(token, sessionId, (message) => {
          if (!cancelled) {
            setGenerationStatus(message);
          }
        });
        if (cancelled) return;
        hydrateFromGenerationInput(status.input);
        setGenerationSessionId(sessionId);
        applyCompletedGenerationStatus(status, sessionId);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to load generation session.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setGenerationStatus("");
        }
      }
    }

    void loadGenerationSession();
    return () => {
      cancelled = true;
    };
  }, [urlGenerationSessionId, sessionToken, setMessage]);

  function buildGeneratePayload(): CreativeV3CompilePayload {
    return {
      brandId: activeBrandId!,
      projectId: projectId || null,
      postTypeId: postTypeId || null,
      brief,
      audience,
      festivalId: isFestiveGreeting ? festivalId || null : null,
      format,
      variantCount,
      variationStrategy,
      assetVariation: true,
      creativeMode,
      copyMode,
      copyLanguage,
      copy: {
        headline: headline || null,
        subheadline: subheadline || null,
        cta: cta || null
      },
      brandPresetId: brandPresetId || null,
      visualTemplateId: visualTemplateId || null,
      visualTemplateIds: visualTemplateId ? [visualTemplateId] : [],
      selectedAssetIds,
      includeLogo,
      logoAssetId: includeLogo ? logoAssetId || null : null,
      additionalLogoAssetIds,
      includeReraQr: false,
      contactItems: contactItems as Array<"phone" | "email" | "website" | "whatsapp">,
      options: {
        generationRunId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        textTreatment
      }
    };
  }

  async function handleGenerate() {
    if (!sessionToken || !activeBrandId || !canCompile) return;
    const payload = buildGeneratePayload();
    setLoading(true);
    setPendingVariantCount(payload.variantCount ?? variantCount);
    setGenerationStatus("Starting generation...");
    setSelectedVariantId(null);
    try {
      const job = await generateCreativeV3Async(sessionToken, payload);
      setGenerationSessionId(job.jobId);
      window.history.replaceState(null, "", `/studio/create-v3?sessionId=${encodeURIComponent(job.jobId)}`);
      setMessage("Generating V3 images...");
      setGenerationStatus("Compiling prompt and generating images...");
      const status = await pollGenerationJob(sessionToken, job.jobId, setGenerationStatus);
      applyCompletedGenerationStatus(status, job.jobId);
      setMessage(status.result?.compile.result.status === "ready" ? "V3 images generated." : `V3 returned ${status.result?.compile.result.status ?? "completed"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "V3 generation failed");
    } finally {
      setLoading(false);
      setGenerationStatus("");
    }
  }

  function applyCompletedGenerationStatus(status: CreativeV3GenerateAsyncStatus, runId: string) {
    if (!status.result?.compile) {
      throw new Error("Creative V3 job completed without compile output.");
    }
    const compileResult = status.result.compile;
    const nextRendersByVariantId = Object.fromEntries((status.result.renders ?? []).map((item) => [item.variantId, item.render]));
    const nextOutputIdsByVariantId = Object.fromEntries((status.result.renders ?? []).map((item) => [item.variantId, item.outputIds ?? []]));
    const nextRun: GenerationRun = {
      id: runId,
      label: "Generation",
      result: compileResult,
      rendersByVariantId: nextRendersByVariantId,
      outputIdsByVariantId: nextOutputIdsByVariantId,
    };
    setResult(compileResult);
    setRendersByVariantId(nextRendersByVariantId);
    setOutputIdsByVariantId(nextOutputIdsByVariantId);
    setGenerationRuns((current) => [nextRun, ...current.filter((run) => run.id !== runId)].slice(0, 8));
    setSelectedVariantId(compileResult.result.variants[0]?.variant_id ?? null);
  }

  function hydrateFromGenerationInput(input?: CreativeV3CompilePayload) {
    if (!input) return;
    setProjectId(input.projectId ?? "");
    setPostTypeId(input.postTypeId ?? "");
    setFestivalId(input.festivalId ?? "");
    setBrief(input.brief ?? "");
    setAudience(input.audience ?? "Homebuyers and investors");
    setFormat(input.format ?? "portrait");
    setVariantCount(input.variantCount ?? 1);
    setVariationStrategy(input.variationStrategy ?? "auto");
    setCreativeMode(input.creativeMode ?? "auto");
    setCopyMode(input.copyMode ?? "auto");
    setTextTreatment(input.options?.textTreatment === "reserve_space" ? "reserve_space" : "render_text");
    setCopyLanguage(input.copyLanguage ?? "en");
    setHeadline(input.copy?.headline ?? "");
    setSubheadline(input.copy?.subheadline ?? "");
    setCta(input.copy?.cta ?? "");
    setBrandPresetId(input.brandPresetId ?? "");
    setVisualTemplateId(input.visualTemplateId ?? input.visualTemplateIds?.[0] ?? "");
    setIncludeLogo(Boolean(input.includeLogo));
    setLogoAssetId(input.logoAssetId ?? "");
    setAdditionalLogoAssetIds(input.additionalLogoAssetIds ?? []);
    setSelectedAssetIds((input.selectedAssetIds ?? []).slice(0, 1));
    setContactItems(input.contactItems ?? []);
  }

  function toggleContact(item: string) {
    setContactItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  }

  function toggleAdditionalLogo(assetId: string) {
    setAdditionalLogoAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((value) => value !== assetId)
        : [...current, assetId]
    );
  }

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((current) => (current.includes(assetId) ? [] : [assetId]));
    setShowReferencePicker(false);
  }

  return (
    <main className="create-v3-app-shell">
      <aside className="create-v3-tool-panel">

        <label className="create-v3-field">
          <span>Project context</span>
          <CreateV3Dropdown
            onChange={setProjectId}
            options={[
              { value: "", label: "No project selected" },
              ...projects.map((project) => ({ value: project.id, label: project.name }))
            ]}
            value={projectId}
          />
        </label>

        <label className="create-v3-field">
          <span>Post type</span>
          <CreateV3Dropdown
            onChange={(value) => {
              const nextPostType = postTypes.find((item) => item.id === value) ?? null;
              setPostTypeId(value);
              if (nextPostType?.code !== "festive-greeting") {
                setFestivalId("");
              }
              setBrief((current) => {
                const trimmed = current.trim();
                if (!isReplaceableBrief(trimmed)) {
                  return current;
                }
                return defaultBriefForPostType(nextPostType?.code, selectedFestival);
              });
            }}
            options={postTypes.map((postType) => ({ value: postType.id, label: postType.name }))}
            value={postTypeId}
          />
        </label>

        {isFestiveGreeting ? (
          <label className="create-v3-field">
            <span>Festival</span>
            <CreateV3Dropdown
	              onChange={(value) => {
	                setFestivalId(value);
	                const festival = festivals.find((item) => item.id === value);
                  setBrief((current) => {
                    const trimmed = current.trim();
                    if (!isReplaceableBrief(trimmed)) {
                      return current;
                    }
                    return defaultBriefForPostType("festive-greeting", festival);
                  });
	              }}
              options={[
                { value: "", label: "Choose a festival" },
                ...festivals.map((festival) => ({
                  value: festival.id,
                  label: [festival.name, festival.dateLabel ?? festival.community].filter(Boolean).join(" · ")
                }))
              ]}
              value={festivalId}
            />
            {selectedFestival ? (
              <small className="create-v3-preset-summary">
                {[selectedFestival.meaning, selectedFestival.community, selectedFestival.regions.slice(0, 2).join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            ) : null}
          </label>
        ) : null}



        <div className="create-v3-reference-header">
          <span>Assets</span>
          <strong>{selectedAssetIds.length}/1 ref · {selectedLogoCount} logo{selectedLogoCount === 1 ? "" : "s"} · {referenceAssets.length} images</strong>
        </div>
        <div className="create-v3-reference-slots">
          <div className={`create-v3-reference-slot create-v3-reference-slot-logo ${showLogoPicker || selectedLogoCount > 0 ? "is-active" : ""}`}>
            <button
              className={`create-v3-reference-slot-main ${selectedLogoCount > 0 && selectedLogoAsset ? "has-logo" : ""}`}
              type="button"
              onClick={() => setShowLogoPicker((current) => !current)}
              title={selectedLogoCount > 0 ? "Change logos" : "Add logos"}
            >
              {selectedLogoCount > 0 && logoTileAsset ? (
                <>
                  <span className="create-v3-logo-tile-preview">
                    {logoTileAsset.thumbnailUrl || logoTileAsset.previewUrl ? (
                      <img src={logoTileAsset.thumbnailUrl ?? logoTileAsset.previewUrl} alt="" />
                    ) : (
                      <span>{logoTileAsset.label.slice(0, 2)}</span>
                    )}
                  </span>
                  <span className="create-v3-logo-tile-label">{selectedLogoCount === 1 ? "Logo" : `Logos +${selectedLogoCount - 1}`}</span>
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
                  </svg>
                  <span>Logo</span>
                </>
              )}
            </button>
            {selectedLogoCount > 0 ? (
              <button
                aria-label="Remove selected logos"
                className="create-v3-reference-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  setIncludeLogo(false);
                  setAdditionalLogoAssetIds([]);
                  setShowLogoPicker(false);
                }}
                type="button"
              >
                ×
              </button>
            ) : null}
          </div>
          <button
            className={`create-v3-reference-slot ${visualTemplateId ? "is-active" : ""}`}
            type="button"
            onClick={() => {
              if (visualTemplateId) {
                setVisualTemplateId("");
                return;
              }
              setRefModalKind("templates");
              setRefSearchQuery("");
              setRefModalProjectId(projectId || "");
              setShowReferencePicker(true);
            }}
          >
            {selectedTemplate ? (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span className="create-v3-reference-slot-caption">{selectedTemplate.name}</span>
              </>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
                <span>Template</span>
              </>
            )}
          </button>
          <div className={`create-v3-reference-slot create-v3-reference-slot-ref ${showReferencePicker || selectedReferenceAsset ? "is-active" : ""}`}>
            <button
              className={`create-v3-reference-slot-main ${selectedReferenceAsset ? "has-image" : ""}`}
              type="button"
              onClick={() => {
                setRefModalKind("all");
                setRefSearchQuery("");
                setRefModalProjectId(projectId || "");
                setShowReferencePicker(true);
              }}
              title={selectedReferenceAsset ? `Change reference: ${selectedReferenceAsset.label}` : "Add reference image"}
            >
              {selectedReferenceAsset ? (
                <>
                  {selectedReferenceAsset.thumbnailUrl || selectedReferenceAsset.previewUrl ? (
                    <img src={selectedReferenceAsset.thumbnailUrl ?? selectedReferenceAsset.previewUrl} alt="" />
                  ) : (
                    <span>{selectedReferenceAsset.label.slice(0, 2)}</span>
                  )}
                  <span className="create-v3-reference-slot-caption">{selectedReferenceAsset.label}</span>
                </>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14"/><path d="M12 5v14"/>
                  </svg>
                  <span>Ref</span>
                </>
              )}
            </button>
            {selectedReferenceAsset ? (
              <button
                aria-label="Remove selected reference"
                className="create-v3-reference-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedAssetIds([]);
                }}
                type="button"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>



        {showLogoPicker ? (
          <div className="create-v3-picker-block">
            <div className="create-v3-reference-header">
              <span>Logos</span>
              <strong>{selectedLogoCount > 0 ? `${selectedLogoCount} selected` : "Pick primary or extra"}</strong>
            </div>
            <div className="create-v3-logo-picker-section">
              <span>Primary logo</span>
              <button
                className={!includeLogo ? "is-selected" : ""}
                onClick={() => setIncludeLogo(false)}
                type="button"
              >
                No primary
              </button>
            </div>
            <div className="create-v3-logo-picker">
              {logoAssets.length > 0 ? logoAssets.map((asset) => (
                <button
                  aria-label={asset.label}
                  className={includeLogo && logoAssetId === asset.id ? "is-selected" : ""}
                  key={asset.id}
                  onClick={() => {
                    setLogoAssetId(asset.id);
                    setIncludeLogo(true);
                    setAdditionalLogoAssetIds((current) => current.filter((assetId) => assetId !== asset.id));
                  }}
                  title={asset.label}
                  type="button"
                >
                  {asset.thumbnailUrl || asset.previewUrl ? <img src={asset.thumbnailUrl ?? asset.previewUrl} alt="" /> : <span>{asset.label.slice(0, 2)}</span>}
                </button>
              )) : (
                <p className="create-v3-picker-empty">No logo assets uploaded for this brand.</p>
              )}
            </div>
            {logoAssets.length > 1 || !includeLogo ? (
              <>
                <div className="create-v3-logo-picker-section">
                  <span>Extra logos</span>
                  <strong>{selectedAdditionalLogoAssets.length} selected</strong>
                </div>
                <div className="create-v3-logo-picker create-v3-logo-picker-extra">
                  {logoAssets.filter((asset) => !includeLogo || asset.id !== logoAssetId).map((asset) => (
                    <button
                      aria-label={`Toggle extra logo ${asset.label}`}
                      className={additionalLogoAssetIds.includes(asset.id) ? "is-selected" : ""}
                      key={asset.id}
                      onClick={() => toggleAdditionalLogo(asset.id)}
                      title={asset.label}
                      type="button"
                    >
                      {asset.thumbnailUrl || asset.previewUrl ? <img src={asset.thumbnailUrl ?? asset.previewUrl} alt="" /> : <span>{asset.label.slice(0, 2)}</span>}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <button className="create-v3-logo-picker-done" onClick={() => setShowLogoPicker(false)} type="button">
              Done
            </button>
          </div>
        ) : null}

        <div className="create-v3-prompt-box">
          <span>Prompt</span>
          <textarea 
            value={brief} 
            onChange={(event) => setBrief(event.target.value)} 
            placeholder="Describe your image—try @ to add references" 
          />
        </div>

        <details className="create-v3-advanced">
          <summary>Advance Settings</summary>
          <div className="create-v3-advanced-body">
            <label className="create-v3-field">
              <span>Preset</span>
              <CreateV3Dropdown
                onChange={(value) => {
                  setBrandPresetId(value);
                  const preset = eligibleBrandPresets.find((item) => item.preset_id === value || item.db_id === value);
                  const presetJson = preset?.preset_json as Record<string, any> | undefined;
                  if (presetJson?.logo?.required || presetJson?.logo_layer?.required) {
                    setIncludeLogo(true);
                  }
                  if (Array.isArray(presetJson?.contact?.items)) {
                    setContactItems(presetJson.contact.items.map(String));
                  }
                }}
                options={[
                  { value: "", label: "No preset" },
                  ...eligibleBrandPresets.map((preset) => ({ value: preset.preset_id, label: preset.name }))
                ]}
                value={brandPresetId}
              />
              {selectedBrandPreset ? (
                <small className="create-v3-preset-summary">{summarizePreset(selectedBrandPreset)}</small>
              ) : null}
            </label>
            <label className="create-v3-field">
              <span>Audience</span>
              <CreateV3Dropdown
                onChange={setAudience}
                options={targetAudienceOptions.map((option) => ({ value: option, label: option }))}
                value={audience}
              />
            </label>
            <label className="create-v3-field">
              <span>Copy language</span>
              <CreateV3Dropdown
                onChange={setCopyLanguage}
                options={copyLanguageOptions.map((option) => ({ value: option.value, label: option.label }))}
                value={copyLanguage}
              />
            </label>
            <label className="create-v3-field">
              <span className="create-v3-label-with-help">
                Creative direction
                <CreativeModeHelpTooltip />
              </span>
              <CreateV3Dropdown
                onChange={(value) => setCreativeMode(value as CreativeMode)}
                options={creativeModeOptions}
                value={creativeMode}
              />
            </label>
            <div className="create-v3-advanced-row">
              <span>Copy</span>
              <div className="create-v3-segment">
                <button className={copyMode === "auto" ? "is-active" : ""} onClick={() => setCopyMode("auto")} type="button">AI Copy</button>
                <button className={copyMode === "manual" ? "is-active" : ""} onClick={() => setCopyMode("manual")} type="button">Exact</button>
              </div>
            </div>
            <div className="create-v3-advanced-row">
              <span>Text in image</span>
              <div className="create-v3-segment">
                <button className={textTreatment === "render_text" ? "is-active" : ""} onClick={() => setTextTreatment("render_text")} type="button">Render text</button>
                <button className={textTreatment === "reserve_space" ? "is-active" : ""} onClick={() => setTextTreatment("reserve_space")} type="button">Keep space</button>
              </div>
            </div>
          </div>
          {copyMode === "manual" && (
            <div className="create-v3-manual-inputs">
              <input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Headline" />
              <input value={subheadline} onChange={(event) => setSubheadline(event.target.value)} placeholder="Subheadline" />
              <input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="CTA" />
            </div>
          )}
          <div className="create-v3-contact-card">
            <span>Optional contact layers</span>
            <div className="create-v3-layer-controls">
              {contactOptions.map((item) => (
                <button key={item} className={contactItems.includes(item) ? "is-active" : ""} type="button" onClick={() => toggleContact(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        </details>

        <div className="create-v3-generate-area">
          <div className="create-v3-generate-controls">
            <div className="create-v3-stepper" aria-label="Variant count">
              <button onClick={() => setVariantCount(Math.max(1, variantCount - 1))}>−</button>
              <span>{variantCount}</span>
              <button onClick={() => setVariantCount(Math.min(3, variantCount + 1))}>+</button>
            </div>
            <CreateV3SizeDropdown
              onChange={setFormat}
              options={formatOptions}
              value={format}
            />
          </div>
          <button className="create-v3-generate-button" disabled={!canCompile} onClick={handleGenerate} type="button">
            {loading ? "Generating..." : "Generate"}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            </svg>
          </button>
        </div>
      </aside>

      <section className="create-v3-board">
        <header className="create-v3-board-topbar">
          <nav className="create-v3-board-tabs">
            <button className="is-active" type="button">Creations</button>
          </nav>
        </header>

        {(generationRuns[0]?.result.result.validation.errors.length ?? 0) > 0 ? (
          <div className="create-v3-status is-danger">{generationRuns[0]?.result.result.validation.errors.join(" ")}</div>
        ) : null}

        {generationRuns.length === 0 && !loading ? (
          <div className="create-v3-board-empty">
            <p>Choose a project, write a brief, and generate options.</p>
          </div>
        ) : null}

        {loading ? (
          <div className="create-v3-generation-grid">
            {Array.from({ length: pendingVariantCount }).map((_, index) => (
              <article className="create-v3-result-card is-loading" key={index}>
                <div className="create-v3-generation-loader" aria-hidden="true">
                  <span className="create-v3-loader-blob b1" />
                  <span className="create-v3-loader-blob b2" />
                  <span className="create-v3-loader-blob b3" />
                </div>
                <strong>{generationStatus || `Option ${index + 1}`}</strong>
              </article>
            ))}
          </div>
        ) : null}

        {generationRuns.map((run, runIndex) => {
          const generationOutputIds = Object.values(run.outputIdsByVariantId).flat().filter(Boolean);
          const generationStripParam = generationOutputIds.length > 0 ? `&stripIds=${encodeURIComponent(generationOutputIds.join(","))}` : "";
          return (
            <section className="create-v3-generation-run" key={run.id}>
              <div className="create-v3-generation-run-header">
                <strong>{runIndex === 0 ? "Latest generation" : `Previous generation ${runIndex}`}</strong>
                <span>{run.result.result.variants.length} option{run.result.result.variants.length === 1 ? "" : "s"}</span>
              </div>
              <div className="create-v3-generation-grid">
                {run.result.result.variants.map((variant, index) => {
                  const render = run.rendersByVariantId[variant.variant_id];
                  const asset = readPrimaryAsset(variant);
                  const selected = runIndex === 0 && selectedVariant?.variant_id === variant.variant_id;
                  const outputId = run.outputIdsByVariantId[variant.variant_id]?.[0] ?? null;
                  return (
                    <article className={`create-v3-result-card ${selected ? "is-selected" : ""}`} key={`${run.id}-${variant.variant_id}`}>
                      <Link
                        className="create-v3-result-preview"
                        href={outputId
                          ? `/studio/outputs/${outputId}?from=create-v3&sessionId=${encodeURIComponent(run.id)}${generationStripParam}`
                          : "#"}
                        onClick={(event) => {
                          if (!outputId) {
                            event.preventDefault();
                            setSelectedVariantId(variant.variant_id);
                          }
                        }}
                      >
                        {render?.images[0]?.url ? (
                          <img alt={`Generated ${variant.variation_label}`} src={render.images[0].url} />
                        ) : (
                          <div className="create-v3-result-placeholder">
                            <span>{run.result.result.format}</span>
                            <strong>{variant.copy?.headline ? String(variant.copy.headline) : variant.variation_label || `Option ${index + 1}`}</strong>
                            <p>{asset?.label ?? "Auto-selected asset"}</p>
                          </div>
                        )}
                      </Link>
                      <div className="create-v3-result-body">
                        <div>
                          <strong>{variant.variation_label || `Option ${index + 1}`}</strong>
                          <span>{asset?.label ?? "No asset"} · {variant.variation_axis}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </section>
      {showReferencePicker ? (
        <div className="create-v3-reference-modal-overlay" role="presentation" onMouseDown={() => setShowReferencePicker(false)}>
          <section
            aria-modal="true"
            className="create-v3-reference-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <aside className="create-v3-reference-modal-sidebar">
              <div className="ref-sidebar-section">
                <span>Layout & Style</span>
                <nav>
                  <button className={refModalKind === "templates" ? "is-active" : ""} onClick={() => setRefModalKind("templates")}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                    Templates
                  </button>
                </nav>
              </div>

              <div className="ref-sidebar-section">
                <span>Reference Images</span>
                <nav>
                  {referenceFilterOptions.map((option) => (
                    <button
                      className={refModalKind === option.value ? "is-active" : ""}
                      key={option.value}
                      onClick={() => setRefModalKind(option.value)}
                      type="button"
                    >
                      <ReferenceFilterIcon kind={option.icon} />
                      {option.label}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>
            
            <main className="create-v3-reference-modal-main">
              <header className="create-v3-reference-modal-top">
                <div className="ref-modal-search">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  <input 
                    type="text" 
                    placeholder={refModalKind === "templates" ? "Search templates" : "Search references"}
                    value={refSearchQuery}
                    onChange={(e) => setRefSearchQuery(e.target.value)}
                  />
                </div>
                
                <div className="ref-modal-project-filter">
                   <CreateV3Dropdown
                    onChange={setRefModalProjectId}
                    options={[
                      { value: "", label: "All projects" },
                      ...projects.map((project) => ({ value: project.id, label: project.name }))
                    ]}
                    value={refModalProjectId}
                  />
                </div>
                
                <button aria-label="Close" className="create-v3-reference-modal-close" onClick={() => setShowReferencePicker(false)} type="button">×</button>
              </header>
              
              <div className="create-v3-reference-modal-content">
                <div className={`create-v3-reference-modal-grid${tempSelectedTemplateId ? " has-preview" : ""}`}>
                  {refModalKind === "templates" ? (
                    filteredTemplates.length > 0 ? filteredTemplates.map((template) => {
                      const templateSummary = summarizeVisualTemplate(template);
                      const isSelected = visualTemplateId === template.template_id;
                      const isTempSelected = tempSelectedTemplateId === template.template_id && !isSelected;
                      return (
                      <button
                        className={`ref-grid-item is-template ${isSelected ? "is-selected" : ""} ${isTempSelected ? "is-temp-selected" : ""}`}
                        key={template.template_id}
                        onClick={() => setTempSelectedTemplateId(template.template_id)}
                        title={`${template.name}\n${templateSummary}`}
                        type="button"
                      >
                        <div className="ref-grid-item-thumb">
                          {template.previewUrl ? (
                            <img src={template.previewUrl} alt={template.name} />
                          ) : (
                            <div className="ref-grid-item-description-card template-card-visual">
                              <span>{templatePickerKicker(template)}</span>
                              <p>{templateSummary}</p>
                            </div>
                          )}
                        </div>
                        <strong>{template.name}</strong>
                      </button>
                      );
                    }) : (
                      <div className="ref-modal-empty">
                        <p>No templates available for this post type.</p>
                      </div>
                    )
                  ) : (
                    filteredReferenceAssets.length > 0 ? filteredReferenceAssets.map((asset) => (
                      (() => {
                        const fallbackDescription = assetPickerDescription(asset);
                        return (
                      <button
                        className={`ref-grid-item ${selectedAssetIds.includes(asset.id) ? "is-selected" : ""}`}
                        key={asset.id}
                        onClick={() => toggleAsset(asset.id)}
                        title={`${asset.label}\n${fallbackDescription}`}
                        type="button"
                      >
                        <div className="ref-grid-item-thumb">
                          {asset.thumbnailUrl || asset.previewUrl ? (
                            <img src={asset.thumbnailUrl ?? asset.previewUrl} alt="" />
                          ) : (
                            <div className="ref-grid-item-description-card">
                              <span>{assetPickerKicker(asset)}</span>
                              <p>{fallbackDescription}</p>
                            </div>
                          )}
                        </div>
                        <strong>{asset.label}</strong>
                      </button>
                        );
                      })()
                    )) : (
                      <div className="ref-modal-empty">
                        <p>No matching references found.</p>
                      </div>
                    )
                  )}
                </div>
                {tempSelectedTemplateId && refModalKind === "templates" ? (
                  <div className="create-v3-template-preview-panel">
                    {(() => {
                      const t = visualTemplates.find(tmpl => tmpl.template_id === tempSelectedTemplateId);
                      if (!t) return null;
                      return (
                        <>
                          <div className="template-preview-image">
                            {t.previewUrl ? (
                              <img src={t.previewUrl} alt={t.name} />
                            ) : (
                              <div className="template-preview-placeholder">
                                <span>{templatePickerKicker(t)}</span>
                                <p>{summarizeVisualTemplate(t)}</p>
                              </div>
                            )}
                          </div>
                          <div className="template-preview-info">
                            <h3>{t.name}</h3>
                            <p>{t.description || summarizeVisualTemplate(t)}</p>
                          </div>
                          <div className="template-preview-actions">
                            <button
                              type="button"
                              className="template-preview-ok"
                              onClick={() => {
                                setVisualTemplateId(tempSelectedTemplateId);
                                setTempSelectedTemplateId(null);
                                setShowReferencePicker(false);
                              }}
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              className="template-preview-cancel"
                              onClick={() => setTempSelectedTemplateId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            </main>
            
          </section>
        </div>
      ) : null}
    </main>
  );
}

function isRenderableImage(asset: BrandAssetRecord) {
  return /\.(png|jpe?g|webp)$/i.test(asset.storagePath);
}

function assetPickerDescription(asset: BrandAssetRecord) {
  const metadata = assetMetadataRecord(asset);
  const explicit = [
    asset.assetDescription,
    metadata.assetDescription,
    metadata.description,
    metadata.notes
  ].find((value) => typeof value === "string" && value.trim().length > 0);
  if (typeof explicit === "string") return clampPickerText(explicit.trim(), 135);

  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).slice(0, 4)
    : [];
  const summaryParts = [
    asset.sceneType,
    asset.visualUse,
    stringMetadata(metadata, "subjectType"),
    stringMetadata(metadata, "viewType"),
    stringMetadata(metadata, "amenityName"),
    stringMetadata(metadata, "qualityTier"),
    tags.length ? tags.join(", ") : null
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return clampPickerText(summaryParts.length ? summaryParts.join(" · ") : asset.label || asset.fileName || "Reference asset", 135);
}

function assetPickerKicker(asset: BrandAssetRecord) {
  const metadata = assetMetadataRecord(asset);
  return clampPickerText(
    asset.sceneType ||
      stringMetadata(metadata, "subjectType") ||
      stringMetadata(metadata, "assetClass") ||
      asset.kind ||
      "Reference",
    28
  );
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function clampPickerText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}…` : normalized;
}

function matchesReferenceCategory(asset: BrandAssetRecord, category: RefModalKind) {
  if (category === "all" || category === "templates") return true;
  const metadata = assetMetadataRecord(asset);
  const structuredTokens = new Set(
    [
      asset.sceneType,
      asset.visualUse,
      stringMetadata(metadata, "subjectType"),
      stringMetadata(metadata, "assetClass"),
      stringMetadata(metadata, "viewType"),
      stringMetadata(metadata, "usageIntent")
    ]
      .map(normalizeReferenceToken)
      .filter((value): value is string => Boolean(value))
  );
  const hasStructuredClassification = structuredTokens.size > 0;

  if (category === "exteriors") {
    if (hasStructuredClassification) {
      return ["project_exterior", "exterior", "facade", "elevation", "aerial", "site", "masterplan"].some((token) => structuredTokens.has(token));
    }
    return /\b(exterior|facade|façade|tower|building|podium|entrance|gate|aerial|masterplan|skyline)\b/.test(searchableText(asset));
  }
  if (category === "interiors") {
    if (hasStructuredClassification) {
      return ["interior", "sample_flat", "sample flat"].some((token) => structuredTokens.has(token));
    }
    return /\b(interior|sample flat|flat|living|bedroom|kitchen|lobby|show apartment|bathroom|washroom)\b/.test(searchableText(asset));
  }
  if (category === "amenities") {
    if (hasStructuredClassification) {
      return ["amenity", "amenity_anchor"].some((token) => structuredTokens.has(token));
    }
    return /\b(amenity|pool|swimming|gym|yoga|court|basketball|cricket|clubhouse|deck|lawn|garden|fitness|play area)\b/.test(searchableText(asset));
  }
  if (category === "location") {
    if (hasStructuredClassification) {
      return ["location", "location_map", "map", "connectivity"].some((token) => structuredTokens.has(token));
    }
    return /\b(location|map|landmark|connectivity|nearby|transport|road|railway|mall|hospital|school|metro)\b/.test(searchableText(asset));
  }
  if (category === "generated") {
    return stringMetadata(metadata, "source") === "generated";
  }
  return true;
}

function assetMetadataRecord(asset: BrandAssetRecord) {
  return asset.metadataJson && typeof asset.metadataJson === "object" && !Array.isArray(asset.metadataJson)
    ? asset.metadataJson as Record<string, unknown>
    : {};
}

function normalizeReferenceToken(value: string | null | undefined) {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/façade/g, "facade")
    .replace(/[\s-]+/g, "_")
    .trim();
}

function searchableText(value: unknown): string {
  const parts: string[] = [];
  collectSearchText(value, parts);
  return parts.join(" ").toLowerCase();
}

function collectSearchText(value: unknown, parts: string[]) {
  if (value === null || value === undefined) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    parts.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchText(item, parts));
    return;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectSearchText(item, parts));
  }
}

function ReferenceFilterIcon({ kind }: { kind: Exclude<RefModalKind, "templates"> }) {
  if (kind === "exteriors") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
        <path d="M9 9h.01" />
        <path d="M15 9h.01" />
      </svg>
    );
  }
  if (kind === "interiors") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <path d="M5 21V9l7-6 7 6v12" />
        <path d="M9 21v-7h6v7" />
      </svg>
    );
  }
  if (kind === "amenities") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12h20" />
        <path d="M6 12c0-2.5 2-4 6-4s6 1.5 6 4" />
        <path d="M4 16c2 1.3 4 1.3 6 0s4-1.3 6 0 4 1.3 6 0" />
      </svg>
    );
  }
  if (kind === "location") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 4.5-8 12-8 12S4 14.5 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    );
  }
  if (kind === "generated") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        <path d="M22 10V3l-3 3" />
        <path d="m16.5 3.5 2.5 2.5" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function readPrimaryAsset(variant: V3Variant) {
  const asset = variant.selected_assets[0];
  if (!asset) return null;
  return {
    label: typeof asset.label === "string" ? asset.label : null,
    assetId: typeof asset.asset_id === "string" ? asset.asset_id : null
  };
}

function CreateV3Dropdown({
  options,
  value,
  onChange
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className={`create-v3-custom-select ${open ? "is-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        aria-expanded={open}
        className="create-v3-custom-select-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>{selected?.label ?? "Select"}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="create-v3-custom-select-menu" role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              key={option.value || option.label}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
              {option.value === value ? (
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m20 6-11 11-5-5" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CreateV3SizeDropdown({
  options,
  value,
  onChange
}: {
  options: Array<{ value: string; label: string; name: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className={`create-v3-size-select ${open ? "is-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        aria-expanded={open}
        className="create-v3-ratio-btn"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <RatioIcon ratio={selected?.label ?? "4:5"} />
        <span>{selected?.label ?? "4:5"}</span>
      </button>
      {open ? (
        <div className="create-v3-size-menu" role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <RatioIcon ratio={option.label} />
              <strong>{option.label}</strong>
              <span>{option.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RatioIcon({ ratio }: { ratio: string }) {
  const vertical = ratio === "9:16" || ratio === "4:5";
  const wide = ratio === "16:9";
  return (
    <i
      aria-hidden="true"
      className={`create-v3-ratio-icon ${vertical ? "is-vertical" : ""} ${wide ? "is-wide" : ""}`}
    />
  );
}

function summarizePreset(preset: CreativeV3BrandPreset) {
  const json = preset.preset_json as Record<string, any>;
  const parts: string[] = [];
  const primaryLogo = json.logo?.required || json.logo_layer?.required
    ? (json.logo ?? json.logo_layer)
    : null;
  const additionalLogos = collectPresetAdditionalLogos(json);
  const requiredAdditionalLogos = additionalLogos.filter((item) => item.required || item.include_if_available || item.asset_id);
  if (primaryLogo || requiredAdditionalLogos.length > 0) {
    const logoCount = (primaryLogo ? 1 : 0) + requiredAdditionalLogos.length;
    const positions = [
      primaryLogo?.position,
      ...requiredAdditionalLogos.map((item) => item.position)
    ].filter(Boolean).map(formatPresetPosition);
    parts.push(logoCount > 1 ? `${logoCount} logos ${positions.slice(0, 3).join(", ")}` : `Logo ${positions[0] ?? ""}`.trim());
  }
  if (json.rera_qr?.required || json.rera_qr_layer?.required) {
    parts.push(`RERA ${formatPresetPosition(json.rera_qr?.position ?? json.rera_qr_layer?.position)}`);
  }
  if (Array.isArray(json.contact?.items) && json.contact.items.length > 0) {
    parts.push(`Contact ${formatPresetPosition(json.contact?.position)}`);
  }
  if (json.location?.required || json.location_layer?.required) {
    parts.push(`Location ${formatPresetPosition(json.location?.position ?? json.location_layer?.position)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : preset.description ?? "Brand rule preset";
}

function collectPresetAdditionalLogos(json: Record<string, any>) {
  const secondaryLogo = json.secondary_logo ?? json.secondary_logo_layer;
  const logos = secondaryLogo && typeof secondaryLogo === "object" && !Array.isArray(secondaryLogo)
    ? [secondaryLogo]
    : [];
  for (const key of ["additional_logos", "additional_logo_layers", "logo_layers"]) {
    const value = json[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const role = String(item.role ?? item.slot ?? item.kind ?? "").trim().toLowerCase();
      if (["primary", "primary_logo", "main_logo", "logo"].includes(role) || item.primary === true) continue;
      logos.push(item);
    }
  }
  return logos;
}

function summarizeVisualTemplate(template: CreativeV3VisualTemplate | null) {
  if (!template) return "Template style";
  const levers = template.lever_signature as Record<string, any>;
  const parts = [
    template.description,
    typeof levers.style_family === "string" ? formatPresetPosition(levers.style_family) : null,
    typeof levers.layout_geometry === "string" ? formatPresetPosition(levers.layout_geometry) : null
  ].filter(Boolean);
  return parts.join(" · ") || "Template style";
}

function templatePickerKicker(template: CreativeV3VisualTemplate) {
  const formatLabel = template.formats?.[0] ? formatPresetPosition(template.formats[0]) : "Template";
  const jobLabel = template.content_job_id ? formatPresetPosition(template.content_job_id) : "Layout";
  return clampPickerText(`${jobLabel} · ${formatLabel}`, 32);
}

function buildCreativeModeOptions({
  hasTemplate,
  hasReference,
  postTypeCode
}: {
  hasTemplate: boolean;
  hasReference: boolean;
  postTypeCode: string | null;
}): Array<{ value: CreativeMode; label: string }> {
  const preferred = new Set<CreativeMode>(["auto"]);
  if (hasTemplate) preferred.add("template_led");
  if (hasReference) preferred.add("asset_led");
  if (postTypeCode === "ad" || postTypeCode === "offer") preferred.add("offer_led");
  if (postTypeCode === "location-advantage" || postTypeCode === "construction-update") preferred.add("proof_led");
  if (postTypeCode === "amenity-spotlight") preferred.add("lifestyle_led");
  if (postTypeCode === "festive-greeting") preferred.add("brand_led");
  preferred.add("image_led");
  preferred.add("copy_led");
  preferred.add("graphic_led");

  const byValue = new Map(creativeModeHelp.map((item) => [item.value, item.label]));
  return [...preferred].map((value) => ({
    value,
    label: value === "auto" ? autoCreativeModeLabel({ hasTemplate, hasReference, postTypeCode }) : byValue.get(value) ?? value
  }));
}

function autoCreativeModeLabel({
  hasTemplate,
  hasReference,
  postTypeCode
}: {
  hasTemplate: boolean;
  hasReference: boolean;
  postTypeCode: string | null;
}) {
  const signals = [
    hasTemplate ? "template" : null,
    hasReference ? "reference" : null,
    postTypeCode === "ad" || postTypeCode === "offer" ? "offer" : null,
    postTypeCode === "location-advantage" || postTypeCode === "construction-update" ? "proof" : null,
    postTypeCode === "amenity-spotlight" ? "lifestyle" : null,
    postTypeCode === "festive-greeting" ? "brand" : null
  ].filter(Boolean);
  return signals.length > 0 ? `Auto (${signals.join(" + ")})` : "Auto";
}

function CreativeModeHelpTooltip() {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function computePosition() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = 300;
    const panelMaxHeight = 380;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const top = spaceBelow >= panelMaxHeight
      ? rect.bottom + 8
      : Math.max(12, rect.top - panelMaxHeight - 8);
    // Prefer opening to the right of the button, but clamp to viewport
    const leftIdeal = rect.left;
    const left = Math.min(leftIdeal, window.innerWidth - panelWidth - 12);
    setPanelStyle({
      position: "fixed",
      top,
      left: Math.max(12, left),
      width: panelWidth,
      maxHeight: panelMaxHeight
    });
  }

  function handleOpen(next: boolean) {
    if (next) computePosition();
    setOpen(next);
  }

  return (
    <div
      className={`create-v3-help-tooltip ${open ? "is-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        aria-expanded={open}
        aria-label="Explain creative direction"
        onClick={() => handleOpen(!open)}
        ref={triggerRef}
        type="button"
      >
        ?
      </button>
      {open ? (
      <div
        className="create-v3-help-tooltip-panel"
        role="tooltip"
        style={panelStyle}
      >
        {creativeModeHelp.map((item) => (
          <div className="create-v3-help-tooltip-row" key={item.value}>
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </div>
        ))}
      </div>
      ) : null}
    </div>
  );
}

function formatPresetPosition(value: unknown) {
  return String(value ?? "default").replaceAll("_", " ");
}

function defaultBriefForPostType(postTypeCode?: string | null, festival?: FestivalRecord | null) {
  if (postTypeCode === "festive-greeting" && festival) {
    return `Create a premium ${festival.name} greeting that feels respectful, elegant, occasion-led, and brand-safe.`;
  }
  return createV3DefaultBriefs[postTypeCode ?? ""] ?? "Create a premium real-estate launch post with a strong architectural visual and restrained copy.";
}

function isReplaceableBrief(value: string) {
  if (!value) return true;
  if (defaultBriefValues.has(value)) return true;
  return /^create a premium .+ greeting that feels respectful, elegant, (?:occasion-led, )?and brand-safe\.$/i.test(value);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function pollGenerationJob(
  token: string,
  jobId: string,
  onStatus?: (message: string) => void
): Promise<CreativeV3GenerateAsyncStatus> {
  const startedAt = Date.now();
  let transientFailures = 0;

  while (Date.now() - startedAt < V3_GENERATION_TIMEOUT_MS) {
    await wait(V3_GENERATION_POLL_INTERVAL_MS);

    let status: CreativeV3GenerateAsyncStatus;
    try {
      status = await getCreativeV3AsyncStatus(token, jobId);
      transientFailures = 0;
    } catch (error) {
      transientFailures += 1;
      if (transientFailures >= 3) {
        throw error;
      }
      onStatus?.("Still generating...");
      continue;
    }

    if (status.status === "completed") {
      if (!status.result?.compile) {
        throw new Error("Creative V3 job completed without compile output.");
      }
      return status;
    }

    if (status.status === "failed") {
      const error = status.error as { message?: string } | undefined;
      throw new Error(error?.message ?? "Creative V3 generation failed.");
    }

    onStatus?.(status.status === "processing" ? "Generating images..." : "Queued...");
  }

  throw new Error("Creative V3 generation is taking longer than expected. Please try again shortly.");
}
