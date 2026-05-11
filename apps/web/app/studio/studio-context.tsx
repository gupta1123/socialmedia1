"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import type {
  AssetKind,
  BrandAssetRecord,
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
  createBrand,
  creativeFlowVersion,
  defaultStyleVariationCount,
  styleVariationLimit,
  getCreativeJob,
  isUnauthorizedApiError,
  isWorkspaceAccessApiError,
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
    headlineFontFamily: "",
    bodyFontFamily: "",
    typographyNotes: [],
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
  typographyMood: string;
  headlineFontFamily: string;
  bodyFontFamily: string;
  typographyNotes: string;
  primary: string;
  secondary: string;
  accent: string;
};

type BriefFormState = Omit<CreativeBrief, "brandId" | "referenceAssetIds"> & {
  copyMode: "manual" | "auto";
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
type StudioMessageState = {
  id: number;
  text: string;
};

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
  workspaceMembers: BootstrapResponse["workspaceMembers"];
  userEmail: string | null;
  darkMode: boolean;
  toggleDarkMode: () => void;
  promptPackage: PromptPackage | null;
  message: string | null;
  pendingAction: PendingAction;
  pendingTargetKey: string | null;
  isPending: boolean;
  hasRunningJobs: boolean;
  creativeFlowVersion: "v2";
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
  uploadBrandAssetFile: (
    file: File,
    label: string,
    kind: AssetKind,
    projectId?: string | null,
    options?: { reraNumber?: string }
  ) => Promise<boolean>;
  leaveFeedback: (outputId: string, verdict: OutputVerdict, comment?: string) => Promise<FeedbackResult | null>;
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
  typographyMood: defaultProfile.visualSystem.typographyMood,
  headlineFontFamily: defaultProfile.visualSystem.headlineFontFamily,
  bodyFontFamily: defaultProfile.visualSystem.bodyFontFamily,
  typographyNotes: defaultProfile.visualSystem.typographyNotes.join("\n"),
  primary: defaultProfile.palette.primary,
  secondary: defaultProfile.palette.secondary,
  accent: defaultProfile.palette.accent
};

const defaultBriefForm: BriefFormState = {
  createMode: "post",
  channel: "instagram-feed",
  format: "portrait",
  seriesOutputKind: "single_image",
  slideCount: 5,
  goal: "Drive enquiries for a premium residential project",
  prompt: "Create a premium real-estate post with a clear visual angle and restrained copy.",
  audience: "Homebuyers and investors",
  copyMode: "auto",
  copyLanguage: "en",
  offer: "",
  exactText: "",
  includeBrandLogo: false,
  includeReraQr: false,
  logoAssetId: null,
  templateType: "announcement",
  selectedReferenceAssetIds: []
};

const BOOTSTRAP_CACHE_KEY_PREFIX = "studio-bootstrap-cache";

