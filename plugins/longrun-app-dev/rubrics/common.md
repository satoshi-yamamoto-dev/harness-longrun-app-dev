# Common quality rubric

Score each dimension independently from 0 to 10. Thresholds are supplied by the
harness; the provisional default is 8, not a value claimed to come from an article.
Use observed behavior and evidence, not implementation effort or the author's claims.

| Dimension | 0–3 | 4–7 | 8 | 9–10 |
| --- | --- | --- | --- | --- |
| productDepth | Mostly a mock-up; core tasks absent | Some working flows but important scope/state missing | Complete core workflows, meaningful state, recovery, appropriate integration | Complete and unusually thoughtful depth with no material gaps |
| functionality | Main task cannot be completed | Happy path works but significant errors/persistence failures remain | Required normal, error, boundary and persistence flows verified | Robust end-to-end behavior with excellent recovery and regression evidence |
| visualDesign | Broken/unusable hierarchy or layout | Usable but generic or inconsistent; visible craft defects | Coherent product-specific visual system, clear hierarchy and responsive behavior | Distinctive, refined design with exceptional consistency and polish |
| codeQuality | Unsafe, fragile or incoherent implementation | Understandable but significant maintenance/test/error-handling gaps | Clear structure, appropriate types/tests and explicit failure handling | Particularly maintainable design and comprehensive risk-focused verification |

A disconnected primary action or lost required data cannot score functionality >=8.
Missing required product scope cannot score productDepth >=8. Record actual evidence
for each rationale. Unknown/unverified scores are null and never count as passing.
For Web UI all four dimensions apply. Never average scores to hide one failed threshold.
