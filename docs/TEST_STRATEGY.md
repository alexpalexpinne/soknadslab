# Quality strategy

The business promise is simple: an applicant can keep their work, submit valid information once, and trust the receipt and the read-only state that follows. I started from what could break that promise, then chose the cheapest test level that can prove each risk is handled. Likelihood below is my design estimate, not production incident data.

## Risks before automation

| ID  | Risk                                | Business impact                                    | Likelihood | Appropriate level             | Automation                                                                              |
| --- | ----------------------------------- | -------------------------------------------------- | ---------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| R1  | Lost draft work                     | Applicant effort lost; missed deadline             | High       | API persistence + focused E2E | Save/reopen/reload journey and database reopen test                                     |
| R2  | Invalid or ineligible submission    | Unprocessable or ineligible request accepted       | High       | Unit rules + API + E2E        | Stage decision table and input boundaries below UI; focused error/recovery tests        |
| R3  | Duplicate submission                | Multiple receipts / repeated processing            | Medium     | API transaction + E2E         | Simultaneous submits from separate processes and UI double-click; assert one receipt    |
| R4  | Edit after submission / stale state | Integrity of submitted record compromised          | High       | API + E2E                     | Reject save/upload from stale clients; read-only view and Back navigation               |
| R5  | Invalid or failed attachment        | Missing evidence; earlier document lost            | Medium     | Unit + API + E2E              | Type/size/header checks and failed replacement preserving prior file                    |
| R6  | Save or submit response lost        | False confidence, lost work or ambiguous status    | High       | Fault-injected E2E + API      | Fail before save; lose submit response after commit; reconcile by GET                   |
| R7  | Accessibility regression            | Applicants cannot complete the journey             | High       | axe + keyboard + manual       | Critical states scanned; keyboard error recovery; manual assistive-tech review          |
| R8  | Unreliable tests                    | Broken releases accepted or good releases blocked  | Medium     | Test engineering / CI         | Isolated workspaces, deterministic data, no sleeps; track retries and preserve evidence |
| R9  | Concurrent stale draft overwrite    | Another tab's changes silently disappear           | Medium     | API + focused E2E             | Revision conflict rejects mutation and keeps the local form visible                     |
| R10 | Wrong deadline enforcement          | Late applications accepted or timely work rejected | Medium     | Unit + API transaction + E2E  | Exact cutoff boundaries, stale open form and safe receipt retry after closure           |
| R11 | Load peak just before the deadline  | Slow or failed submissions when it matters most    | High       | Performance test (separate)   | Not automated here; see below                                                           |

## Programme rules

- **Eligibility:** a project must be at the development stage to be submitted. Blank, production and completed stages can be saved as drafts but not submitted, and no entered values are discarded. The API enforces this independently of the form.
- **Deadline:** the round closes **30 November 2027 at 13:00 Europe/Oslo** (`2027-11-30T12:00:00.000Z`). The server checks its own clock inside the submission transaction: one millisecond before is accepted, the exact cutoff and later are rejected. The browser's clock cannot grant permission.
- **After closing:** no new applications can be started. Existing drafts, including attachments, remain editable and saveable but cannot be submitted. A form left open across the deadline gets a clear rejection and keeps its entries.
- **Receipt retries:** an application accepted before the deadline returns its original receipt on retry, even after closing. A transport retry must never look like a failed submission or replace accepted data.
- **Editing after submission:** I chose immediate locking for this programme. Some grant schemes allow changes after submission until the deadline; on a real platform that is a per-scheme policy, and R4's rejection assertions depend on which policy applies.

The deadline date is fictional and far enough ahead that the demo stays open. Tests never depend on it: they use an injected clock.

## Test levels and why they exist

- **Unit:** submission rules, project-stage decisions, exact deadline instants and attachment boundaries. Cheap, exact feedback; I don't retest every boundary through a browser.
- **API/integration:** the real Express app and SQLite store in disposable databases. Eligibility, deadline rejection without side effects, post-deadline saving, receipt retries, persistence after reopening the database, concurrent requests, revisions and guards on every mutation. A read-only UI cannot prove API integrity, so these tests carry most of the integrity work.
- **End-to-end:** the connected applicant journey and recovery behaviour. Focused scenarios set up valid drafts through the API; only the happy path walks through every step.
- **Accessibility:** axe scans login, dashboard, programmes, guidance, form, validation errors, receipt and a closed draft. A keyboard test covers skip navigation, controls at a narrow viewport, error focus and stage selection. This catches a subset of WCAG issues, not full conformance.
- **Component:** I left this layer out deliberately. A simple native form has little component logic of its own, and error focus and interaction are covered in the browser. I'd add it when reusable widgets or conditional sections appear, not to fill a layer.
- **Performance:** many applicants submit in the last hours before a deadline, so the peak load arrives exactly when a failure costs the most. This demo runs on one local SQLite process, and a load test against it would say nothing about a real platform. On a real platform I would model the deadline peak from historical submission times and run it against a production-like environment before major rounds, tracking submit latency and error rate. R3 and R10 already cover correctness under contention; R11 is about capacity.
- **Exploratory/manual:** screen readers (NVDA/VoiceOver), 200–400% zoom and reflow, file selection on mobile, slow connections, two-tab conflict recovery, wording and real user testing.

