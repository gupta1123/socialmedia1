"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import type {
  AssetKind,
  BootstrapResponse,
  BrandProfile,
  CreativeBrief,
  FeedbackResult,
  OutputVerdict,
  PromptPackage
} from "@image-lab/contracts";
import {
  type BootstrapMode,
  bootstrapSession,
  compileCreative,
  compileCreativeV2,
  createBrand,
  creativeFlowVersion,
  defaultStyleVariationCount,
  generateFinals,
  generateStyleSeeds,
  generateStyleSeedsV2,
  styleVariationLimit,
  getCreativeJob,
  submitFeedback,
  uploadBrandAsset
} from "../../lib/api";
import { supabase } from "../../lib/supabase-browser";

const defaultProfile: BrandProfile = {
  identity: {
    positioning: "Premium real-estate brand with trust-led, design-conscious positioning.",
    promise: "Calm, credible communication that turns aspiration into long-term confidence.",
    audienceSummary: "Discerning homebuyers and investors seeking premium urban living."
  },
  voice: {
    summary: "Premium, trustworthy, aspirational",
    adjectives: ["premium", "aspirational", "credible"],
    approvedVocabulary: ["architectural", "crafted", "premium", "credible"],
    bannedPhrases: ["cheap deal", "flash sale", "disruptive"]
  },
  palette: {
    primary: "#1f2430",
    secondary: "#f4efe7",
    accent: "#caa56a",
    neutrals: ["#d7cfc1", "#9e968b"]
  },
  styleDescriptors: ["architectural", "sunlit", "luxury", "spatial"],
  visualSystem: {
    typographyMood: "Editorial serif-sans contrast with disciplined hierarchy.",
    compositionPrinciples: ["Preserve generous margins", "Let architecture or hero imagery carry the frame"],
    imageTreatment: ["Warm natural light", "Premium realism", "Avoid oversaturated contrast"],
    textDensity: "balanced",
    realismLevel: "elevated_real"
  },
  doRules: ["Highlight architecture and space", "Use clean premium compositions", "Leave safe zones for overlay copy"],
  dontRules: ["No cartoonish icons", "No startup-dashboard aesthetics"],
  bannedPatterns: ["tech gradients", "generic SaaS mockups", "flashy neon effects"],
  compliance: {
    bannedClaims: ["guaranteed returns", "assured appreciation"],
    reviewChecks: ["Verify claims against approved project facts", "Check tone stays premium and non-pushy"]
  },
  referenceAssetIds: [],
  referenceCanon: {
    antiReferenceNotes: ["Avoid cheap brochure clutter", "Avoid startup SaaS visual language"],
    usageNotes: ["Prefer approved brand references before generic inspiration"]
  }
};

type BrandFormState = {
  name: string;
  description: string;
  positioning: string;
  promise: string;
  audienceSummary: string;
  voiceSummary: string;
  adjectives: string;
  approvedVocabulary: string;
  bannedPhrases: string;
  styleDescriptors: string;
  doRules: string;
  dontRules: string;
  bannedPatterns: string;
  primary: string;
  secondary: string;
  accent: string;
};

type BriefFormState = Omit<CreativeBrief, "brandId" | "referenceAssetIds"> & {
  selectedReferenceAssetIds: string[];
};
type PendingAction =
  | "create-brand"
  | "upload-reference"
  | "compile-prompt"
  | "generate-seeds"
  | "generate-finals"
  | "submit-feedback"
  | null;

