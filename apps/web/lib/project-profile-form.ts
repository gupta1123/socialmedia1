import type { ProjectDetail, ProjectProfile, ProjectRecord } from "@image-lab/contracts";

export type ProjectFormState = {
  name: string;
  description: string;
  city: string;
  microLocation: string;
  projectType: string;
  stage: ProjectRecord["stage"];
  status: ProjectRecord["status"];
  tagline: string;
  possessionStatus: string;
  reraNumber: string;
  positioning: string;
  audienceSegments: string;
  lifestyleAngle: string;
  configurations: string;
  sizeRanges: string;
  towersCount: string;
  floorsCount: string;
  totalUnits: string;
  specialUnitTypes: string;
  parkingFacts: string;
  pricingBand: string;
  startingPrice: string;
  priceRangeByConfig: string;
  bookingAmount: string;
  paymentPlanSummary: string;
  currentOffers: string;
  financingPartners: string;
  offerValidity: string;
  amenities: string;
  heroAmenities: string;
  nearbyLandmarks: string;
  connectivityPoints: string;
  travelTimes: string;
  locationAdvantages: string;
  constructionStatus: string;
  milestoneHistory: string;
  latestUpdate: string;
  completionWindow: string;
  approvedClaims: string;
  bannedClaims: string;
  legalNotes: string;
  approvalsSummary: string;
  credibilityFacts: string;
  investorAngle: string;
  endUserAngle: string;
  keyObjections: string;
  faqs: string;
  actualProjectImageIds: string[];
  sampleFlatImageIds: string[];
};

export const defaultProjectForm: ProjectFormState = {
  name: "",
  description: "",
  city: "",
  microLocation: "",
  projectType: "",
  stage: "launch",
  status: "active",
  tagline: "",
  possessionStatus: "",
  reraNumber: "",
  positioning: "",
  audienceSegments: "",
  lifestyleAngle: "",
  configurations: "",
  sizeRanges: "",
  towersCount: "",
  floorsCount: "",
  totalUnits: "",
  specialUnitTypes: "",
  parkingFacts: "",
  pricingBand: "",
  startingPrice: "",
  priceRangeByConfig: "",
  bookingAmount: "",
  paymentPlanSummary: "",
  currentOffers: "",
  financingPartners: "",
  offerValidity: "",
  amenities: "",
  heroAmenities: "",
  nearbyLandmarks: "",
  connectivityPoints: "",
  travelTimes: "",
  locationAdvantages: "",
  constructionStatus: "",
  milestoneHistory: "",
  latestUpdate: "",
  completionWindow: "",
  approvedClaims: "",
  bannedClaims: "",
  legalNotes: "",
  approvalsSummary: "",
  credibilityFacts: "",
  investorAngle: "",
  endUserAngle: "",
  keyObjections: "",
  faqs: "",
  actualProjectImageIds: [],
  sampleFlatImageIds: []
};

export function detailToProjectForm(detail: ProjectDetail): ProjectFormState {
  const profile = detail.activeProfile?.profile;

  return {
    name: detail.project.name,
    description: detail.project.description ?? "",
    city: detail.project.city ?? "",
    microLocation: detail.project.microLocation ?? "",
    projectType: detail.project.projectType ?? "",
    stage: detail.project.stage,
    status: detail.project.status,
    tagline: profile?.tagline ?? "",
    possessionStatus: profile?.possessionStatus ?? "",
    reraNumber: profile?.reraNumber ?? "",
    positioning: profile?.positioning ?? "",
    audienceSegments: joinLineList(profile?.audienceSegments ?? []),
    lifestyleAngle: profile?.lifestyleAngle ?? "",
    configurations: joinLineList(profile?.configurations ?? []),
    sizeRanges: joinLineList(profile?.sizeRanges ?? []),
    towersCount: profile?.towersCount ?? "",
    floorsCount: profile?.floorsCount ?? "",
    totalUnits: profile?.totalUnits ?? "",
    specialUnitTypes: joinLineList(profile?.specialUnitTypes ?? []),
    parkingFacts: profile?.parkingFacts ?? "",
    pricingBand: profile?.pricingBand ?? "",
    startingPrice: profile?.startingPrice ?? "",
    priceRangeByConfig: joinLineList(profile?.priceRangeByConfig ?? []),
    bookingAmount: profile?.bookingAmount ?? "",
    paymentPlanSummary: profile?.paymentPlanSummary ?? "",
    currentOffers: joinLineList(profile?.currentOffers ?? []),
    financingPartners: joinLineList(profile?.financingPartners ?? []),
    offerValidity: profile?.offerValidity ?? "",
    amenities: joinLineList(profile?.amenities ?? []),
    heroAmenities: joinLineList(profile?.heroAmenities ?? []),
    nearbyLandmarks: joinLineList(profile?.nearbyLandmarks ?? []),
    connectivityPoints: joinLineList(profile?.connectivityPoints ?? []),
    travelTimes: joinLineList(profile?.travelTimes ?? []),
    locationAdvantages: joinLineList(profile?.locationAdvantages ?? []),
    constructionStatus: profile?.constructionStatus ?? "",
    milestoneHistory: joinLineList(profile?.milestoneHistory ?? []),
    latestUpdate: profile?.latestUpdate ?? "",
    completionWindow: profile?.completionWindow ?? "",
    approvedClaims: joinLineList(profile?.approvedClaims ?? []),
    bannedClaims: joinLineList(profile?.bannedClaims ?? []),
    legalNotes: joinLineList(profile?.legalNotes ?? []),
    approvalsSummary: profile?.approvalsSummary ?? "",
    credibilityFacts: joinLineList(profile?.credibilityFacts ?? []),
    investorAngle: profile?.investorAngle ?? "",
    endUserAngle: profile?.endUserAngle ?? "",
    keyObjections: joinLineList(profile?.keyObjections ?? []),
    faqs: serializeFaqs(profile?.faqs ?? []),
    actualProjectImageIds: profile?.actualProjectImageIds ?? [],
    sampleFlatImageIds: profile?.sampleFlatImageIds ?? []
  };
}

