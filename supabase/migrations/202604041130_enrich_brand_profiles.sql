-- Add the richer brand profile structure to existing profile_json rows.

update public.brand_profile_versions
set profile_json = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(profile_json, '{}'::jsonb),
          '{identity}',
          coalesce(
            profile_json->'identity',
            jsonb_build_object(
              'positioning', '',
              'promise', '',
              'marketTier', '',
              'geography', '',
              'audienceSummary', ''
            )
          ),
          true
        ),
        '{visualSystem}',
        coalesce(
          profile_json->'visualSystem',
          jsonb_build_object(
            'typographyMood', '',
            'typographyRules', '[]'::jsonb,
            'compositionPrinciples', '[]'::jsonb,
            'imageTreatment', '[]'::jsonb,
            'iconographyRules', '[]'::jsonb,
            'logoRules', '[]'::jsonb,
            'safeZoneRules', '[]'::jsonb,
            'textDensity', 'balanced',
            'realismLevel', 'elevated_real',
            'motionStyle', ''
          )
        ),
        true
      ),
      '{compliance}',
      coalesce(
        profile_json->'compliance',
        jsonb_build_object(
          'requiredDisclaimers', '[]'::jsonb,
          'bannedClaims', '[]'::jsonb,
          'promiseRestrictions', '[]'::jsonb,
          'reviewChecks', '[]'::jsonb,
          'legalNotes', '[]'::jsonb
        )
      ),
      true
    ),
    '{referenceCanon}',
    coalesce(
      profile_json->'referenceCanon',
      jsonb_build_object(
        'antiReferenceNotes', '[]'::jsonb,
        'usageNotes', '[]'::jsonb
      )
    ),
    true
  ),
  '{recipeFamilies}',
  coalesce(profile_json->'recipeFamilies', '[]'::jsonb),
  true
);

update public.brand_profile_versions
set profile_json = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(profile_json, '{}'::jsonb),
        '{voice,approvedVocabulary}',
        coalesce(profile_json#>'{voice,approvedVocabulary}', '[]'::jsonb),
        true
      ),
      '{voice,ctaStyle}',
      coalesce(profile_json#>'{voice,ctaStyle}', to_jsonb(''::text)),
      true
    ),
    '{voice,writingPrinciples}',
    coalesce(profile_json#>'{voice,writingPrinciples}', '[]'::jsonb),
    true
  ),
  '{voice,approvedExamples}',
  coalesce(profile_json#>'{voice,approvedExamples}', '[]'::jsonb),
  true
);

