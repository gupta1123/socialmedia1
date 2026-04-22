import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fal } from "@fal-ai/client";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), "apps/api/.env") });

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FAL_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required env: ${key}`);
  }
}

fal.config({
  credentials: process.env.FAL_KEY
});

const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "creative-assets";
const falModel = process.env.FAL_STYLE_SEED_MODEL ?? "fal-ai/nano-banana";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const BRAND_NAME = "Krisala Developers";
const LOCAL_OUTPUT_DIR = path.resolve("/tmp/post-type-template-previews");

const TEMPLATE_LIBRARY = [
  {
    postTypeCode: "project-launch",
    legacyName: "Project launch portrait",
    name: "Project launch · Hero tower reveal",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Project launch / hero tower reveal",
    approvedUseCases: ["Project launch", "Property reveal", "Premium residential hero post"],
    safeZoneNotes: [
      "Protect the top strip for brand and micro-location.",
      "Keep a bold headline zone in the upper-left or upper-middle.",
      "Leave the lower third clean for support text and one premium seal."
    ],
    notes: ["Best for first-look project launches with the tower or facade as the hero."],
    textZones: ["brand strip", "headline", "support line", "micro location", "seal", "footer note"],
    scaffoldPrompt: `Create a premium vertical 4:5 real estate social media poster template for a Project Launch announcement. The result should feel like a finished luxury launch poster with a clear brand strip, a confident headline zone, a short support line, and a dominant building hero image. Use a calm editorial structure, generous spacing, subtle framed elements, and premium negative space.

The layout should include:
- a refined header strip for [BRAND NAME]
- one bold launch headline zone
- one short support-text area
- one compact micro-location or positioning line
- a subtle premium seal, marker, or corner accent
- a large full-height hero building image
- a calm footer or micro note area

The hero should be a photoreal premium residential tower or facade in an upscale Indian urban setting. The architecture must feel believable and expensive, with elegant proportions, strong materiality, warm lighting, and a landmark-quality silhouette. The building should dominate the frame and the design should feel like a luxury developer launch asset, not a generic property ad.

Leave clean text-safe space for:
- [BRAND NAME]
- [PROJECT NAME]
- [SHORT TAGLINE]
- [MICRO LOCATION]

Style: premium launch poster, editorial real estate branding, clean hierarchy, photoreal architecture, refined, high-end.

Negative prompt: no low-end brochure clutter, no cheap gradients, no fake luxury, no overloaded badges, no random logos, no messy city chaos, no distorted tower proportions, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: real estate launch template preview
Primary request: Create a premium vertical 4:5 project launch poster template with a dominant tower hero and editorial luxury layout.
Subject: a landmark-quality residential tower in an upscale Indian urban setting
Scene/backdrop: polished premium architecture with warm evening light, elegant facade detail, clear skyline depth, believable luxury residential mood
Style/medium: photoreal luxury launch poster
Composition/framing: refined top header strip, strong headline zone in the upper-left or upper-middle, short support line, compact micro-location line, one subtle premium seal, full-height hero building image, calm footer note area
Lighting/mood: polished, aspirational, premium, warm dusk
Text (verbatim): "KRISALA DEVELOPERS" "ZOY+" "A Landmark Life, Elevated" "Hinjawadi Phase 1"
Constraints: text only, no logo icon or emblem, keep architecture dominant, avoid clutter
Avoid: low-end brochure clutter, cheap gradients, overloaded badges, random logos, distorted tower proportions, watermark`
  },
  {
    postTypeCode: "project-launch",
    name: "Project launch · Skyline dusk statement",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Project launch / skyline dusk statement",
    approvedUseCases: ["Project launch", "Tower reveal", "Luxury skyline hero"],
    safeZoneNotes: [
      "Use the sky as a controlled headline field.",
      "Keep one micro info row above the main heading.",
      "Preserve clean breathing room around the tower edges."
    ],
    notes: ["Strong for blue-hour skyline reveals and premium tower silhouettes."],
    textZones: ["micro row", "headline", "support line", "footer attribution"],
    scaffoldPrompt: `Design a luxury vertical 4:5 social media poster template for a Project Launch with a skyline-led dusk composition. The visual should feel polished, atmospheric, and premium, with the building rising as the hero against an elegant evening sky. The poster must include a micro information row, a strong headline system, one restrained support line, and subtle developer-grade framing.

The structure should use the sky as the main text-safe area while letting the building stay tall, clean, and central. Use thin line accents, a light premium footer, and a calm editorial rhythm. Avoid turning it into a brochure with too many blocks.

Leave intentional space for:
- [BRAND NAME]
- [PROJECT NAME]
- [SHORT TAGLINE]
- [LOCATION TAG]

Style: blue-hour architectural hero, premium launch poster, calm editorial framing, clean high-end real estate branding.

