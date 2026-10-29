# Validation record

Local results with Node.js 24 on Linux.

| Check                                | Result                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean locked dependency install      | `npm ci` succeeded                                                                                                                                                                                                                                                                                        |
| Lint / TypeScript / build            | `npm run check` passed                                                                                                                                                                                                                                                                                    |
| Unit and real SQLite/API integration | 52 tests passed: 47 for the application rules and API, including eligibility, organisation-number check digits, exact deadline boundaries, closed-round draft saving, receipt retry after the cutoff and simultaneous submits from four separate processes, and 5 for the reporting and diagnosis tooling |
| Full Playwright matrix               | 16 scenarios × Chromium, Firefox and WebKit = 48 passes on the first attempt, no retries; 35 seconds on this machine                                                                                                                                                                                      |
| Pull request selection               | All 11 tagged Chromium smoke/accessibility cases passed                                                                                                                                                                                                                                                   |
| Automated accessibility              | No axe violations in eight critical states across all three browsers; keyboard error recovery at a 390px viewport passed                                                                                                                                                                                  |
| Workflow syntax                      | `actionlint` v1.7.12 accepted the GitHub Actions workflow                                                                                                                                                                                                                                                 |
| Formatting                           | `npm run format:check` passed                                                                                                                                                                                                                                                                             |
| Diagnosis packet                     | A deliberately failing test produced a packet with its assertion signal and API request statuses; a passing run produces none. The local-model call is unit-tested against a stand-in for Ollama                                                                                                          |
| Responsive layout                    | No horizontal overflow at a 390px viewport; no uncaught page errors                                                                                                                                                                                                                                       |

## Defects found and fixed

The first browser run found two real accessibility defects in the application:

- **A banner outside any landmark region** (axe). Screen-reader users navigating by landmarks would miss it.
- **Focus moving away while correcting a validation error** (keyboard test). The user lost their place in the form.

A real multi-process test found a concurrency defect:

- **Simultaneous submissions failed with "database is locked".** Four processes submitting the same application at once: one succeeded, the others errored, so an applicant would see a failure for an accepted submission. An earlier in-process test had missed this because a single process runs requests one at a time. Fixed by letting connections wait for the lock and by checking that every conditional update actually changed a row.

A later layout revision surfaced three more:

- **Duplicate names on complementary landmarks**, so screen readers announced two regions identically.
- **Validation links placed too close together** to be comfortable click and touch targets.
- **A floating action bar covering keyboard-focused controls** at a narrow viewport. Replaced with an action area in the normal document flow.

All six were fixed in the product, not by weakening the tests, and the full matrix passed afterwards. The failing run produced screenshots, video, traces and structured request evidence, which is how the diagnostic configuration is meant to be used.

## Not yet covered by these results

One passing run does not establish a long-term flaky rate or WCAG conformance. Manual assistive-technology testing is planned, not completed, and the local-model diagnosis has not been run against a real model.
