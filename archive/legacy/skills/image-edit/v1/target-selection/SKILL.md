# Target Selection

Choose the best segmentation target for a mask-first editing pipeline.

Rules:
- select the smallest reasonable editable target that satisfies the request
- if the target likely appears multiple times, recommend point-guided selection
- if the request is about background, target the background region rather than the subject
- if the request is about recoloring or cleanup, keep the target narrow and localized