Negative prompt: no cheap lens flare, no fantasy skyline, no cluttered sales flyer styling, no multiple buildings fighting for attention, no noisy overlays, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: real estate launch template preview
Primary request: Design a luxury vertical 4:5 project launch poster using a skyline-led dusk composition.
Subject: a premium residential tower rising against a blue-hour sky
Scene/backdrop: elegant Indian urban skyline, softly glowing tower windows, believable luxury architecture, atmospheric dusk
Style/medium: photoreal blue-hour architectural poster with premium editorial framing
Composition/framing: sky used as the main text-safe zone, micro info row high on the layout, strong headline system, one restrained support line, thin premium framing accents, light footer
Lighting/mood: elevated, atmospheric, polished, premium dusk
Text (verbatim): "KRISALA DEVELOPERS" "41 LUXOVERT" "A New West Pune Statement" "Tathawade"
Constraints: no logos or symbols, keep one hero tower, preserve negative space
Avoid: cheap lens flare, fantasy skyline, cluttered sales flyer styling, noisy overlays, watermark`
  },
  {
    postTypeCode: "project-launch",
    name: "Project launch · Editorial facade crop",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Project launch / editorial facade crop",
    approvedUseCases: ["Project launch", "Architecture-led reveal", "Materiality-first property post"],
    safeZoneNotes: [
      "Keep a left or top text card over quieter facade space.",
      "Let the facade crop feel intentional, not accidental.",
      "Avoid covering key architectural lines with text."
    ],
    notes: ["Good for close facade crops and design-conscious property reveals."],
    textZones: ["brand label", "headline card", "support line", "micro note"],
    scaffoldPrompt: `Create a premium vertical 4:5 real estate launch template focused on an editorial facade crop. This should feel like a design-forward launch poster for a luxury residential brand, with architecture and materiality as the hero instead of a full wide tower shot. Use one calm text card or translucent panel, a minimal brand label, and carefully controlled spacing.

The layout should feel intimate, modern, and high-end, with close or semi-close architecture, warm stone or metal detailing, glazed surfaces, and premium shadow play. Keep one strong headline area and one short supporting line. The composition should feel deliberate, not like a random crop from a brochure.

Leave space for:
- [BRAND NAME]
- [PROJECT NAME]
- [SHORT TAGLINE]
- [LOCATION TAG]

Style: editorial architecture poster, design-conscious real estate launch asset, premium facade storytelling, refined, minimal.

Negative prompt: no random crop feeling, no generic builder flyer look, no heavy badges, no poor perspective, no fake luxury textures, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: real estate launch template preview
Primary request: Create a premium vertical 4:5 real estate launch poster focused on an editorial facade crop.
Subject: a luxury residential facade with strong materiality and refined architectural lines
Scene/backdrop: close or semi-close architecture showing warm stone, metal detailing, glazing, premium light and shadow
Style/medium: photoreal editorial architecture poster
Composition/framing: minimal brand label, one translucent or calm text card, one strong headline area, one short support line, intentional crop, clean premium spacing
Lighting/mood: warm, refined, design-led, high-end
Text (verbatim): "KRISALA DEVELOPERS" "AVENTIS" "Designed to Feel Like an Upgrade" "Tathawade"
Constraints: sample text only; no logo mark; do not make it look like a random brochure crop
Avoid: generic builder flyer look, heavy badges, fake luxury textures, poor perspective, watermark`
  },
  {
    postTypeCode: "project-launch",
    name: "Project launch · Grand arrival statement",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Project launch / grand arrival statement",
    approvedUseCases: ["Project launch", "Entry experience hero", "Developer reveal post"],
    safeZoneNotes: [
      "Protect the upper quarter for a strong headline block.",
      "Keep the lower arrival view visible and uncluttered.",
      "Use one restrained footer line only."
    ],
    notes: ["Works when the arrival court, front facade, or grand entrance drives the first impression."],
    textZones: ["brand strip", "headline", "support line", "footer"],
    scaffoldPrompt: `Generate a luxury vertical 4:5 Project Launch poster template built around a grand arrival or front-facade statement view. The composition should feel premium and ceremonial without becoming gaudy. Use a clean header strip, a bold launch headline, one concise supporting line, and a restrained footer. The architecture should feel welcoming, elevated, and aspirational.

The arrival environment can include driveway rhythm, entrance lighting, landscape edges, or a front facade with strong symmetry, but the output must still feel calm and expensive rather than loud. Keep typography zones elegant and well-spaced.

Leave clean areas for:
- [BRAND NAME]
- [PROJECT NAME]
- [SHORT TAGLINE]
- [LOCATION TAG]

Style: premium arrival-view launch poster, warm hospitality-led architecture, refined real estate branding, polished and calm.

Negative prompt: no excessive gold, no wedding-card vibe, no overdecorated facade, no crowded cars or people, no flashy sales treatment, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: real estate launch template preview
Primary request: Generate a premium vertical 4:5 project launch poster built around a grand arrival or front-facade statement view.
Subject: a warm, elegant arrival court and premium residential front facade
Scene/backdrop: refined entrance lighting, clean driveway rhythm, landscaped edges, polished architecture
Style/medium: photoreal luxury arrival-view poster
Composition/framing: clean header strip, bold launch headline, concise support line, restrained footer, calm typography zones, architecture still dominant
Lighting/mood: welcoming, elevated, polished, premium
Text (verbatim): "KRISALA DEVELOPERS" "41 ZILLENIA PHASE 2" "A More Refined Everyday" "Punawale"
Constraints: no logos, no crowd scene, keep the composition elegant and calm
Avoid: excessive gold, wedding-card vibe, crowded cars, flashy sales treatment, watermark`
  },
  {
    postTypeCode: "site-visit-invite",
    legacyName: "Site visit invite portrait",
    name: "Site visit invite · Weekend open house",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Site visit invite / weekend open house",
    approvedUseCases: ["Site visit invite", "Open house", "Weekend visit push"],
    safeZoneNotes: [
      "Keep the CTA block low and highly legible.",
      "Use one clear invite headline with a concise date line.",
      "Preserve the project hero image around the invite card."
    ],
    notes: ["The strongest default for project-led site visit invitation posts."],
    textZones: ["brand strip", "invite headline", "date line", "cta card", "micro footer"],
    scaffoldPrompt: `Create a premium vertical 4:5 Site Visit Invite poster template for a luxury residential project. The design should feel warm, welcoming, and polished, with the project image as the trust-building hero and a clearly structured invitation system layered over it. Use one invite headline, one date/time line, one CTA card, and a minimal footer.

