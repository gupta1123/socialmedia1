import type { OutputReviewState, OutputVerdict } from "@image-lab/contracts";

export function mapVerdictToReviewState(verdict: OutputVerdict): OutputReviewState {
  switch (verdict) {
    case "approved":
      return "approved";
    case "close":
      return "closed";
    default:
      return "needs_revision";
  }
}