function resolveActiveBrandId(
  brands: BootstrapResponse["brands"],
  preferredBrandId?: string | null,
  storedBrandId?: string | null
) {
  const candidate = preferredBrandId ?? storedBrandId ?? null;
  if (candidate && brands.some((brand) => brand.id === candidate)) {
    return candidate;
  }
  return brands[0]?.id ?? null;
}

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
  const [messageState, setMessageState] = useState<StudioMessageState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingTargetKey, setPendingTargetKey] = useState<string | null>(null);
  const [brandForm, setBrandForm] = useState<BrandFormState>(defaultBrandForm);
  const [briefForm, setBriefForm] = useState<BriefFormState>(defaultBriefForm);
  const messageSequenceRef = useRef(0);
  const isPending = pendingAction !== null;
  const message = messageState?.text ?? null;

  const setMessage = useCallback((value: string | null) => {
    if (value === null) {
      setMessageState(null);
      return;
    }

    messageSequenceRef.current += 1;
    setMessageState({
      id: messageSequenceRef.current,
      text: value
    });
  }, []);

  const redirectToLoginForInvalidSession = useCallback(async () => {
    const nextPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/studio";
    const loginPath =
      nextPath && !nextPath.startsWith("/login")
        ? `/login?next=${encodeURIComponent(nextPath)}`
        : "/login";

    clearBootstrapCache();
    setSessionToken(null);
    setBootstrap(null);
    setActiveBrandIdState(null);
    setUserEmail(null);
    setPromptPackage(null);
    await supabase.auth.signOut().catch(() => undefined);
    router.replace(loginPath);
  }, [router]);

  useEffect(() => {
    if (!messageState) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMessageState((current) => (current?.id === messageState.id ? null : current));
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [messageState]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession(accessToken: string, email?: string | null) {
      if (cancelled) {
        return;
      }

      setUserEmail(email ?? null);

      const storedBrandId = window.localStorage.getItem("activeBrandId");
      const scopedStoredBrandId =
        bootstrapMode === "full" || bootstrapMode === "create" || bootstrapMode === "editor"
          ? storedBrandId ?? undefined
          : undefined;
      let payload: BootstrapResponse;

      try {
        payload = await bootstrapSession(accessToken, bootstrapMode, scopedStoredBrandId);
      } catch (error) {
        if (scopedStoredBrandId && isWorkspaceAccessApiError(error)) {
          clearBootstrapCache();
          payload = await bootstrapSession(accessToken, bootstrapMode);
        } else {
          throw error;
        }
      }

      if (cancelled) {
        return;
      }

      const normalizedPayload = normalizeBootstrapPayload(payload);
      setBootstrap(normalizedPayload);
      writeBootstrapCache(bootstrapMode, normalizedPayload);
      setSessionToken(accessToken);
      setActiveBrandIdState((current) => {
        const resolved = resolveActiveBrandId(normalizedPayload.brands, current, storedBrandId);
        if (resolved) {
          window.localStorage.setItem("activeBrandId", resolved);
        } else {
          window.localStorage.removeItem("activeBrandId");
        }
        return resolved;
      });
    }

    const load = async () => {
      const cachedBootstrap = readBootstrapCache(bootstrapMode);
      const storedBrandId = window.localStorage.getItem("activeBrandId");

      if (cachedBootstrap) {
        setBootstrap(cachedBootstrap);
        setActiveBrandIdState((current) => {
          const resolved = resolveActiveBrandId(cachedBootstrap.brands, current, storedBrandId);
          if (resolved) {
            window.localStorage.setItem("activeBrandId", resolved);
          } else {
            window.localStorage.removeItem("activeBrandId");
          }
          return resolved;
        });
        setLoading(false);
      }

      const { data } = await supabase.auth.getSession();

      if (!data.session?.access_token) {
        clearBootstrapCache();
        router.replace("/login");
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
        setPromptPackage(null);
        router.replace("/login");
        return;
      }

      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        void hydrateSession(session.access_token, session.user.email ?? null).catch((error) => {
          if (isUnauthorizedApiError(error)) {
            void redirectToLoginForInvalidSession();
            return;
          }
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
        if (isUnauthorizedApiError(error)) {
          void redirectToLoginForInvalidSession();
          return;
        }
        setMessage(error instanceof Error ? error.message : "Failed to load workspace");
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [bootstrapMode, redirectToLoginForInvalidSession, router]);

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

  const workspaceMembers = useMemo(
    () => bootstrap?.workspaceMembers ?? [],
    [bootstrap]
  );

  const hasRunningJobs = useMemo(
    () => recentJobs.some((job) => job.status === "queued" || job.status === "processing"),
    [recentJobs]
  );

  useEffect(() => {
    if (pathname.startsWith("/studio/create-v3") || pathname.startsWith("/studio/runs/")) {
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
            bootstrapMode === "full" || bootstrapMode === "editor" ? activeBrandId ?? undefined : undefined
          );
          if (cancelled) {
            return;
          }

          const normalizedPayload = normalizeBootstrapPayload(payload);
          setBootstrap(normalizedPayload);
          setActiveBrandIdState((current) => current ?? normalizedPayload.brands[0]?.id ?? null);
        }
      } catch (error) {
        if (isUnauthorizedApiError(error)) {
          void redirectToLoginForInvalidSession();
          return;
        }
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
  }, [activeBrandId, bootstrapMode, pathname, recentJobs, redirectToLoginForInvalidSession, sessionToken]);

  useEffect(() => {
    setBriefForm((state) => {
      const validAssetIds = state.selectedReferenceAssetIds.filter((assetId) =>
        activeAssets.some((asset) => asset.id === assetId)
      );
      const hasBrandLogo = activeAssets.some((asset) => asset.kind === "logo");
      const hasReraQr = hasApplicableReraQr(activeAssets, state.projectId);

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
    const shouldScopeBrand = bootstrapMode === "full" || bootstrapMode === "create" || bootstrapMode === "editor";
    let payload: BootstrapResponse;

    try {
      payload = await bootstrapSession(sessionToken, bootstrapMode, shouldScopeBrand ? scopedBrandId : undefined);
    } catch (error) {
      if (isUnauthorizedApiError(error)) {
        await redirectToLoginForInvalidSession();
        return;
      }

      if (shouldScopeBrand && scopedBrandId && isWorkspaceAccessApiError(error)) {
        clearBootstrapCache();
        payload = await bootstrapSession(sessionToken, bootstrapMode);
      } else {
        throw error;
      }
    }

    const normalizedPayload = normalizeBootstrapPayload(payload);
    setBootstrap(normalizedPayload);
    writeBootstrapCache(bootstrapMode, normalizedPayload);
    setActiveBrandIdState(() => {
      const resolved = resolveActiveBrandId(normalizedPayload.brands, preferredBrandId ?? activeBrandId, null);
      if (resolved) {
        window.localStorage.setItem("activeBrandId", resolved);
      } else {
        window.localStorage.removeItem("activeBrandId");
      }
      return resolved;
    });
  }, [activeBrandId, bootstrapMode, redirectToLoginForInvalidSession, sessionToken]);

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
      logoAssetId: null,
      selectedReferenceAssetIds: []
    }));

    if (sessionToken && (bootstrapMode === "full" || bootstrapMode === "create" || bootstrapMode === "editor")) {
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
          visualSystem: {
            ...defaultProfile.visualSystem,
            typographyMood: brandForm.typographyMood,
            headlineFontFamily: brandForm.headlineFontFamily,
            bodyFontFamily: brandForm.bodyFontFamily,
            typographyNotes: splitList(brandForm.typographyNotes)
          },
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

  async function uploadBrandAssetFile(
    file: File,
    label: string,
    kind: AssetKind,
    projectId?: string | null,
    options?: { reraNumber?: string }
  ) {
    if (!sessionToken || !activeBrandId) {
      return false;
    }

    setPendingAction("upload-reference");
    setPendingTargetKey("asset-upload");

    try {
      await uploadBrandAsset(sessionToken, activeBrandId, {
        file,
        kind,
        label,
        ...(projectId !== undefined ? { projectId } : {}),
        ...(options?.reraNumber ? { reraNumber: options.reraNumber } : {})
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

  async function leaveFeedback(outputId: string, verdict: OutputVerdict, comment?: string) {
    if (!sessionToken) {
      return null;
    }

    setPendingAction("submit-feedback");
    setPendingTargetKey(`output:${outputId}:feedback:${verdict}`);

    try {
      const feedbackReason = comment || (verdict === "approved" ? "Strong fit for the brand." : verdict === "off-brand" ? "Rejected as not aligned with the brand." : "Needs more refinement.");
      const result = await submitFeedback(sessionToken, outputId, {
        verdict,
        reason: feedbackReason,
        notes: comment && verdict !== "approved" ? comment : undefined
      });
      await refresh(activeBrandId ?? undefined);
      setMessage(
        verdict === "approved"
          ? "Approved. You can open the post task or schedule it next."
          : verdict === "off-brand"
            ? "Rejected. The post task is now blocked until a stronger option is created."
          : comment
            ? `Feedback saved: ${comment.substring(0, 50)}${comment.length > 50 ? "..." : ""}`
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
        workspaceMembers,
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
        leaveFeedback,
        signOut
      }}
    >
      {children}
    </StudioContext.Provider>
  );
}

function hasApplicableReraQr(assets: BrandAssetRecord[], projectId?: string | null) {
  return assets.some((asset) => {
    if (asset.kind !== "rera_qr") {
      return false;
    }

    if (projectId) {
      return asset.projectId === projectId || asset.projectId == null;
    }

    return asset.projectId == null;
  });
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) {
    throw new Error("useStudio must be used within StudioProvider");
  }

  return context;
}

export function useOptionalStudio() {
  return useContext(StudioContext);
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBootstrapPayload(payload: BootstrapResponse): BootstrapResponse {
  return {
    ...payload,
    workspaceComplianceSettings: payload.workspaceComplianceSettings ?? (
      payload.workspace
        ? {
            workspaceId: payload.workspace.id,
            reraAuthorityLabel: "MahaRERA",
            reraWebsiteUrl: "https://maharera.maharashtra.gov.in",
            reraTextColor: "#111111",
            updatedAt: null
          }
        : null
    )
  };
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

    return normalizeBootstrapPayload(parsed);
  } catch {
    return null;
  }
}

function writeBootstrapCache(mode: BootstrapMode, payload: BootstrapResponse) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(`${BOOTSTRAP_CACHE_KEY_PREFIX}:${mode}`, JSON.stringify(normalizeBootstrapPayload(payload)));
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
    window.sessionStorage.removeItem(`${BOOTSTRAP_CACHE_KEY_PREFIX}:create`);
    window.sessionStorage.removeItem(`${BOOTSTRAP_CACHE_KEY_PREFIX}:editor`);
    window.localStorage.removeItem("activeBrandId");
  } catch {
    // Ignore storage errors during sign out.
  }
}