The layout should keep the building or arrival view visible while using one dark or soft translucent panel for readability. The CTA should feel premium and clear, not pushy or low-end. The overall mood should communicate hospitality, confidence, and premium access.

Leave intentional space for:
- [BRAND NAME]
- [VISIT HEADLINE]
- [DATE / TIME]
- [CTA LINE]

Style: premium real estate invite poster, warm project-led composition, clean call-to-action hierarchy, polished brochure-grade social asset.

Negative prompt: no loud promotional clutter, no bright sale stickers, no overpacked details, no fake urgency styling, no random logos, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: site visit invite template preview
Primary request: Create a premium vertical 4:5 site visit invite poster with the project image as the trust-building hero and a clear invitation system.
Subject: a premium residential building or arrival view used as the main hero image
Scene/backdrop: polished Indian residential architecture with warm light and clean foreground
Style/medium: photoreal premium invite poster with brochure-grade overlay system
Composition/framing: brand strip at top, clear invite headline, date/time line, premium CTA card low in the frame, minimal footer, building remains visible
Lighting/mood: warm, inviting, polished, premium
Text (verbatim): "KRISALA DEVELOPERS" "WEEKEND SITE VISIT" "Saturday & Sunday · 11 AM to 6 PM" "Book your visit today"
Constraints: no logos or icons beyond subtle system cues; keep CTA premium not pushy
Avoid: loud sale stickers, fake urgency styling, overpacked details, watermark`
  },
  {
    postTypeCode: "site-visit-invite",
    name: "Site visit invite · RSVP overlay card",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Site visit invite / RSVP overlay card",
    approvedUseCases: ["Site visit invite", "Lead capture post", "RSVP invitation"],
    safeZoneNotes: [
      "Center or upper-middle RSVP card should stay readable.",
      "Keep the architecture visible behind and around the card.",
      "Limit the CTA system to one primary action line."
    ],
    notes: ["Useful for more conversion-led invite posts with a stronger information card."],
    textZones: ["brand strip", "rsvp card", "headline", "date line", "cta"],
    scaffoldPrompt: `Design a luxury vertical 4:5 Site Visit Invite social media template with a central RSVP-style overlay card placed over a premium project hero image. The card should feel elegant, restrained, and highly legible, not like a lead-gen flyer. Use one clean brand strip, one RSVP headline, one date block, and one action line.

The hero visual should remain visible as architectural proof while the overlay card organizes the invite information. The design should feel premium and conversion-aware without becoming pushy.

Leave clear space for:
- [BRAND NAME]
- [VISIT HEADLINE]
- [DATE BLOCK]
- [CTA LINE]

Style: premium RSVP invite, elegant overlay-card real estate poster, polished and calm.

Negative prompt: no cheap registration-banner look, no noisy icons, no discount styling, no clutter, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: site visit invite template preview
Primary request: Design a luxury vertical 4:5 site visit invite poster with a central RSVP-style overlay card over a premium project image.
Subject: a premium residential project exterior or arrival view with a refined invitation card layered over it
Scene/backdrop: believable upscale Indian residential architecture, calm evening or day light
Style/medium: photoreal premium RSVP invite poster
Composition/framing: elegant brand strip, centered or upper-middle card, visit headline, date block, one CTA line, architecture visible around the card
Lighting/mood: calm, premium, welcoming
Text (verbatim): "KRISALA DEVELOPERS" "RSVP FOR A PRIVATE VISIT" "This Weekend · Limited Slots" "Reserve your preferred time"
Constraints: no logos, no registration-banner clutter, keep the overlay refined
Avoid: noisy icons, cheap lead-gen flyer styling, clutter, watermark`
  },
  {
    postTypeCode: "site-visit-invite",
    name: "Site visit invite · Guided walkthrough",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Site visit invite / guided walkthrough",
    approvedUseCases: ["Site visit invite", "Guided tour", "Walkthrough appointment"],
    safeZoneNotes: [
      "Use one slim info rail or schedule strip, not multiple cards.",
      "Keep the invite headline calm and high on the page.",
      "Preserve visual access to the project image."
    ],
    notes: ["Good for more guided, hospitality-led visit invitations rather than urgency-led posts."],
    textZones: ["brand row", "headline", "support line", "schedule strip", "footer note"],
    scaffoldPrompt: `Create a premium vertical 4:5 Site Visit Invite poster template centered on the idea of a guided walkthrough. The composition should feel calm, hospitality-led, and brand-safe. Use a refined project image, one slim schedule strip or info rail, a strong but not aggressive headline, one support line, and a subtle footer note.

The poster should feel like a premium invitation to experience the project in person. Avoid visual clutter and let the project image do most of the persuasion.

Leave clean text zones for:
- [BRAND NAME]
- [VISIT HEADLINE]
- [SHORT SUPPORT LINE]
- [SCHEDULE STRIP]

Style: premium walkthrough invite, hospitality-led real estate poster, clean and persuasive without pressure.

