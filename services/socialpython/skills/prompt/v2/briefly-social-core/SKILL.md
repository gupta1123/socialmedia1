---
name: briefly-social-core
description: Core operating system for Briefly Social. Separates post intent from design style, defines priority order, handles external visual inputs, and sets finished-poster defaults.
metadata:
  version: "5.1.0"
  tags: ["real-estate", "social-media", "core", "style-first", "poster-system"]
---

# Briefly Social Core

Use this skill for every Briefly Social creative task.

## Mission
Create a brand-right, asset-grounded, poster-grade real-estate social creative that:
- preserves factual and visual truth
- matches the communication job of the post
- chooses a deliberate design style instead of defaulting to repeated layouts
- uses a structured visual system rather than "nice building image + text"
- feels like a finished campaign asset when finished_poster mode is expected

## Fundamental Model
post = communication_job × payload × asset_mode × style_family × style_modifiers × lever_bundle × truth_constraints

For ad posts, also resolve:
- commercial_hook
- visual_mechanism

These do not replace the poster system. They narrow the conversion hierarchy inside it.

## Critical Separation
Do not confuse these:

### 1) Post Type / Communication Job
This answers: what is the post trying to do?
Examples:
- project_launch
- construction_update
- festival_post
- amenity_spotlight
- site_visit_invite
- testimonial
- ad

### 2) Design Style
This answers: how should the creative visually behave?
A post type does not own a single style.
Any suitable post type can use different style families if the payload, asset, and market tone fit.

### 3) Asset Mode
This answers: what visual anchor is available?
Examples:
- single tower
- villa
- township aerial
- amenity
- candid site presence
- symbolic graphic-led

### 4) Payload Architecture
This answers: how text/data must be organized.
Examples:
- slogan-first
- scarcity-first
- footer-heavy
- quote-led
- one-statement poster

## Priority Order
1. asset truth / project truth / compliance truth
2. explicit brief instructions
3. communication job of the post
4. post-type contract
5. chosen style family
6. chosen lever settings
7. brand truth
8. creative flourish

## Commercial Fact Grounding
Commercial facts are project truth, not optional copy decoration.
They are also not a menu of claims to add by default. Use them when the original brief asks for that fact type or when an explicit grounding obligation requires it.

When available project commercial facts are supplied and the brief asks for price, starting price, offer, booking amount, payment plan, area, size, or configuration:
- use the exact supplied values
- do not paraphrase numeric values, currency values, carpet areas, dates, or payment percentages
- do not replace exact available values with generic phrases like "pricing information", "starting price text", "offer details", or "commercial hook"
- do not invent missing commercial facts
- if `startingPrice` exists and the brief asks to show price or starting price, the final prompt must include that exact starting price value
- if `priceRangeByConfig` exists and the brief asks for configuration-wise pricing, use only the listed configuration-price lines
- if `sizeRanges` exists and the brief asks for area, carpet area, or home size, use the exact listed range
- if `currentOffers` exists and the brief asks for offers or booking benefits, use only the listed offers
- if `currentOffers` is empty and the brief asks for offers, keep the hierarchy generic without inventing an offer
- if `reraNumber` exists and the brief asks for RERA/compliance, use the exact listed number
- if location facts exist and the brief asks for location/landmarks/connectivity, use only the listed locality, landmark, or travel-time facts

Commercial fact obligations may be used even when no manual exact text was supplied. They are grounded project data, not user-invented copy.

## External Visual Inputs

### reference image
Treat a reference image as an identity or scene anchor.
Use vision to understand:
- what the image actually shows
- whether the strongest hero is one building, many buildings, an amenity, or a candid scene
- whether a tighter crop, lower angle, clearer hierarchy, or safer realism upgrade will help

Allowed improvements:
- crop
- emphasis shift
- angle refinement
- realism / lighting polish
- atmosphere
- editorial finish

Not allowed:
- changing architecture identity
- changing construction state
- inventing towers, amenities, or scale
- using the template look to override the reference truth

### template image
Treat a template image as a style and composition cue only.
It may influence:
- layout behavior
- graphic layer language
- type mood
- density
- poster finish

It must not:
- override project identity
- replace the reference image as truth anchor
- force the wrong post behavior
- create a copy-paste imitation when the asset fit is weak

### logo image
Treat a logo image as an exact brand mark.
Preserve:
- symbol shape
- lockup
- relative balance
- recognisable character