type StudioContextValue = {
  loading: boolean;
  sessionToken: string | null;
  bootstrap: BootstrapResponse | null;
  activeBrandId: string | null;
  activeBrand:
    | (BootstrapResponse["brands"][number] & {
        description: string | null;
      })
    | null;
  activeAssets: BootstrapResponse["brandAssets"];
  activeTemplates: BootstrapResponse["styleTemplates"];
  recentOutputs: BootstrapResponse["recentOutputs"];
  recentJobs: BootstrapResponse["recentJobs"];
  userEmail: string | null;
  darkMode: boolean;
  toggleDarkMode: () => void;
  promptPackage: PromptPackage | null;
  message: string | null;
  pendingAction: PendingAction;
  pendingTargetKey: string | null;
  isPending: boolean;
  hasRunningJobs: boolean;
  creativeFlowVersion: "v1" | "v2";
  styleVariationCount: number;
  styleVariationLimit: number;
  brandForm: BrandFormState;
  briefForm: BriefFormState;
  setMessage: (value: string | null) => void;
  setActiveBrandId: (value: string) => void;
  setBrandForm: React.Dispatch<React.SetStateAction<BrandFormState>>;
  setBriefForm: React.Dispatch<React.SetStateAction<BriefFormState>>;
  setStyleVariationCount: (value: number) => void;
  resetCreateFlow: (overrides?: Partial<BriefFormState>) => void;
  refresh: (preferredBrandId?: string) => Promise<void>;
  createBrandRecord: () => Promise<boolean>;
  uploadReference: (file: File, label: string) => Promise<boolean>;
  uploadBrandAssetFile: (file: File, label: string, kind: AssetKind) => Promise<boolean>;
  compilePromptPackage: (options?: { silentSuccess?: boolean }) => Promise<PromptPackage | null>;
  generateSeeds: () => Promise<void>;
  generateSeedsForPackage: (promptPackageId: string, promptPackageOverride?: PromptPackage) => Promise<boolean>;
  generateFinalImages: (selectedTemplateId?: string) => Promise<void>;
  generateFinalImagesForPackage: (promptPackageId: string, selectedTemplateId?: string) => Promise<boolean>;
  leaveFeedback: (outputId: string, verdict: OutputVerdict) => Promise<FeedbackResult | null>;
  signOut: () => Promise<void>;
};

const defaultBrandForm: BrandFormState = {
  name: "",
  description: "",
  positioning: defaultProfile.identity.positioning,
  promise: defaultProfile.identity.promise,
  audienceSummary: defaultProfile.identity.audienceSummary,
  voiceSummary: defaultProfile.voice.summary,
  adjectives: defaultProfile.voice.adjectives.join(", "),
  approvedVocabulary: defaultProfile.voice.approvedVocabulary.join(", "),
  bannedPhrases: defaultProfile.voice.bannedPhrases.join(", "),
  styleDescriptors: defaultProfile.styleDescriptors.join(", "),
  doRules: defaultProfile.doRules.join(", "),
  dontRules: defaultProfile.dontRules.join(", "),
  bannedPatterns: defaultProfile.bannedPatterns.join(", "),
  primary: defaultProfile.palette.primary,
  secondary: defaultProfile.palette.secondary,
  accent: defaultProfile.palette.accent
};

const defaultBriefForm: BriefFormState = {
  createMode: "post",
  channel: "instagram-feed",
  format: "square",
  seriesOutputKind: "single_image",
  slideCount: 5,
  goal: "Drive enquiries for a premium residential project",
  prompt: "Create a premium real-estate post with a clear visual angle and restrained copy.",
  audience: "Homebuyers and investors",
  offer: "",
  exactText: "",
  includeBrandLogo: false,
  includeReraQr: false,
  templateType: "announcement",
  selectedReferenceAssetIds: []
};