Negative prompt: no aggressive lead-gen design, no fake urgency, no crowded contact blocks, no cheap icons, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: site visit invite template preview
Primary request: Create a premium vertical 4:5 guided walkthrough invite poster for a residential project.
Subject: a luxury residential building image used as the main trust anchor
Scene/backdrop: upscale project facade or arrival image with calm, premium lighting
Style/medium: photoreal hospitality-led invite poster
Composition/framing: refined brand row, strong but calm headline, one support line, slim schedule strip or info rail, subtle footer note, generous whitespace
Lighting/mood: polished, welcoming, brand-safe
Text (verbatim): "KRISALA DEVELOPERS" "GUIDED SITE WALKTHROUGH" "See the project, amenities, and arrival experience in person" "By appointment this weekend"
Constraints: no logos, no clutter, keep the invite tone warm rather than pushy
Avoid: aggressive lead-gen design, crowded contact blocks, cheap icons, watermark`
  },
  {
    postTypeCode: "site-visit-invite",
    name: "Site visit invite · Sunset experience poster",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Site visit invite / sunset experience poster",
    approvedUseCases: ["Site visit invite", "Evening site visit", "Experience-led invitation"],
    safeZoneNotes: [
      "Use open sky or calm facade space for the headline.",
      "Keep the visit CTA low and elegant.",
      "Do not over-darken the hero image."
    ],
    notes: ["Best for premium evening-visit invitations and aspiration-led project tours."],
    textZones: ["brand strip", "headline", "visit line", "cta footer"],
    scaffoldPrompt: `Generate a luxury vertical 4:5 Site Visit Invite poster template built around a sunset or golden-hour project image. The design should feel aspirational and experience-led, as if the viewer is being invited to see the project at its best. Use one elegant headline, one short visit line, and one clean CTA footer, all kept premium and minimal.

The image should carry most of the emotion, with typography resting in natural negative space. The layout should stay calm and elegant, not feel like a discount or urgency ad.

Leave space for:
- [BRAND NAME]
- [VISIT HEADLINE]
- [DATE / TIME LINE]
- [CTA FOOTER]

Style: premium sunset invite poster, aspirational residential brand creative, polished and minimal.

Negative prompt: no dark unreadable scene, no harsh gradient block, no loud CTA sticker, no cheap urgency device, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: site visit invite template preview
Primary request: Generate a luxury vertical 4:5 site visit invite poster built around a sunset or golden-hour project image.
Subject: a premium residential project seen in warm sunset light
Scene/backdrop: upscale Indian residential architecture, golden-hour atmosphere, calm skyline or arrival context
Style/medium: photoreal premium sunset invite poster
Composition/framing: natural negative space for headline, one short visit line, one clean CTA footer, image carries the emotion
Lighting/mood: aspirational, warm, polished, minimal
Text (verbatim): "KRISALA DEVELOPERS" "VISIT THIS WEEKEND" "Experience the project in its best light" "Schedule your visit"
Constraints: no logos, no aggressive urgency, preserve readability
Avoid: dark unreadable scene, loud CTA sticker, harsh gradient blocks, cheap urgency device, watermark`
  },
  {
    postTypeCode: "construction-update",
    legacyName: "Construction update portrait",
    name: "Construction update · Editorial progress band",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Construction update / editorial progress band",
    approvedUseCases: ["Construction update", "Milestone update", "Trust-building progress post"],
    safeZoneNotes: [
      "Keep the headline upper-left with one controlled overlay.",
      "Use a lower progress band for metrics, not multiple floating boxes.",
      "Preserve the site image as the hero."
    ],
    notes: ["The strongest default construction update layout for premium progress communication."],
    textZones: ["kicker", "headline", "support line", "progress band", "footer trust row"],
    scaffoldPrompt: `Create a premium vertical 4:5 Construction Update poster template for a luxury real estate brand. The poster should feel like a polished site-journal asset with a real construction photo as the hero, a clear upper-left headline system, one support line, and a refined lower progress band carrying milestone information. The building and site remain the hero.

The composition should use a dark transparent overlay only where needed for readability. The lower band should hold progress metrics and one confidence line without looking like a crowded report. End with a subtle footer trust row.

Leave structured space for:
- [BRAND NAME]
- [UPDATE HEADLINE]
- [SUPPORT LINE]
- [PROGRESS METRICS]

Style: premium construction bulletin, truthful site photography, editorial hierarchy, trustworthy and polished.

Negative prompt: no cartoon construction, no fake finished tower, no cluttered infographic, no gaudy report styling, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: construction update template preview
Primary request: Create a premium vertical 4:5 construction update poster with a real site photo hero and a refined lower progress band.
Subject: a modern multi-storey building under development with exposed structure, glazing in progress, cranes, and scaffolding
Scene/backdrop: truthful construction-stage site captured in warm late-afternoon or sunset light
Style/medium: photoreal premium construction bulletin poster
Composition/framing: upper-left headline system with controlled dark overlay, one support line, lower progress band with metrics, subtle footer trust row, site remains the hero
Lighting/mood: trustworthy, polished, premium, sunset-lit
Text (verbatim): "KRISALA DEVELOPERS" "PROGRESS UPDATE" "Strong foundations. Steady progress." "ON TRACK FOR TIMELY DELIVERY"
Constraints: no logos, no fake completion render, keep the site truthful
Avoid: cartoon construction, cluttered infographic, gaudy report styling, watermark`
  },
  {
    postTypeCode: "construction-update",
    name: "Construction update · Sunset site journal",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Construction update / sunset site journal",
    approvedUseCases: ["Construction update", "Journal-style progress post", "Milestone communication"],
    safeZoneNotes: [
      "Use sky and upper-left space for calm editorial text.",
      "Keep the metric module compact and low in the frame.",
      "Do not block the building silhouette."
    ],
    notes: ["A calmer, more editorial progress update with more breathing room."],
    textZones: ["small topper", "headline", "support sentence", "metric module", "footer line"],
    scaffoldPrompt: `Design a luxury vertical 4:5 Construction Update template with a sunset site-journal aesthetic. The building should rise through the frame while the upper third remains open enough for a refined editorial headline stack. Use one compact lower metric module and one restrained footer line. The overall tone should feel calm, credible, and premium.

This should feel like disciplined developer communication rather than a site report. The photography should remain truthful and construction-real.

