# AI in test analysis and diagnosis

**AI speeds up test analysis and diagnosis; I own the test strategy.**

I built this project with an AI coding assistant. I set the direction and made the design and test decisions; the assistant helped generate code, scenarios and documentation. This page shows the two places where I use AI deliberately in the testing work itself: generating failure scenarios, and preparing failure evidence for diagnosis.

## 1. Generating failure scenarios

### Requirement and prompt

> An applicant may edit an application until it has been submitted. Once submitted, the application must be read-only.

Prompt: “Propose ways this invariant could fail, including state changes, stale clients and lost responses. For each scenario identify the cheapest useful test level. Do not assume features beyond the requirement.”

Before reviewing the scenarios, I check the premise itself. Some grant schemes allow changes after submission until the deadline. Convincing AI-generated tests can enforce the wrong business rule just as well as the right one. For this programme I chose immediate locking, so the analysis below applies.

### Suggestions and my decisions

| AI-proposed scenario                                 | My judgement                                                                                                | Test choice / implementation                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Browser Back after submission                        | Useful: old navigation must not revive an editable form                                                     | Automated E2E read-only / Back / reload test                                                                                     |
| Stale browser session                                | Useful, but old document state and expired credentials are different problems                               | Revision conflict E2E; direct stale mutation API test. Real identity/session expiry is exploratory and outside this fake account |
| Two tabs edit the same draft                         | Useful: submitted integrity is not the only risk; draft work can also be overwritten                        | API optimistic-revision test and E2E retained-input conflict test; compare/copy recovery explored manually                       |
| Autosave racing with submit                          | Relevant to systems with autosave; not worth a dedicated UI test here                                       | I chose explicit save. API guards prove later save/upload cannot change submitted data. Revisit if autosave is added             |
| Double click / retry submit                          | Useful even with a disabled button; transport retries bypass the UI                                         | E2E double-click + repeated request and concurrent API requests; assert a single durable receipt                                 |
| Retry a successful submission after the round closes | Useful refinement once deadlines exist: a retry must not create doubt about an already accepted application | API test accepts just before cutoff, advances the injected clock and verifies the original receipt and unchanged fields          |
| Direct API mutation after submit                     | Essential; a read-only UI does not enforce the invariant                                                    | API tests for save and attachment changes, plus repeated submit with changed fields                                              |
| Network interrupted during submit                    | Essential: a lost response may follow a successful commit                                                   | E2E lets the request reach the real local API, drops the response and verifies reconciliation to the receipt                     |
| Load-test thousands of concurrent submitters         | A real risk (the deadline peak), but a different one: capacity, not this invariant                          | A small concurrent API test covers the transition race. The deadline peak is R11 in the strategy, as separate performance work   |
| Probe production endpoints to learn the rules        | Rejected: tests only run against systems I own                                                              | No production testing. Assumptions stay explicit                                                                                 |

This review step is where the value is. Model suggestions are hypotheses, not a checklist. Here the review moved most of the effort to API-level state integrity rather than UI permutations, and rejected two suggestions outright. No model decides whether a quality gate may be bypassed.

## 2. Helping work out why a test failed

**The problem:** when a nightly run fails, someone has to decide whether each failure is a product bug, a broken test, a slow environment or an accessibility regression. With many forms, browsers and tests, that sorting is where the time goes.

**How it works:**

1. **Collect.** A custom Playwright reporter writes `reports/quality.json`: each test, browser, attempt and outcome, the kind of assertion that failed, and the API requests the test made (method, route with IDs masked, status code).
2. **Filter.** `analyze-failures` keeps only failed or flaky tests and only allowlisted fields. Raw error text, form contents, request bodies, cookies, files and traces are left out. The result is `reports/diagnosis-packet.json`.
3. **Ask a local model.** With `--ollama`, the packet goes to an Ollama model on the same machine (`127.0.0.1:11434`) with instructions to propose hypotheses, cite the evidence for each, and suggest the smallest next check. The answer is saved to `reports/ai-hypotheses.txt`, labelled unreviewed. Nothing leaves the machine.

```bash
# Packet from a fictional failure; no model required
npm run analyze:failures -- docs/examples/fictional-failure.json

# Packet from your latest Playwright run
npm run analyze:failures -- reports/quality.json

# Ask a locally installed model
npm run analyze:failures -- reports/quality.json --ollama YOUR_LOCAL_MODEL
```

**Example.** In the [fictional failure](examples/fictional-failure.json), the read-only test fails in Firefox: a `toHaveCount` check found a Save button on a submitted application. The requests show the submit returned 200 and the application was then fetched successfully.

The kind of answer I expect (written by hand for illustration, not captured model output): “The submit and the following fetch both succeeded, so the server likely accepted the submission. A visible Save button then points to the page rendering before it applied the submitted status, or the test checking a different page. Next checks: compare the stored status with the trace, and confirm the URL the assertion ran against.”

My review of that: plausible, but not a root cause. If the stored status is submitted and Save is visible, it is a rendering defect in the product. If the test was on the wrong page, it is a test defect. Until the evidence settles it, the classification stays unknown.

**What is tested and what is not.** The packet filter, the request evidence and the model call are covered by unit tests. The model call is tested against a stand-in for Ollama: the tests check that only the packet is sent, only to the local address, with deterministic settings, and that errors and empty answers fail clearly while keeping the packet. I have not run it against a real model in this repository.

**How it would run in a team.** On a CI runner or an internal server with Ollama and a small model installed, a failed nightly run would attach `ai-hypotheses.txt` next to the HTML report and traces. The person triaging starts from the hypotheses instead of a blank page, and still makes the call. A model never sees production data and never changes code or a quality gate.

## How I would measure whether AI helps

Run the same small set of known failures with and without model assistance. Record time to an evidence-backed classification, wrong diagnoses, and useful suggested next checks. Don't measure words generated, and don't accept plausible explanations as correct.
