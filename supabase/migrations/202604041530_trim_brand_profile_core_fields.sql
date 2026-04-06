-- Trim brand profiles back to the core fields that materially guide generation.

update public.brand_profile_versions
set profile_json = (
  (
    profile_json
    #- '{identity,marketTier}'
    #- '{identity,geography}'
    #- '{voice,ctaStyle}'
    #- '{voice,writingPrinciples}'
    #- '{voice,approvedExamples}'
    #- '{voice,rejectedExamples}'
    #- '{visualSystem,typographyRules}'
    #- '{visualSystem,iconographyRules}'
    #- '{visualSystem,logoRules}'
    #- '{visualSystem,safeZoneRules}'
    #- '{visualSystem,motionStyle}'
    #- '{compliance,requiredDisclaimers}'
    #- '{compliance,promiseRestrictions}'
    #- '{compliance,legalNotes}'
  ) - 'preferredFormats'
);