Leave clean space for:
- [BRAND NAME]
- [UPDATE HEADLINE]
- [SHORT SUPPORT LINE]
- [COMPACT METRIC MODULE]

Style: editorial site journal, premium construction communication, calm, milestone-led.

Negative prompt: no busy technical report, no exaggerated HDR, no dense metric grid, no cheap builder brochure, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: construction update template preview
Primary request: Design a luxury vertical 4:5 construction update template with a sunset site-journal aesthetic.
Subject: a premium residential construction site with cranes, structure, deck edges, and glazing in progress
Scene/backdrop: sunset-lit real site with open sky and a clear building silhouette
Style/medium: photoreal editorial construction journal poster
Composition/framing: open upper third for headline stack, compact lower metric module, restrained footer line, building remains fully readable
Lighting/mood: calm, milestone-led, premium, sunset-lit
Text (verbatim): "KRISALA DEVELOPERS" "SITE JOURNAL" "Progress taking shape with discipline and clarity" "Latest construction update"
Constraints: no logos, no exaggerated HDR, no dense grid
Avoid: busy technical report, cheap builder brochure, noisy metrics, watermark`
  },
  {
    postTypeCode: "construction-update",
    name: "Construction update · Milestone stamp poster",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Construction update / milestone stamp poster",
    approvedUseCases: ["Construction update", "Milestone communication", "Structural completion update"],
    safeZoneNotes: [
      "Use one badge or milestone stamp, not many.",
      "Keep the milestone statement strong and singular.",
      "Let the building photo carry the trust."
    ],
    notes: ["Strong for slab, tower, facade, or milestone-led updates."],
    textZones: ["brand strip", "headline", "milestone badge", "support line", "footer trust line"],
    scaffoldPrompt: `Create a premium vertical 4:5 Construction Update poster template focused on a milestone moment. Use a real construction photo as the hero and organize the design around one dominant milestone statement, one badge or stamp-like marker, one concise support line, and one footer trust line. The milestone cue should feel elegant, not celebratory in a tacky way.

The layout should keep the site image dominant and the graphic system disciplined. Avoid turning the milestone marker into a loud sticker.

Leave space for:
- [BRAND NAME]
- [MILESTONE HEADLINE]
- [MILESTONE BADGE]
- [SUPPORT LINE]

Style: premium milestone poster, trustworthy construction communication, clean and decisive.

Negative prompt: no cheap badge sticker, no fake-complete building, no overdecorated report style, no random icons, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: construction update template preview
Primary request: Create a premium vertical 4:5 milestone-focused construction update poster with one elegant badge or stamp-like marker.
Subject: a real residential construction site at a visible milestone stage
Scene/backdrop: believable construction-stage building, cranes, rails, exposed structure, warm light
Style/medium: photoreal premium milestone poster
Composition/framing: dominant milestone headline, one refined badge or stamp marker, concise support line, footer trust line, real site image remains central
Lighting/mood: decisive, trustworthy, premium
Text (verbatim): "KRISALA DEVELOPERS" "MILESTONE UPDATE" "Structure progress moving forward with discipline" "Built with clarity"
Constraints: no logos, no cheap sticker styling, no fake-complete tower
Avoid: tacky badge sticker, random icons, fake-complete building, watermark`
  },
  {
    postTypeCode: "construction-update",
    name: "Construction update · Trust metric bulletin",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Construction update / trust metric bulletin",
    approvedUseCases: ["Construction update", "Progress metrics post", "Delivery-trust communication"],
    safeZoneNotes: [
      "Use one well-structured lower bulletin panel.",
      "Keep metric density low enough to stay premium.",
      "Maintain one clean headline area above."
    ],
    notes: ["Useful when the post needs a slightly stronger data system without becoming cluttered."],
    textZones: ["headline", "support line", "bulletin panel", "date note", "footer"],
    scaffoldPrompt: `Generate a premium vertical 4:5 Construction Update template with a trust-focused lower bulletin panel. The image should still be site-photo-led, but the lower portion can hold a slightly richer metrics module, one date note, and one delivery-confidence statement. Keep the panel elegant and spacious, not crowded or dashboard-like.

The overall tone should signal discipline, safety, and methodical progress. Use a brochure-grade hierarchy with the construction image still reading first.

Leave clear structure for:
- [BRAND NAME]
- [UPDATE HEADLINE]
- [SHORT SUPPORT LINE]
- [BULLETIN PANEL]

Style: premium progress bulletin, construction-real, polished and graphically disciplined.

Negative prompt: no generic dashboard UI, no crowded metrics table, no cheap flyer, no fake luxury flare, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: construction update template preview
Primary request: Generate a premium vertical 4:5 construction update template with a trust-focused lower bulletin panel.
Subject: a real premium residential construction site with structure, cranes, railings, glazing work, and truthful progress detail
Scene/backdrop: clean site photo with believable late-day light
Style/medium: photoreal premium progress bulletin poster
Composition/framing: clean headline area above, spacious lower metrics panel, one date note, one delivery-confidence statement, site photo remains primary
Lighting/mood: polished, disciplined, trustworthy
Text (verbatim): "KRISALA DEVELOPERS" "BUILD PROGRESS" "Measured milestones, visible momentum" "Update as of May 2026"
Constraints: no logos, no generic dashboard UI, no dense table
Avoid: crowded metrics table, cheap flyer, fake luxury flare, watermark`
  },
  {
    postTypeCode: "festive-greeting",
    legacyName: "Festive greeting square",
    name: "Festive greeting · Mandala minimal square",
    format: "square",
    aspectRatio: "1:1",
    templateFamily: "Festive greeting / mandala minimal square",
    approvedUseCases: ["Festive greeting", "Elegant square greeting", "Brand-safe celebration post"],
    safeZoneNotes: [
      "Keep the upper and center zones calm for the main festival greeting.",
      "Use brand name as text only in a restrained footer.",
      "Do not invent a logo or emblem."
    ],
    notes: ["A calm square greeting system for elegant, premium festival communication."],
    textZones: ["festival title", "support line", "brand footer"],
    scaffoldPrompt: `Create a premium square festive greeting template with a calm, minimal mandala-led composition. The design should feel elegant, respectful, and modern rather than loud or novelty-led. Use a soft textured background, one large faint mandala or geometric cultural pattern, one main greeting title zone, one support line, and a small brand footer set as text only.