Do not:
- stylize
- rewrite
- distort
- invent alternate marks

## Universal Rules
1. Never invent project facts.
2. Never swap project identity.
3. Never treat an unavailable asset as if it exists.
4. Never use premium styling to justify generic luxury clichés.
5. Never beautify a real construction or site image to the point of falsification.
6. Never choose a visually interesting direction that weakens the post's actual job.
7. Never compensate for weak inputs by inventing unverified specifics.
8. Never force the same composition across all projects.
9. If a logo image is provided and exact fidelity is required, reproduce it exactly and keep the lockup intact.
10. Keep the post anchored around one dominant selling idea unless the brief explicitly requires a multi-message layout.
11. Never default to a plain hero image with normal text overlay.
12. Never solve a social poster by simply placing a building image and adding a generic headline.
13. Do not use empty sky or generic clean space as a substitute for real poster composition.
14. Poster-grade outputs must show deliberate hierarchy, composition logic, and design behavior.
15. If the result could be described as "just a nice render with text", it is a failure.
16. Design style must be selected intentionally and explained through visible composition choices.
17. Do not tie style too rigidly to post type; tie it to the job, asset, and payload fit.
18. When a reference image exists, truth follows the reference image first unless the brief explicitly says otherwise.
19. When a template image exists, style follows the template only as far as truth allows.
20. When a logo image exists, logo fidelity is stricter than creative flourish.

## Delivery Strategy
Choose one:
- finished_poster
- base_visual

### Default Rule
For Briefly Social, default to:
- delivery_mode = finished_poster

Use `base_visual` only when the brief explicitly asks for:
- clean text-safe background only
- background plate
- no in-image copy
- render to be designed later elsewhere
- base hero asset only

### Finished Poster Rules
If delivery_mode = finished_poster:
- style_family is mandatory
- lever bundle is mandatory
- copy/image hierarchy is mandatory
- final prompt must describe a finished social asset, not an empty visual waiting for design later
- exact text or strongly implied copy structure should be compositionally integrated

### Base Visual Rules
If delivery_mode = base_visual:
- do not accidentally drift into finished-poster instructions
- allow clean image-led treatment
- avoid pseudo-poster language

## Poster Grade Requirement
For:
- project_launch
- construction_update
- festival_post
- amenity_spotlight
- site_visit_invite
- testimonial
- location_advantage
- ad

the default expectation is a finished poster-grade output.

A poster-grade output must:
- choose a style family
- choose clear style primitives / levers
- show one dominant idea
- have visible hierarchy at first glance
- use the project/image as part of a designed composition, not as a plain background
- include a graphic-design layer or strong compositional device
- feel like a finished social asset, not an intermediate render

Reject outputs that feel like:
- plain hero image
- scenic architectural render
- building photo plus generic text
- nice image with some copy
- same template with different project names

## Strategic Framing by Post Type

### project_launch
- business_job: introduce the project, create desire, establish identity, create memorability
- persuasion_modes: aspiration, prestige, exclusivity, optimism, serenity, address_pride, quiet_luxury
- mistakes:
  - township explainer feel
  - brochure page feel
  - too many equal subjects
  - feature-list-as-idea
  - scenic render mistaken for a finished launch creative
  - repeated launch patterns regardless of project fit

### construction_update
- business_job: prove progress, build trust, show motion without exaggeration
- persuasion_modes: trust, credibility, transparency, confidence
- mistakes:
  - launch-ad feel
  - polishing beyond truth
  - hiding actual state
  - construction photo with simple caption instead of a designed update poster

### festival_post
- business_job: maintain branded presence, build warmth, stay culturally relevant
- persuasion_modes: warmth, elegance, ceremony, calm delight
- mistakes:
  - greeting-card clutter
  - Canva feel
  - forcing project imagery where symbolic treatment is stronger
  - decorative noise without hierarchy

### testimonial
- business_job: build trust, humanize the project, convert social proof into desirability
- persuasion_modes: trust, reassurance, warmth, quiet confidence
- mistakes:
  - generic quote card
  - stock-family cliché
  - text-heavy flyer feel
  - weak editorial hierarchy

### ad
- business_job: stop scroll, communicate one clear value proposition, drive inquiry without killing brand
- persuasion_modes: clarity, urgency, exclusivity, aspiration, curiosity
- mistakes:
  - cheap lead-gen styling
  - too many offers
  - pretty image but no usable ad hierarchy
  - generic promo poster feel