update public.brand_profile_versions
set profile_json = jsonb_set(
  coalesce(profile_json, '{}'::jsonb),
  '{voice,rejectedExamples}',
  coalesce(profile_json#>'{voice,rejectedExamples}', '[]'::jsonb),
  true
);

-- Enrich the seeded Asteria brand with more operational guidance.
with asteria as (
  select current_profile_version_id as profile_id
  from public.brands
  where name = 'Asteria Developers'
  limit 1
)
update public.brand_profile_versions bp
set profile_json = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  bp.profile_json,
                  '{identity}',
                  jsonb_build_object(
                    'positioning', 'Premium real-estate brand for design-conscious buyers and investors who value credibility over noise.',
                    'promise', 'Make aspiration feel grounded, credible, and architecturally refined.',
                    'marketTier', 'premium',
                    'geography', 'Pune and premium urban growth corridors',
                    'audienceSummary', 'Primary audiences are premium homebuyers, upgrade families, and long-horizon investors seeking trust-led communication.'
                  ),
                  true
                ),
                '{voice,approvedVocabulary}',
                '["architectural","crafted","refined","credible","premium","sunlit"]'::jsonb,
                true
              ),
              '{voice,ctaStyle}',
              to_jsonb('Invitation-led and measured. Prefer site visit, explore, discover, enquire.'::text),
              true
            ),
            '{voice,writingPrinciples}',
            '["Lead with clarity before persuasion","Use premium language without exaggeration","Let trust and materiality carry the message"]'::jsonb,
            true
          ),
          '{voice,approvedExamples}',
          '["Book a private site visit","Discover refined urban living","Explore the location advantage"]'::jsonb,
          true
        ),
        '{voice,rejectedExamples}',
        '["Grab the deal now","Massive launch offer","Guaranteed returns inside"]'::jsonb,
        true
      ),
      '{visualSystem}',
      jsonb_build_object(
        'typographyMood', 'Editorial, restrained, premium serif-sans contrast with disciplined hierarchy.',
        'typographyRules', '["Use few type sizes with strong hierarchy","Avoid shouty all-caps unless the layout truly needs it"]'::jsonb,
        'compositionPrinciples', '["Preserve generous margins","Let architecture or space carry the frame","Use asymmetry carefully, not chaotically"]'::jsonb,
        'imageTreatment', '["Warm natural light","Premium realism","Avoid overprocessed HDR contrast"]'::jsonb,
        'iconographyRules', '["Use minimal iconography only when it adds clarity","Avoid cartoonish, meme-like, or dashboard icons"]'::jsonb,
        'logoRules', '["Keep the logo restrained","Do not let the logo crowd the headline or hero image"]'::jsonb,
        'safeZoneRules', '["Leave safe room for project name and CTA","Protect headline zones from busy textures or hard architectural lines"]'::jsonb,
        'textDensity', 'balanced',
        'realismLevel', 'elevated_real',
        'motionStyle', 'Minimal, calm, and premium.'
      ),
      true
    ),
    '{recipeFamilies}',
    '[
      {
        "name": "Launch hero",
        "description": "Architecture-led cover for launches and high-importance announcements.",
        "useCases": ["project launch", "hero announcement"],
        "layoutPrinciples": ["Large hero image", "Strong headline block", "Minimal CTA"],
        "allowedPlatforms": ["instagram", "facebook", "linkedin"],
        "allowedSlideCounts": [],
        "outputKinds": ["single_image"]
      },
      {
        "name": "Amenity spotlight",
        "description": "One amenity or lifestyle feature framed with premium restraint and spatial clarity.",
        "useCases": ["amenity highlight", "lifestyle proof"],
        "layoutPrinciples": ["One focal image", "Short supporting copy", "Space around feature callouts"],
        "allowedPlatforms": ["instagram", "facebook", "linkedin"],
        "allowedSlideCounts": [2,3,4,5],
        "outputKinds": ["single_image","carousel"]
      },
      {
        "name": "Location advantage",
        "description": "Trust-led card or carousel about commute, context, and business credibility.",
        "useCases": ["location proof", "city context", "connectivity fact"],
        "layoutPrinciples": ["Clear hierarchy", "Fact-led subcopy", "Avoid cluttered map overload"],
        "allowedPlatforms": ["instagram", "linkedin", "facebook"],
        "allowedSlideCounts": [3,4,5,6],
        "outputKinds": ["single_image","carousel"]
      }
    ]'::jsonb,
    true
  ),
  '{compliance}',
  jsonb_build_object(
    'requiredDisclaimers', '[]'::jsonb,
    'bannedClaims', '["guaranteed returns","assured appreciation","risk-free investment"]'::jsonb,
    'promiseRestrictions', '["Do not imply possession dates or pricing certainty without approved facts","Do not make investment promises beyond approved claims"]'::jsonb,
    'reviewChecks', '["Verify all claims against approved project facts","Check tone stays premium and non-pushy","Ensure layouts preserve safe zones for brand and CTA"]'::jsonb,
    'legalNotes', '[]'::jsonb
  ),
  true
)
from asteria
where bp.id = asteria.profile_id;

with asteria as (
  select current_profile_version_id as profile_id
  from public.brands
  where name = 'Asteria Developers'
  limit 1
)
update public.brand_profile_versions bp
set profile_json = jsonb_set(
  bp.profile_json,
  '{referenceCanon}',
  jsonb_build_object(
    'antiReferenceNotes', '["Avoid startup-dashboard aesthetics","Avoid cheap brochure clutter","Avoid neon or flashy SaaS gradients"]'::jsonb,
    'usageNotes', '["Use approved project and brand references before generic inspiration","Prefer architecture, light, and materiality over decorative clutter"]'::jsonb
  ),
  true
)
from asteria
where bp.id = asteria.profile_id;