This is a festive greeting template, not a property ad. Do not require project imagery. Keep the symbolism tasteful and the composition spacious.

Leave clear space for:
- [FESTIVAL NAME]
- [SHORT GREETING LINE]
- [BRAND NAME]

Style: premium festive greeting card, calm Indian cultural elegance, minimal, brand-safe.

Negative prompt: no loud promotional clutter, no random logo mark, no neon palette, no property-sales copy, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: festive greeting template preview
Primary request: Create a premium square festive greeting template with a calm minimal mandala-led composition.
Subject: an elegant Onam greeting design with soft cultural patterning and clean text zones
Scene/backdrop: warm neutral textured background with one large faint mandala or cultural geometric pattern
Style/medium: premium festive greeting card design, modern Indian elegance
Composition/framing: main festival title zone in the center or upper-middle, one support line, small brand footer as text only, spacious composition
Lighting/mood: respectful, elegant, calm, premium
Text (verbatim): "ONAM" "A season of homecoming and abundance" "KRISALA DEVELOPERS"
Constraints: no logo mark, no property-ad clutter, no extra icon clutter
Avoid: loud promotional clutter, neon palette, sales copy, watermark`
  },
  {
    postTypeCode: "festive-greeting",
    legacyName: "Festive greeting story",
    name: "Festive greeting · Devotional story card",
    format: "story",
    aspectRatio: "9:16",
    templateFamily: "Festive greeting / devotional story card",
    approvedUseCases: ["Festive greeting", "Story greeting", "Devotional vertical festival card"],
    safeZoneNotes: [
      "Use the central symbolic arrangement as the hero.",
      "Keep festival name and support line high and readable.",
      "Brand name stays small, text-only, low in the frame."
    ],
    notes: ["A vertical story-format greeting with devotional structure and premium restraint."],
    textZones: ["festival title", "support line", "brand signature"],
    scaffoldPrompt: `Design a premium vertical 9:16 festive greeting template with a devotional card-like composition. Use one central symbolic arrangement, a large festival title zone, one refined support line, and a small brand signature set as text only. The mood should be respectful, elegant, calm, and culturally specific without becoming overdecorated.

This is a greeting template, not a sales asset. Do not add project renders, pricing, claims, or property CTAs. Avoid inventing any logo symbol.

Leave space for:
- [FESTIVAL NAME]
- [GREETING LINE]
- [BRAND NAME]

Style: premium devotional greeting poster, culturally respectful, vertical story card, restrained and elegant.

Negative prompt: no extra logos, no sales copy, no cluttered decor, no neon, no mixed-festival symbolism, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: festive greeting template preview
Primary request: Design a premium vertical 9:16 festive greeting template with a devotional card-like composition.
Subject: a respectful Maha Shivaratri greeting with one central symbolic arrangement and premium restraint
Scene/backdrop: calm textured background, faint sacred pattern, central devotional arrangement
Style/medium: premium devotional greeting poster
Composition/framing: large festival title high in the frame, one refined support line, small text-only brand signature low in the layout, central symbolic hero
Lighting/mood: respectful, calm, elegant, premium
Text (verbatim): "MAHA SHIVARATRI" "Devotion, stillness, and reflection" "KRISALA DEVELOPERS"
Constraints: no logo mark, no property-ad clutter, no mixed-festival symbolism
Avoid: sales copy, neon, cluttered decor, watermark`
  },
  {
    postTypeCode: "festive-greeting",
    name: "Festive greeting · Symbolic arrangement poster",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Festive greeting / symbolic arrangement poster",
    approvedUseCases: ["Festive greeting", "Poster greeting", "Symbol-led festive post"],
    safeZoneNotes: [
      "Use one central symbolic arrangement and keep it dominant.",
      "Place the festival title in a clean upper or side zone.",
      "Use brand name as text only."
    ],
    notes: ["Good for Ugadi, Diwali, Ganesh Chaturthi, and other symbol-led festive greetings."],
    textZones: ["festival title", "support message", "brand footer"],
    scaffoldPrompt: `Create a premium vertical 4:5 festive greeting poster template centered on one refined symbolic arrangement. The layout should feel like a luxury greeting poster with a clean title zone, one short support message, tasteful decorative corners or flourishes, and a small text-only brand footer. Keep negative space generous and the symbolism culturally respectful.

Use one hero arrangement only and avoid clutter. The result should feel polished and modern, not like a crowded festival flyer.

Leave space for:
- [FESTIVAL NAME]
- [SHORT GREETING MESSAGE]
- [BRAND NAME]

Style: luxury festive poster, symbolic arrangement hero, calm premium greeting design.

