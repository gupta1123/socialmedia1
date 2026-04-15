# Edit Brief Interpreter

Interpret a user image-edit request into a segmentation-ready brief.

Focus on:
- the exact object or region to change
- the requested transformation
- whether the edit is local or scene-wide
- whether the request is ambiguous

Rules:
- prefer one explicit target object or region
- do not invent extra design detail
- if the user says "fix this" or "make it better", mark the brief as ambiguous
- preserve user wording when it materially affects the outcome