## Architecture decisions that make quality testable

- **Explicit save:** no hidden autosave promises to test or explain.
- **Permissive drafts, strict submission:** the server owns the state transition.
- **Atomic submission:** one SQLite update changes fields, status and receipt together; repeating submit returns the existing record. Competing connections wait for the lock instead of failing, and every update only applies if the revision still matches.
- **Revisions:** stale saves and uploads are rejected, and submitted-state checks run before any change.
- **Reconciliation:** after an uncertain submit response, the client reads the authoritative status. If that also fails, it explains the uncertainty and a retry is safe.
- **Attachments:** the server repeats validation; a failed replacement leaves the existing file intact.
- **Leave warnings:** they cover the return link, portal navigation and browser unload. Unsaved work can still be lost if the browser crashes; that is a visible, intentional limit of explicit saving.

## Automation standards and gates

- **Locators and waits:** Playwright tests use labels, roles and visible behaviour, never CSS layout selectors or fixed timeouts.
- **Isolation:** each test signs into a fresh workspace with its own cookies and server-generated draft IDs. There is no global reset endpoint and no dependency on test order. Network faults are injected only against local requests, and the test fixture blocks any request leaving the local origin.
- **Time:** the normal test server runs with a fixed clock one minute before the deadline. The [deadline fixture](../tests/fixtures/policy.ts) starts a separate real Express/SQLite server per test with an injected clock, and advances it while the browser form is open. That makes it a real backend rejection, not a mocked response, without exposing an HTTP clock-control endpoint.
- **Evidence:** traces and video are kept on failure, along with screenshots, the HTML report and structured JSON.
- **Gates:** pull requests run lint, TypeScript, unit/API tests, the build and Chromium smoke plus accessibility. Main and the weekly run execute the full Chromium, Firefox and WebKit matrix. One retry is allowed for diagnosis, but a flaky pass still fails the gate. Two workers and small data sets keep the run short.

## Useful metrics

Coverage pointers: R1/R2/R4 → [application journeys](../tests/application/application.spec.ts); R2 → [eligibility recovery](../tests/application/eligibility.spec.ts); R3/R5/R6/R9 → [reliability scenarios](../tests/reliability/reliability.spec.ts), [API integrity checks](../tests/fast/api.test.ts) and [multi-process submission](../tests/fast/concurrency.test.ts); R2/R5/R10 → [rule boundaries](../tests/fast/domain.test.ts); R10 → [deadline passing in an open form](../tests/reliability/deadline.spec.ts); R7 → [axe and keyboard checks](../tests/accessibility/accessibility.spec.ts); R8 → [isolated fixtures](../tests/fixtures/test.ts), [diagnostic configuration](../playwright.config.ts) and [CI gates](../.github/workflows/quality.yml).

| Metric                      | Definition / source                                                        | Decision it supports                                                  |
| --------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Critical journey pass rate  | First-attempt passes / executed smoke cases, per browser and revision      | Whether core applicant promises are intact                            |
| Regression duration         | Reporter wall time, by suite/browser, trend over comparable CI runners     | Whether feedback still fits the release loop                          |
| Flaky test rate             | Cases failing first attempt then passing retry / executed cases            | Reliability maintenance; retries are not hidden successes             |
| Failure categories          | Human-reviewed product, environment, test, accessibility or unknown        | Route investigation; don't infer root cause from exception text alone |
| Time to diagnose            | Failure detected to evidence-backed classification, recorded during triage | Whether traces and request evidence reduce investigation cost         |
| Accessibility violations    | Rule + affected state; axe attachments, with manual findings separately    | Prioritise barriers and detect regression                             |
| Escaped defects             | Confirmed post-release defects mapped to risk and severity                 | Adjust tests and assumptions                                          |
| High-risk workflow coverage | R1–R10 mapped to named tests plus manual checks                            | Reveal gaps without implying exhaustive coverage                      |

The custom reporter produces pass rate, duration and flaky outcomes automatically from each run. Failure categories, diagnosis time, escaped defects and manual accessibility results come from real triage records.

I deliberately don't treat raw test count or line coverage as quality goals. Test count rewards duplication, and line coverage shows that code ran, not that an important applicant outcome was asserted. Both help find gaps; neither replaces risk coverage.

## Release decision

Any failed critical behaviour, flaky case or automatically detected accessibility violation blocks the gate. Unfamiliar failures are reviewed by a person rather than accepting an AI classification.

Next risks I would add on a real platform: applicant representation (a personal account must not be mistaken for an organisation), per-scheme eligibility and availability, multiple rounds, different attachment categories, and a configurable editing-after-submission policy. Each belongs mainly at API level, with a few focused UI checks explaining why an applicant can or cannot apply.