Negative prompt: no loud decorative overload, no random logo emblem, no property-ad content, no messy background, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: festive greeting template preview
Primary request: Create a premium vertical 4:5 festive greeting poster centered on one refined symbolic arrangement.
Subject: an elegant Ugadi greeting with a ceremonial symbolic arrangement, tasteful floral detail, and premium restraint
Scene/backdrop: soft textured background, faint motif, central symbolic arrangement, gentle decorative corners
Style/medium: luxury festive poster, modern Indian greeting design
Composition/framing: clean title zone, one short support message, small text-only brand footer, generous negative space
Lighting/mood: elegant, festive, respectful, premium
Text (verbatim): "UGADI" "A season of new beginnings and prosperity" "KRISALA DEVELOPERS"
Constraints: no logo mark, no property-ad content, avoid clutter
Avoid: decorative overload, messy background, flyer look, watermark`
  },
  {
    postTypeCode: "festive-greeting",
    name: "Festive greeting · Floral frame greeting",
    format: "square",
    aspectRatio: "1:1",
    templateFamily: "Festive greeting / floral frame greeting",
    approvedUseCases: ["Festive greeting", "Floral greeting card", "Elegant celebration post"],
    safeZoneNotes: [
      "Use floral framing at corners only, not across the whole canvas.",
      "Keep the center calm for title and message.",
      "Brand footer remains text-only and subtle."
    ],
    notes: ["A softer greeting-card direction for festival wishes."],
    textZones: ["festival title", "greeting message", "brand footer"],
    scaffoldPrompt: `Generate a premium square festive greeting template with a restrained floral or botanical frame treatment. The design should feel like a luxury greeting card: elegant, spacious, and brand-safe. Use decorative florals or leaves only in the corners or edges, a calm central title zone, one support message, and a small text-only brand footer.

This should feel premium and festive without becoming ornate or overloaded.

Leave space for:
- [FESTIVAL NAME]
- [GREETING MESSAGE]
- [BRAND NAME]

Style: premium floral festive greeting card, elegant, warm, spacious.

Negative prompt: no full-border clutter, no excessive decoration, no logo invention, no property-ad copy, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: festive greeting template preview
Primary request: Generate a premium square festive greeting template with a restrained floral frame treatment.
Subject: an elegant Diwali greeting card with floral corner detailing and calm central typography space
Scene/backdrop: warm premium background, tasteful floral corner framing, subtle festive glow
Style/medium: premium floral festive greeting card
Composition/framing: calm central title zone, one support line, floral framing only at edges or corners, small text-only brand footer
Lighting/mood: warm, elegant, celebratory, premium
Text (verbatim): "DIWALI" "Light, prosperity, and togetherness" "KRISALA DEVELOPERS"
Constraints: no logo mark, no property-ad copy, no clutter
Avoid: full-border clutter, excessive decoration, sales flyer feel, watermark`
  },
  {
    postTypeCode: "festive-greeting",
    name: "Festive greeting · Modern typographic celebration",
    format: "portrait",
    aspectRatio: "4:5",
    templateFamily: "Festive greeting / modern typographic celebration",
    approvedUseCases: ["Festive greeting", "Type-led celebration poster", "Modern brand-safe festive post"],
    safeZoneNotes: [
      "Let typography carry the composition.",
      "Keep decorative cues secondary and controlled.",
      "Use brand name text only."
    ],
    notes: ["Strong when the festive post should feel more graphic and contemporary than devotional."],
    textZones: ["headline", "support line", "micro footer"],
    scaffoldPrompt: `Design a premium vertical 4:5 festive greeting template where typography is the primary hero. Use one bold festival title, one support line, a few subtle cultural or celebratory accents, and a small text-only brand footer. The design should feel contemporary, elegant, and brand-safe, with a strong graphic rhythm but plenty of restraint.

Decorative elements should be minimal and only reinforce the occasion. Do not turn the design into a busy greeting flyer.

Leave text-safe areas for:
- [FESTIVAL NAME]
- [GREETING LINE]
- [BRAND NAME]

Style: contemporary festive poster, type-led premium celebration card, restrained and polished.

Negative prompt: no flyer clutter, no random symbols everywhere, no logo invention, no property-ad content, no watermark.`,
    previewPrompt: `Use case: photorealistic-natural
