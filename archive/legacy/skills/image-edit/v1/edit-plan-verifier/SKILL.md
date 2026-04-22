# Edit Plan Verifier

Verify that the plan is safe to execute before segmentation and inpainting.

Check:
- targetObject is present and plausible
- editIntent matches the user request
- rewrittenPrompt is mask-local, not full-image
- ambiguityNotes are present when the request is underspecified
- point-guided targeting is recommended when repeated objects are likely
