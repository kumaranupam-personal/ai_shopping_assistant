# Label corrections

Changes to the human labels in `labeling-sheet.xlsx` after they were committed (084fde9), each with its reason. Every correction here was made **after seeing the judge's verdicts** on the calibration rows (judge `afc7fd28587f`, committed in 0be3499), and only where a label contradicted the rubric's own rules in `docs/07-evaluation.md`. Labels where the labeler and the judge reasonably differ were left as they were, and no held-out row was changed.

## 2026-10-14, after calibration round 1

| Row | Criterion | Before | After | Reason |
|---|---|---|---|---|
| T03 | Language and style | pass | fail | The user wrote in English and the reply is in Hinglish (rule 13). |
| T06 | Helpfulness | pass | fail | The reply only restates the request and what the cards show. |
| T14 | Helpfulness | fail | pass | It names a pick without a reason, which D1 passes. |
| T15 | Language and style | pass | fail | 56 words, over D4's 55. |
| T20 | Helpfulness | fail | pass | It names a pick without a reason, which D1 passes. |
| T24 | Clarification quality | pass | fail | It asks two questions (kind of gift and budget) where the rubric allows one. |
| T28 | Clarification quality | pass | n/a | Products were shown, so the reply isn't a clarifying question. |
| T35 | Language and style | pass | fail | The reply uses bold Markdown, and the rubric requires plain text. |
| T53 | Faithfulness | pass | fail | It says UrbanStep Glide (₹5,199) costs less than the rest, but two shown pairs cost about ₹3,000. |
| T54 | Faithfulness | pass | fail | It calls the UrbanSling bags the best rated, but Himpack Nova, shown with them, is rated 4.8. |

Not changed: the faithfulness labels made before decision D9 (T16, T20, T32, T41, T48, still n/a), and the rows where the labeler and the judge disagree on a judgment call (T01, T18, T41, T48).