Asset type: festive greeting template preview
Primary request: Design a premium vertical 4:5 festive greeting template where typography is the main hero.
Subject: a contemporary Ganesh Chaturthi greeting with bold type and subtle cultural accents
Scene/backdrop: clean premium background with very restrained decorative cues
Style/medium: type-led premium celebration poster
Composition/framing: strong festival title, one support line, small text-only brand footer, decorative accents stay secondary
Lighting/mood: polished, contemporary, festive, premium
Text (verbatim): "GANESH CHATURTHI" "Wisdom, grace, and auspicious beginnings" "KRISALA DEVELOPERS"
Constraints: no logo mark, no property-ad content, preserve negative space
Avoid: flyer clutter, random symbols everywhere, over-decoration, watermark`
  }
];

const AMENITY_LEGACY_REMAP = {
  oldName: "Amenity spotlight portrait",
  preferredName: "Amenity spotlight · Full-bleed hero"
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await fs.mkdir(LOCAL_OUTPUT_DIR, { recursive: true });

  const brand = await fetchBrand(BRAND_NAME);
  const ownerUserId = await fetchWorkspaceOwner(brand.workspace_id);
  const postTypeMap = await fetchPostTypeMap(brand.workspace_id);

  console.log(`Generating ${TEMPLATE_LIBRARY.length} post-type template previews for ${brand.name}...`);

  for (const entry of TEMPLATE_LIBRARY) {
    const postTypeId = postTypeMap.get(entry.postTypeCode);
    if (!postTypeId) {
      throw new Error(`Post type not found for ${entry.postTypeCode}`);
    }

    const existing =
      (await fetchTemplateByName(brand.id, entry.name)) ??
      (entry.legacyName ? await fetchTemplateByName(brand.id, entry.legacyName) : null);
    const templateId = existing?.id ?? crypto.randomUUID();
    const fileName = `${slugify(entry.name)}.png`;
    const storagePath = buildStoragePath({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      section: "templates",
      id: templateId,
      fileName
    });

    console.log(`\n→ ${entry.name}`);
    const generated = await generatePreviewImage(entry.previewPrompt, entry.aspectRatio);
    const localPreviewPath = path.join(LOCAL_OUTPUT_DIR, fileName);
    await fs.writeFile(localPreviewPath, generated.buffer);
    await uploadPreviewToStorage(storagePath, generated.buffer, generated.contentType);

    await upsertTemplate({
      templateId,
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      postTypeId,
      createdBy: ownerUserId,
      name: entry.name,
      format: entry.format,
      previewStoragePath: storagePath,
      basePrompt: entry.scaffoldPrompt,
      config: {
        promptScaffold: entry.scaffoldPrompt,
        safeZoneNotes: entry.safeZoneNotes,
        approvedUseCases: entry.approvedUseCases,
        templateFamily: entry.templateFamily,
        outputKinds: ["single_image"],
        defaultSlideCount: null,
        allowedSlideCounts: [],
        seriesUseCases: [],
        carouselRecipe: [],
        notes: [
          ...entry.notes,
          "Template preview generated from a prompt-led poster system. Use as a style anchor, not a source image to copy literally."
        ],
        textZones: entry.textZones.map((name) => ({ name }))
      }
    });

    console.log(`  preview: ${localPreviewPath}`);
    console.log(`  storage: ${storagePath}`);
  }

  await cleanupAmenityLegacyTemplate(brand.id);

  console.log("\nTemplate library generation complete.");
}

async function generatePreviewImage(prompt, aspectRatio) {
  const submission = await fal.queue.submit(falModel, {
    input: {
      prompt,
      aspect_ratio: aspectRatio,
      num_images: 1
    }
  });

  const requestId = submission.request_id;
  if (!requestId) {
    throw new Error("Fal did not return a request id");
  }

  const result = await waitForFalResult(falModel, requestId);
  const imageUrl = result?.data?.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error(`Fal returned no image URL for request ${requestId}`);
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType, imageUrl };
}

async function waitForFalResult(endpoint, requestId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await fal.queue.status(endpoint, { requestId });
    const state = status?.status;

    if (state === "COMPLETED") {
      return fal.queue.result(endpoint, { requestId });
    }

    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(`Fal generation ${state.toLowerCase()} for request ${requestId}`);
    }

    await sleep(2500);
  }

  throw new Error(`Timed out waiting for Fal result ${requestId}`);
}

async function uploadPreviewToStorage(storagePath, buffer, contentType) {
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    upsert: true
  });
  if (error) throw error;
}

async function upsertTemplate({
  templateId,
  workspaceId,
  brandId,
  postTypeId,
  createdBy,
  name,
  format,
  previewStoragePath,
  basePrompt,
  config
}) {
  const payload = {
    workspace_id: workspaceId,
    brand_id: brandId,
    project_id: null,
    post_type_id: postTypeId,
    name,
    status: "approved",
    channel: "instagram-feed",
    format,
    base_prompt: basePrompt,
    preview_storage_path: previewStoragePath,
    template_json: config,
    created_by: createdBy
  };

  const { data: existing } = await supabase
    .from("creative_templates")
    .select("id")
    .eq("id", templateId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("creative_templates").update(payload).eq("id", templateId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("creative_templates").insert({
    id: templateId,
    ...payload
  });
  if (error) throw error;
}

async function cleanupAmenityLegacyTemplate(brandId) {
  const legacy = await fetchTemplateByName(brandId, AMENITY_LEGACY_REMAP.oldName);
  const preferred = await fetchTemplateByName(brandId, AMENITY_LEGACY_REMAP.preferredName);

  if (!legacy?.id || !preferred?.id || legacy.id === preferred.id) {
    return;
  }

  const { error: deliverableError } = await supabase
    .from("deliverables")
    .update({ creative_template_id: preferred.id })
    .eq("creative_template_id", legacy.id);
  if (deliverableError) throw deliverableError;

  const { error: campaignPlanError } = await supabase
    .from("campaign_deliverable_plans")
    .update({ template_id: preferred.id })
    .eq("template_id", legacy.id);
  if (campaignPlanError) throw campaignPlanError;

  const { error: seriesError } = await supabase
    .from("series")
    .update({ creative_template_id: preferred.id })
    .eq("creative_template_id", legacy.id);
  if (seriesError) throw seriesError;

  const { error: deleteError } = await supabase
    .from("creative_templates")
    .delete()
    .eq("id", legacy.id);
  if (deleteError) throw deleteError;
}

async function fetchBrand(name) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, workspace_id, name")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Brand not found: ${name}`);
  return data;
}

async function fetchWorkspaceOwner(workspaceId) {
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.user_id) throw new Error(`No workspace owner found for workspace ${workspaceId}`);
  return data.user_id;
}

async function fetchPostTypeMap(workspaceId) {
  const { data, error } = await supabase
    .from("post_types")
    .select("id, code, workspace_id")
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .eq("active", true);
  if (error) throw error;

  const map = new Map();
  for (const row of data ?? []) {
    if (!map.has(row.code) || row.workspace_id === workspaceId) {
      map.set(row.code, row.id);
    }
  }
  return map;
}

async function fetchTemplateByName(brandId, name) {
  const { data, error } = await supabase
    .from("creative_templates")
    .select("id, name")
    .eq("brand_id", brandId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function buildStoragePath({ workspaceId, brandId, section, id, fileName }) {
  return `${workspaceId}/${brandId}/${section}/${id}/${sanitizeFileName(fileName)}`;
}

function sanitizeFileName(fileName) {
  return fileName.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