export function formStateToProjectProfile(form: ProjectFormState): ProjectProfile {
  return {
    tagline: form.tagline.trim(),
    possessionStatus: form.possessionStatus.trim(),
    reraNumber: form.reraNumber.trim(),
    positioning: form.positioning.trim(),
    audienceSegments: splitLineList(form.audienceSegments),
    lifestyleAngle: form.lifestyleAngle.trim(),
    configurations: splitLineList(form.configurations),
    sizeRanges: splitLineList(form.sizeRanges),
    towersCount: form.towersCount.trim(),
    floorsCount: form.floorsCount.trim(),
    totalUnits: form.totalUnits.trim(),
    specialUnitTypes: splitLineList(form.specialUnitTypes),
    parkingFacts: form.parkingFacts.trim(),
    pricingBand: form.pricingBand.trim(),
    startingPrice: form.startingPrice.trim(),
    priceRangeByConfig: splitLineList(form.priceRangeByConfig),
    bookingAmount: form.bookingAmount.trim(),
    paymentPlanSummary: form.paymentPlanSummary.trim(),
    currentOffers: splitLineList(form.currentOffers),
    financingPartners: splitLineList(form.financingPartners),
    offerValidity: form.offerValidity.trim(),
    amenities: splitLineList(form.amenities),
    heroAmenities: splitLineList(form.heroAmenities),
    nearbyLandmarks: splitLineList(form.nearbyLandmarks),
    connectivityPoints: splitLineList(form.connectivityPoints),
    travelTimes: splitLineList(form.travelTimes),
    locationAdvantages: splitLineList(form.locationAdvantages),
    constructionStatus: form.constructionStatus.trim(),
    milestoneHistory: splitLineList(form.milestoneHistory),
    latestUpdate: form.latestUpdate.trim(),
    completionWindow: form.completionWindow.trim(),
    approvedClaims: splitLineList(form.approvedClaims),
    bannedClaims: splitLineList(form.bannedClaims),
    legalNotes: splitLineList(form.legalNotes),
    approvalsSummary: form.approvalsSummary.trim(),
    credibilityFacts: splitLineList(form.credibilityFacts),
    investorAngle: form.investorAngle.trim(),
    endUserAngle: form.endUserAngle.trim(),
    keyObjections: splitLineList(form.keyObjections),
    faqs: parseFaqs(form.faqs),
    actualProjectImageIds: form.actualProjectImageIds,
    sampleFlatImageIds: form.sampleFlatImageIds
  };
}

export function splitLineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinLineList(values: string[]) {
  return values.join("\n");
}

export function serializeFaqs(values: Array<{ question: string; answer: string }>) {
  return values.map((item) => `${item.question} | ${item.answer}`).join("\n");
}

export function parseFaqs(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [question, ...answerParts] = line.split("|");
      const answer = answerParts.join("|").trim();
      const questionText = (question ?? "").trim();
      return {
        question: questionText,
        answer
      };
    })
    .filter((item) => item.question && item.answer);
}