### ad mechanism layer
For ad posts, decide:
- commercial_hook: what sells the ad
- visual_mechanism: what visible device carries that hook

Use only one dominant hook.

Suggested commercial_hook values:
- price
- visit
- location
- amenity
- configuration
- offer
- investment
- trust
- compliance
- credibility

Suggested visual_mechanism values:
- price_billboard
- comparison_cards
- visit_ticket
- location_receipt
- offer_strip
- value_stack
- trust_seal
- compliance_footer
- credibility_band

The hook should stop the scroll. The mechanism should make that hook obvious at a glance.

### commercial fact grounding
Use the original brief intent to decide which project facts are allowed.

Return these structured fields when project/commercial facts are available:
- requested_fact_types: fact kinds the original brief directly asks for, such as price, configuration, area, offer, rera, contact, location, possession, website
- allowed_fact_kinds: the maximum fact kinds final prompts may mention
- required_fact_copies: exact fact strings from project truth or the brief that final prompts must include
- disallowed_available_fact_kinds: available fact kinds that were not requested
- do_not_use_unless_requested: exact available facts to keep out unless their kind is requested

Do not use available project facts as optional filler. If the brief asks for prices, use exact price facts. If it asks for RERA or compliance, use exact RERA facts. If it only asks for a trust-led or credibility-led ad, do not pull in prices, locations, area, contact, or RERA merely because those facts exist.

Do not over-require facts:
- configuration-wise pricing brief -> require only the exact requested configuration price values
- starting price brief -> require only the exact starting price value
- carpet area brief -> require only the exact area value
- RERA/compliance brief -> require only the exact RERA value
- "show only X" or "do not show Y" -> keep Y in disallowed_available_fact_kinds and do_not_use_unless_requested

Never place payment plan, location advantages, landmarks, RERA, contact, website, offers, area, or starting price into required_fact_copies merely because the facts are available.

### site_visit_invite
- business_job: show real on-ground presence, create credibility and human connection
- persuasion_modes: authenticity, activity, trust, engagement
- mistakes:
  - event album feel
  - plain candid image with weak label treatment
  - generic corporate snapshot styling

### amenity_spotlight
- business_job: highlight one specific amenity as a lifestyle benefit
- persuasion_modes: lifestyle_desire, aspiration, family_warmth, quiet_luxury, community
- mistakes:
  - feature-list behavior
  - hiding the amenity behind building hero
  - plain amenity image with normal title only

### location_advantage
- business_job: prove the project's strategic position through proximity to key landmarks, connectivity, and access
- persuasion_modes: social_proof, clarity, confidence, practicality
- When a location map image is supplied as a reference asset:
  - Include it in reference_image_paths alongside the project hero image
  - reference_usage_plan must describe how to use BOTH the project image AND the location map
  - The split-panel layout should show project hero on one side and the location map on the other
- When NO location map is supplied:
  - Use a split-panel or split-context proof archetype with project hero and a stylized connectivity graphic
  - Describe landmark positions and distances using verified travel-time facts
- layout_geometry: split_panel, left_copy_right_hero, right_copy_left_hero, claim_panel_side_crop, or balanced_card_layout
- Mistakes:
  - Using a single-hero archetype that shows only the project without location context
  - Inventing unverified landmarks or travel times
  - Creating a raw map screenshot without design treatment
  - Map dominating the project hero instead of supporting it

## Required Output Contract
Return structured decisions for:
- post_type
- business_job
- persuasion_modes
- delivery_mode
- poster_archetype
- commercial_hook
- visual_mechanism
- requested_fact_types
- allowed_fact_kinds
- required_fact_copies
- disallowed_available_fact_kinds
- do_not_use_unless_requested
- style_modifiers
- hero_presentation
- layout_geometry
- graphic_layer
- type_voice
- text_architecture
- mood_mode
- density
- brand_visibility
- truth_to_preserve
- asset_strategy
- required_data
- forbidden_moves
- fallback_plan
- final_prompt

## Universal Failure Modes
Revise if:
- wrong business job
- wrong persuasion mode
- weak hero
- genericized architecture
- no obvious hierarchy
- too many ideas competing
- brochure-spread feel
- fake premium tone
- device overwhelms project
- footer destroys readability
- stale repeated pattern
- weak fallback handling
- plain hero image + ordinary text behavior
- output feels like a base visual instead of a finished social asset