const BOOTSTRAP_CACHE_KEY_PREFIX = "studio-bootstrap-cache";

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({
  children,
  bootstrapMode = "full"
}: {
  children: React.ReactNode;
  bootstrapMode?: BootstrapMode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [activeBrandId, setActiveBrandIdState] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [promptPackage, setPromptPackage] = useState<PromptPackage | null>(null);
  const [styleVariationCount, setStyleVariationCountState] = useState(defaultStyleVariationCount);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingTargetKey, setPendingTargetKey] = useState<string | null>(null);
  const [brandForm, setBrandForm] = useState<BrandFormState>(defaultBrandForm);
  const [briefForm, setBriefForm] = useState<BriefFormState>(defaultBriefForm);
  const isPending = pendingAction !== null;

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession(accessToken: string, email?: string | null) {
      if (cancelled) {
        return;
      }

      setSessionToken(accessToken);
      setUserEmail(email ?? null);

      const storedBrandId = window.localStorage.getItem("activeBrandId");
      const payload = await bootstrapSession(
        accessToken,
        bootstrapMode,
        bootstrapMode === "full" || bootstrapMode === "create" ? storedBrandId ?? undefined : undefined
      );

      if (cancelled) {
        return;
      }

      setBootstrap(payload);
      writeBootstrapCache(bootstrapMode, payload);
      setActiveBrandIdState((current) => current ?? storedBrandId ?? payload.brands[0]?.id ?? null);
    }

    const load = async () => {
      const cachedBootstrap = readBootstrapCache(bootstrapMode);
      const storedBrandId = window.localStorage.getItem("activeBrandId");

      if (cachedBootstrap) {
        setBootstrap(cachedBootstrap);
        setActiveBrandIdState((current) => current ?? storedBrandId ?? cachedBootstrap.brands[0]?.id ?? null);
        setLoading(false);
      }

      const { data } = await supabase.auth.getSession();

      if (!data.session?.access_token) {
        clearBootstrapCache();
        router.push("/login");
        return;
      }

      await hydrateSession(data.session.access_token, data.session.user.email ?? null);
    };

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.access_token) {
        clearBootstrapCache();
        setSessionToken(null);
        setBootstrap(null);
        setActiveBrandIdState(null);
        setUserEmail(null);
        router.push("/login");
        return;
      }

      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        void hydrateSession(session.access_token, session.user.email ?? null).catch((error) => {
          setMessage(error instanceof Error ? error.message : "Failed to refresh workspace session");
        });
      }
    });

    // Initialize dark mode from localStorage or system preference
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setDarkMode(isDark);
    if (isDark) document.documentElement.classList.add("dark");

    void load()
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Failed to load workspace");
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [bootstrapMode, router]);

  const activeBrand = useMemo(
    () => bootstrap?.brands.find((brand) => brand.id === activeBrandId) ?? null,
    [bootstrap, activeBrandId]
  );

  const activeAssets = useMemo(
    () => bootstrap?.brandAssets.filter((asset) => asset.brandId === activeBrandId) ?? [],
    [bootstrap, activeBrandId]
  );

  const activeTemplates = useMemo(
    () => bootstrap?.styleTemplates.filter((template) => template.brandId === activeBrandId) ?? [],
    [bootstrap, activeBrandId]
  );

  const recentOutputs = useMemo(
    () => bootstrap?.recentOutputs.filter((output) => output.brandId === activeBrandId) ?? [],
    [bootstrap, activeBrandId]
  );

  const recentJobs = useMemo(
    () => bootstrap?.recentJobs.filter((job) => job.brandId === activeBrandId) ?? [],
    [bootstrap, activeBrandId]
  );

  const hasRunningJobs = useMemo(
    () => recentJobs.some((job) => job.status === "queued" || job.status === "processing"),
    [recentJobs]
  );

  useEffect(() => {
    if (pathname.startsWith("/studio/create") || pathname.startsWith("/studio/runs/")) {
      return;
    }

    if (!sessionToken || recentJobs.length === 0) {
      return;
    }

    const activeJobIds = recentJobs
      .filter((job) => job.status === "queued" || job.status === "processing")
      .map((job) => job.id);

    if (activeJobIds.length === 0) {
      return;
    }

    let cancelled = false;

    const reconcileJobs = async () => {
      try {
        const jobs = await Promise.all(
          activeJobIds.map((jobId) =>
            getCreativeJob(sessionToken, jobId).catch(() => null)
          )
        );

        if (cancelled) {
          return;
        }

        const shouldRefresh = jobs.some((job) => {
          const record = job as
            | { status?: string; outputs?: Array<unknown> }
            | null;

          return (
            record?.status === "completed" ||
            record?.status === "failed" ||
            (record?.outputs?.length ?? 0) > 0
          );
        });

        if (shouldRefresh) {
          const payload = await bootstrapSession(
            sessionToken,
            bootstrapMode,
            bootstrapMode === "full" ? activeBrandId ?? undefined : undefined
          );
          if (cancelled) {
            return;
          }

          setBootstrap(payload);
          setActiveBrandIdState((current) => current ?? payload.brands[0]?.id ?? null);
        }
      } catch {
        // Background reconciliation should not interrupt the UI.
      }
    };

    void reconcileJobs();

    const interval = window.setInterval(() => {
      void reconcileJobs();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeBrandId, bootstrapMode, pathname, recentJobs, sessionToken]);

  useEffect(() => {
    setBriefForm((state) => {
      const validAssetIds = state.selectedReferenceAssetIds.filter((assetId) =>
        activeAssets.some((asset) => asset.id === assetId)
      );
      const hasBrandLogo = activeAssets.some((asset) => asset.kind === "logo");
      const hasReraQr = activeAssets.some((asset) => asset.kind === "rera_qr");

      if (activeAssets.length === 0) {
        return {
          ...state,
          selectedReferenceAssetIds: [],
          includeBrandLogo: false,
          includeReraQr: false
        };
      }

      if (
        validAssetIds.length !== state.selectedReferenceAssetIds.length ||
        (!hasBrandLogo && state.includeBrandLogo) ||
        (!hasReraQr && state.includeReraQr)
      ) {
        return {
          ...state,
          selectedReferenceAssetIds: validAssetIds,
          includeBrandLogo: hasBrandLogo ? state.includeBrandLogo : false,
          includeReraQr: hasReraQr ? state.includeReraQr : false
        };
      }

      return state;
    });
  }, [activeAssets]);

  const refresh = useCallback(async (preferredBrandId?: string) => {
    if (!sessionToken) return;
    const scopedBrandId = preferredBrandId ?? activeBrandId ?? undefined;
    const payload = await bootstrapSession(
      sessionToken,
      bootstrapMode,
      bootstrapMode === "full" || bootstrapMode === "create" ? scopedBrandId : undefined
    );
    setBootstrap(payload);
    writeBootstrapCache(bootstrapMode, payload);
    setActiveBrandIdState(preferredBrandId ?? activeBrandId ?? payload.brands[0]?.id ?? null);
  }, [activeBrandId, bootstrapMode, sessionToken]);

  function setActiveBrandId(value: string) {
    localStorage.setItem("activeBrandId", value);
    setActiveBrandIdState(value);
    setPromptPackage(null);
    setBriefForm((state) => ({
      ...state,
      createMode: "post",
      deliverableId: undefined,
      campaignId: undefined,
      campaignPlanId: undefined,
      seriesId: undefined,
      festivalId: undefined,
      sourceOutputId: undefined,
      projectId: undefined,
      postTypeId: undefined,
      creativeTemplateId: undefined,
      calendarItemId: undefined,
      includeBrandLogo: false,
      includeReraQr: false,
      selectedReferenceAssetIds: []
    }));

    if (sessionToken && (bootstrapMode === "full" || bootstrapMode === "create")) {
      void refresh(value).catch(() => null);
    }
  }

  const resetCreateFlow = useCallback((overrides?: Partial<BriefFormState>) => {
    setPromptPackage(null);
    setBriefForm({
      ...defaultBriefForm,
      ...(overrides ?? {})
    });
  }, []);

  function setStyleVariationCount(value: number) {
    if (!Number.isFinite(value)) return;
    setStyleVariationCountState(Math.min(styleVariationLimit, Math.max(1, Math.trunc(value))));
  }

  function toggleDarkMode() {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("theme", next ? "dark" : "light");
      if (next) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  }

  async function createBrandRecord() {
    if (!sessionToken || !bootstrap?.workspace) {
      return false;
    }

    setPendingAction("create-brand");
    setPendingTargetKey("brand-form");

    try {
      setMessage(null);
      const created = await createBrand(sessionToken, {
        workspaceId: bootstrap.workspace?.id,
        name: brandForm.name,
        description: brandForm.description,
        profile: {
          identity: {
            positioning: brandForm.positioning,
            promise: brandForm.promise,
            audienceSummary: brandForm.audienceSummary
          },
          voice: {
            summary: brandForm.voiceSummary,
            adjectives: splitList(brandForm.adjectives),
            approvedVocabulary: splitList(brandForm.approvedVocabulary),
            bannedPhrases: splitList(brandForm.bannedPhrases)
          },
          palette: {
            primary: brandForm.primary,
            secondary: brandForm.secondary,
            accent: brandForm.accent,
            neutrals: []
          },
          styleDescriptors: splitList(brandForm.styleDescriptors),
          visualSystem: defaultProfile.visualSystem,
          doRules: splitList(brandForm.doRules),
          dontRules: splitList(brandForm.dontRules),
          bannedPatterns: splitList(brandForm.bannedPatterns),
          compliance: defaultProfile.compliance,
          referenceAssetIds: [],
          referenceCanon: defaultProfile.referenceCanon
        }
      });
      await refresh(created.id);
      setBrandForm(defaultBrandForm);
      setMessage("Brand created.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create brand");
      return false;
    } finally {
      setPendingAction(null);
      setPendingTargetKey(null);
    }
  }

  async function uploadReference(file: File, label: string) {
    return uploadBrandAssetFile(file, label, "reference");
  }

  async function uploadBrandAssetFile(file: File, label: string, kind: AssetKind) {
    if (!sessionToken || !activeBrandId) {
      return false;
    }

    setPendingAction("upload-reference");
    setPendingTargetKey("asset-upload");

    try {
      await uploadBrandAsset(sessionToken, activeBrandId, {
        file,
        kind,
        label
      });
      await refresh(activeBrandId);
      setMessage("Asset uploaded.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Asset upload failed");
      return false;
    } finally {
      setPendingAction(null);
      setPendingTargetKey(null);
    }
  }

  async function compilePromptPackage(options?: { silentSuccess?: boolean }) {
    if (!sessionToken || !activeBrandId) return null;

    setPendingAction("compile-prompt");
    setPendingTargetKey("brief-compile");

    try {
      const basePayload = {
        ...briefForm,
        brandId: activeBrandId,
        referenceAssetIds: briefForm.selectedReferenceAssetIds
      };
      const payload =
        creativeFlowVersion === "v2"
          ? await compileCreativeV2(sessionToken, {
              ...basePayload,
              variationCount: styleVariationCount
            })
          : await compileCreative(sessionToken, basePayload);
      setPromptPackage(payload);
      if (!options?.silentSuccess) {
        setMessage("Prompt package compiled.");
      }
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prompt compilation failed");
      return null;
    } finally {
      setPendingAction(null);
      setPendingTargetKey(null);
    }
  }

  async function generateSeeds() {
    if (!promptPackage) return;
    await generateSeedsForPackage(promptPackage.id, promptPackage);
  }

  async function generateSeedsForPackage(promptPackageId: string, promptPackageOverride?: PromptPackage) {
    if (!sessionToken) {
      return false;
    }

    setPendingAction("generate-seeds");
    setPendingTargetKey(`promptPackage:${promptPackageId}:seeds`);

    try {
      const activePromptPackage =
        promptPackageOverride?.id === promptPackageId
          ? promptPackageOverride
          : promptPackage?.id === promptPackageId
            ? promptPackage
            : null;
      if (creativeFlowVersion === "v2" && activePromptPackage) {
        await generateStyleSeedsV2(sessionToken, {
          promptPackage: activePromptPackage,
          variationCount: styleVariationCount
        });
        setPromptPackage((current) =>
          current?.id === promptPackageId
            ? {
                ...current,
                compilerTrace: {
                  ...current.compilerTrace,
                  persisted: true,
                  v2PostOptionGeneration: true
                }
              }
            : current
        );
      } else {
        await generateStyleSeeds(sessionToken, {
          promptPackageId,
          count: Math.min(styleVariationCount, 4)
        });
      }
      setMessage(
        creativeFlowVersion === "v2"
          ? "Generating post options. Results will appear here automatically."
          : "Generating style directions. Results will appear here automatically."
      );

      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Seed generation failed");
      return false;
    } finally {
      setPendingAction(null);
      setPendingTargetKey(null);
    }
  }

  async function generateFinalImages(selectedTemplateId?: string) {
    if (!promptPackage) return;
    await generateFinalImagesForPackage(promptPackage.id, selectedTemplateId);
  }

  async function generateFinalImagesForPackage(promptPackageId: string, selectedTemplateId?: string) {
    if (!sessionToken) {
      return false;
    }

    setPendingAction("generate-finals");
    setPendingTargetKey(
      selectedTemplateId
        ? `template:${selectedTemplateId}:finals`
        : `promptPackage:${promptPackageId}:references`
    );

    try {
      await generateFinals(sessionToken, {
        promptPackageId,
        selectedTemplateId,
        count: 2
      });
      setMessage("Creating options. Results will appear here automatically.");

      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Final generation failed");
      return false;
    } finally {
      setPendingAction(null);
      setPendingTargetKey(null);
    }
  }

  async function leaveFeedback(outputId: string, verdict: OutputVerdict) {
    if (!sessionToken) {
      return null;
    }

    setPendingAction("submit-feedback");
    setPendingTargetKey(`output:${outputId}:feedback:${verdict}`);

    try {
      const result = await submitFeedback(sessionToken, outputId, {
        verdict,
        reason:
          verdict === "approved"
            ? "Strong fit for the brand."
            : verdict === "off-brand"
              ? "Rejected as not aligned with the brand."
              : "Needs more refinement."
      });
      await refresh(activeBrandId ?? undefined);
      setMessage(
        verdict === "approved"
          ? "Approved. You can open the post task or schedule it next."
          : verdict === "off-brand"
            ? "Rejected. The post task is now blocked until a stronger option is created."
          : `Feedback saved: ${verdict}.`
      );
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feedback failed");
      return null;
    } finally {
      setPendingAction(null);
      setPendingTargetKey(null);
    }
  }

  async function signOut() {
    clearBootstrapCache();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <StudioContext.Provider
      value={{
        loading,
        sessionToken,
        bootstrap,
        activeBrandId,
        activeBrand,
        activeAssets,
        activeTemplates,
        recentOutputs,
        recentJobs,
        userEmail,
        darkMode,
        toggleDarkMode,
        promptPackage,
        message,
        pendingAction,
        pendingTargetKey,
        isPending,
        hasRunningJobs,
        creativeFlowVersion,
        styleVariationCount,
        styleVariationLimit,
        brandForm,
        briefForm,
        setMessage,
        setActiveBrandId,
        setBrandForm,
        setBriefForm,
        setStyleVariationCount,
        resetCreateFlow,
        refresh,
        createBrandRecord,
        uploadReference,
        uploadBrandAssetFile,
        compilePromptPackage,
        generateSeeds,
        generateSeedsForPackage,
        generateFinalImages,
        generateFinalImagesForPackage,
        leaveFeedback,
        signOut
      }}
    >
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) {
    throw new Error("useStudio must be used within StudioProvider");
  }

  return context;
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readBootstrapCache(mode: BootstrapMode): BootstrapResponse | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(`${BOOTSTRAP_CACHE_KEY_PREFIX}:${mode}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as BootstrapResponse;
    if (!parsed || !parsed.workspace || !Array.isArray(parsed.brands)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeBootstrapCache(mode: BootstrapMode, payload: BootstrapResponse) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(`${BOOTSTRAP_CACHE_KEY_PREFIX}:${mode}`, JSON.stringify(payload));
  } catch {
    // Ignore storage pressure or browser privacy restrictions.
  }
}

function clearBootstrapCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(`${BOOTSTRAP_CACHE_KEY_PREFIX}:full`);
    window.sessionStorage.removeItem(`${BOOTSTRAP_CACHE_KEY_PREFIX}:light`);
  } catch {
    // Ignore storage errors during sign out.
  }
}
