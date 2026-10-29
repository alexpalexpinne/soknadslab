import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import {
  type Application,
  type Fields,
  type Errors,
  type Round,
  type Programme,
  PROGRAMME,
  submissionErrors,
  attachmentError,
} from "./domain";

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "The service could not be reached. Your entries are still here. Please retry.";
}
const formatMoney = (amount: string) =>
  `NOK ${Number(amount).toLocaleString("en-GB")}`;
const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const formatDeadline = (round: Pick<Round, "closesAt" | "timeZone">) =>
  `${new Date(round.closesAt).toLocaleString("en-GB", {
    timeZone: round.timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })} (${round.timeZone})`;

export function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  useEffect(() => {
    api("/session")
      .then(() => setSignedIn(true))
      .catch(() => setSignedIn(false));
    const changed = () => {
      setRoute(location.hash.slice(1) || "/");
      setError("");
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      await api("/session", { method: "POST" });
      setSignedIn(true);
      location.hash = "/";
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (
      !window.confirm(
        "Sign out and remove this workspace? Saved and unsaved application data will be removed.",
      )
    )
      return;
    try {
      await api("/session", { method: "DELETE" });
      setSignedIn(false);
      location.hash = "/";
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  const id = route.startsWith("/applications/") ? route.split("/")[2] : null;
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to main content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none">
                <path d="M6 4h14l6 6v18H6V4Z" />
                <path d="M20 4v6h6M11 15h10M11 20h10" />
              </svg>
            </span>
            <span>
              Screen grants<small>Application portal</small>
            </span>
          </div>
          {signedIn && (
            <div className="account">
              <span>
                Alex Example <small>Contact person</small>
              </span>
              <button className="quiet" onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <div className={`portal-layout ${signedIn ? "" : "signed-out"}`}>
        {signedIn && (
          <aside className="portal-sidebar" aria-label="Applicant workspace">
            <div className="representation">
              <span className="sidebar-label">Applicant workspace</span>
              <strong>Example Film Company</strong>
              <span>Organisation</span>
            </div>
            <nav aria-label="Portal">
              {[
                ["/", "Overview", "overview"],
                ["/programmes", "Funding programmes", "programmes"],
                ["/applications", "Applications", "applications"],
                ["/guidance", "Guidance", "guidance"],
              ].map(([path, label, icon]) => (
                <a
                  key={path}
                  href={`#${path}`}
                  aria-current={
                    route === path || (path === "/applications" && id)
                      ? "page"
                      : undefined
                  }
                  onClick={(event) => {
                    if (
                      hasUnsavedChanges &&
                      !window.confirm(
                        "Your form entries have not been saved. Leave without saving?",
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <span className={`nav-icon ${icon}`} aria-hidden="true" />
                  {label}
                </a>
              ))}
            </nav>
          </aside>
        )}
        <main id="main" tabIndex={-1}>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {signedIn === null ? (
            <p role="status">Opening the portal…</p>
          ) : !signedIn ? (
            <div className="login-layout">
              <section className="login">
                <p className="eyebrow">Applicant access</p>
                <h1>Sign in to the application portal</h1>
                <p className="login-intro">
                  Apply for a development grant, manage drafts and view
                  submitted applications.
                </p>
                <div className="login-account panel">
                  <h2>Applicant account</h2>
                  <p>
                    Continue with the account below. No password is required.
                  </p>
                  <dl className="account-details">
                    <div>
                      <dt>Applicant</dt>
                      <dd>Example Film Company</dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>Alex Example</dd>
                    </div>
                  </dl>
                  <button onClick={signIn} disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                    <span aria-hidden="true"> →</span>
                  </button>
                  <p className="login-footnote">
                    Each sign-in creates a separate workspace. Signing out
                    removes its data.
                  </p>
                </div>
              </section>
              <aside className="login-guidance">
                <h2>Using the portal</h2>
                <ol>
                  <li>
                    <strong>Choose a programme</strong>
                    <span>Read the requirements before you start.</span>
                  </li>
                  <li>
                    <strong>Complete your application</strong>
                    <span>Save a draft and return to it later.</span>
                  </li>
                  <li>
                    <strong>Submit and keep your receipt</strong>
                    <span>Submitted applications are read-only.</span>
                  </li>
                </ol>
              </aside>
            </div>
          ) : id ? (
            <ApplicationPage
              key={id}
              id={id}
              onDirtyChange={setHasUnsavedChanges}
            />
          ) : route === "/guidance" ? (
            <Guidance />
          ) : (
            <Dashboard key={route} view={route} />
          )}
        </main>
      </div>
      <footer>
        <span>Screen grants · Application portal</span>
      </footer>
    </>
  );
}

function Dashboard({ view }: { view: string }) {
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const [filter, setFilter] = useState<"all" | "draft" | "submitted">("all");
  const programmesOnly = view === "/programmes";
  const applicationsOnly = view === "/applications";
  useEffect(() => {
    Promise.all([
      api<Application[]>("/applications"),
      api<Programme[]>("/programmes"),
    ])
      .then(([applications, programmes]) => {
        setApplications(applications);
        setProgramme(programmes[0]);
      })
      .catch((error) => setError(errorMessage(error)));
  }, []);
  async function start() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    try {
      const application = await api<Application>("/applications", {
        method: "POST",
      });
      location.hash = `/applications/${application.id}`;
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiError && error.code === "deadline_passed")
        setProgramme((current) =>
          current ? { ...current, submissionOpen: false } : current,
        );
    } finally {
      starting.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <p className="breadcrumb">
          Applicant portal <span aria-hidden="true">/</span>{" "}
          {programmesOnly
            ? "Funding programmes"
            : applicationsOnly
              ? "Applications"
              : "Overview"}
        </p>
        <h1>{programmesOnly ? "Funding programmes" : "Your applications"}</h1>
        <p>
          {programmesOnly
            ? "Available funding rounds for screen development."
            : "Manage applications for Example Film Company."}
        </p>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!applicationsOnly && programme && (
        <section className="panel programme">
          <div className="section-heading">
            <h2>
              {programmesOnly
                ? "Film · Development"
                : "Available funding round"}
            </h2>
            <span className="badge">
              {programme.submissionOpen ? "Open" : "Closed"}
            </span>
          </div>
          <div className="programme-content">
            <div>
              <h3>{PROGRAMME.name}</h3>
              <p>{PROGRAMME.description}</p>
              <dl className="programme-details">
                <div>
                  <dt>Application deadline</dt>
                  <dd>
                    <time dateTime={programme.closesAt}>
                      {formatDeadline(programme)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Eligible projects</dt>
                  <dd>Development stage, before production begins</dd>
                </div>
                <div>
                  <dt>Maximum grant</dt>
                  <dd>{formatMoney(String(PROGRAMME.maximumAmount))}</dd>
                </div>
                <div>
                  <dt>Supporting document</dt>
                  <dd>Project budget · PDF</dd>
                </div>
              </dl>
            </div>
            <button
              onClick={start}
              disabled={busy || !programme.submissionOpen}
            >
              {busy ? "Starting…" : "Start application"}
            </button>
          </div>
          {!programme.submissionOpen && (
            <p className="section-description">
              This round is closed. Existing drafts remain available in
              Applications.
            </p>
          )}
        </section>
      )}
      {!programmesOnly && (
        <section className="panel applications">
          <div className="section-heading">
            <h2>Application overview</h2>
            <span className="table-count">
              {applications?.length ?? 0} applications
            </span>
          </div>
          <div
            className="list-filters"
            role="group"
            aria-label="Filter applications"
          >
            {(["all", "draft", "submitted"] as const).map((value) => (
              <button
                key={value}
                className="filter-button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === "all"
                  ? "All applications"
                  : value === "draft"
                    ? "Drafts"
                    : "Submitted"}{" "}
                <span>
                  {applications?.filter(
                    (app) => value === "all" || app.status === value,
                  ).length ?? 0}
                </span>
              </button>
            ))}
          </div>
          {applications === null ? (
            <p role="status">Loading applications…</p>
          ) : (
            <div className="table-scroll">
              <table className="application-table">
                <caption className="sr-only">
                  Applications for Example Film Company, filtered by {filter}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Project / programme</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last saved</th>
                  </tr>
                </thead>
                <tbody>
                  {applications
                    .filter(
                      (application) =>
                        filter === "all" || application.status === filter,
                    )
                    .map((application) => (
                      <tr key={application.id}>
                        <td>
                          <a href={`#/applications/${application.id}`}>
                            {application.fields.title || "Untitled application"}
                          </a>
                          <p>{PROGRAMME.name}</p>
                        </td>
                        <td className="reference">
                          {application.receipt ?? "Not submitted"}
                        </td>
                        <td>
                          <span className={`badge ${application.status}`}>
                            {application.status === "submitted"
                              ? "Submitted"
                              : "Draft"}
                          </span>
                        </td>
                        <td className="saved-date">
                          {formatDate(application.savedAt)}
                        </td>
                      </tr>
                    ))}
                  {applications.filter(
                    (application) =>
                      filter === "all" || application.status === filter,
                  ).length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty-state">
                        <strong>
                          {applications.length === 0
                            ? "No applications yet"
                            : "No applications in this view"}
                        </strong>
                        <p>
                          {applications.length === 0
                            ? "Start an application from an available funding programme. Saved drafts and submission receipts will appear here."
                            : "Choose another status filter to see your applications."}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {!programmesOnly && (
        <div className="overview-help">
          <h2>Saving and submitting</h2>
          <p>
            A draft can be incomplete. Save before leaving the form. Submission
            requires all mandatory information and a budget PDF.
          </p>
          <a href="#/guidance">
            Read the application guidance <span aria-hidden="true">→</span>
          </a>
        </div>
      )}
    </>
  );
}

function Guidance() {
  return (
    <>
      <div className="page-heading">
        <p className="breadcrumb">
          Applicant portal <span aria-hidden="true">/</span> Guidance
        </p>
        <h1>Application guidance</h1>
        <p>What to prepare and how to manage your application.</p>
      </div>
      <section className="panel guidance-page">
        <h2>Before you start</h2>
        <p>
          Prepare the organisation and contact details, a short project
          description, a requested amount and a project budget.
        </p>
        <h2>Drafts and saving</h2>
        <p>
          You can save an incomplete draft. Form entries must be saved
          explicitly; uploading an attachment saves the file separately. Return
          from Applications to continue your draft.
        </p>
        <h2>Eligibility and deadline</h2>
        <p>
          This programme supports short film projects at the development stage.
          Projects already in production or completed are not eligible. You can
          save a draft before confirming its eligibility.
        </p>
        <p>
          Submit before {formatDeadline(PROGRAMME)}. At the deadline, new
          applications and submissions close. Existing drafts can still be
          edited and saved; saving is not submission.
        </p>
        <h2>Supporting documents</h2>
        <p>
          Attach one PDF budget, up to 1 MiB.{" "}
          <a href="/fictional-budget.pdf" download="sample-budget.pdf">
            Download a sample budget PDF.
          </a>{" "}
          An invalid upload does not replace an existing attachment.
        </p>
        <h2>Submission</h2>
        <p>
          The portal checks mandatory information before accepting submission.
          Once submitted, the application is read-only and has a reference
          number. You can reopen the receipt from Applications.
        </p>
      </section>
    </>
  );
}

function ApplicationPage({
  id,
  onDirtyChange,
}: {
  id: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [application, setApplication] = useState<Application | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dirty =
    !!fields &&
    !!application &&
    JSON.stringify(fields) !== JSON.stringify(application.fields) &&
    application.status === "draft";
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    api<Application>(`/applications/${id}`)
      .then((result) => {
        setApplication(result);
        setFields(result.fields);
      })
      .catch((error) => setError(errorMessage(error)));
  }, [id]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // Focus on a new failed submission, never while the applicant is correcting a field.
  useEffect(() => {
    if (validationAttempt > 0) summaryRef.current?.focus();
  }, [validationAttempt]);
  useEffect(() => {
    if (application?.status) headingRef.current?.focus();
  }, [application?.status]);
  function adopt(result: Application) {
    setApplication(result);
    setFields(result.fields);
    setErrors({});
  }
  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
    setNotice("");
    if (errors[key])
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
  }
  async function save() {
    if (!fields || !application || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      adopt(
        await api<Application>(`/applications/${id}`, {
          method: "PUT",
          body: JSON.stringify({ revision: application.revision, fields }),
        }),
      );
      setNotice("Draft saved. You can safely return later.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file || !application || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const invalid = attachmentError(file.name, file.type, bytes);
      if (invalid) {
        setError(invalid);
        return;
      }
      const result = await api<Application>(`/applications/${id}/attachment`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
          "X-Draft-Revision": String(application.revision),
        },
        body: file,
      });
      setApplication(result); // Keep unsaved form fields; upload is a separate persisted operation.
      setErrors((current) => {
        const next = { ...current };
        delete next.attachment;
        return next;
      });
      setNotice("Attachment uploaded. Save your form entries separately.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (!fields || !application || lock.current) return;
    const validation = submissionErrors(fields, application.attachment);
    if (Object.keys(validation).length) {
      setErrors(validation);
      setValidationAttempt((current) => current + 1);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      adopt(
        await api<Application>(`/applications/${id}/submit`, {
          method: "POST",
          body: JSON.stringify({ revision: application.revision, fields }),
        }),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) {
        setError(errorMessage(error));
        if (error.code === "deadline_passed")
          setApplication((current) =>
            current
              ? {
                  ...current,
                  round: { ...current.round, submissionOpen: false },
                }
              : current,
          );
        if (error.errors) {
          setErrors(error.errors);
          setValidationAttempt((current) => current + 1);
        }
      } else {
        // A lost response is not proof of failure: reconcile authoritative state before inviting retry.
        try {
          const result = await api<Application>(`/applications/${id}`);
          if (result.status === "submitted") {
            adopt(result);
            setNotice("Submission confirmed after reconnecting.");
          } else
            setError(
              "Submission was not confirmed. Your entries are still here. It is safe to retry.",
            );
        } catch {
          setError(
            "We could not confirm the submission status. Your entries are still here. Reconnect and retry; repeating submission is safe.",
          );
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function leave(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      dirty &&
      !window.confirm(
        "Your form entries have not been saved. Leave without saving?",
      )
    )
      event.preventDefault();
  }
  const back = (
    <a className="back-link" href="#/" onClick={leave}>
      ← My applications
    </a>
  );
  if (!application || !fields)
    return (
      <>
        {back}
        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">Loading application…</p>
        )}
      </>
    );
  if (application.status === "submitted")
    return (
      <>
        {back}
        <section className="panel receipt">
          <div className="receipt-heading">
            <p className="eyebrow">Submission receipt</p>
            <span className="badge submitted">Submitted · Read-only</span>
          </div>
          <h1 ref={headingRef} tabIndex={-1}>
            Application submitted
          </h1>
          <p>
            Keep the reference below for your records. The submitted information
            cannot be edited.
          </p>
          {notice && (
            <p role="status" className="notice success">
              {notice}
            </p>
          )}
          <dl className="receipt-details">
            <div>
              <dt>Reference</dt>
              <dd>{application.receipt}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>
                {new Date(application.submittedAt!).toLocaleString("en-GB")}
              </dd>
            </div>
            <div>
              <dt>Programme</dt>
              <dd>{PROGRAMME.name}</dd>
            </div>
            <div>
              <dt>Organisation</dt>
              <dd>{fields.organisation}</dd>
            </div>
            <div>
              <dt>Organisation number</dt>
              <dd>{fields.organisationNumber}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>
                {fields.contactName} · {fields.email}
              </dd>
            </div>
            <div>
              <dt>Project stage</dt>
              <dd>
                {fields.projectStage === "development"
                  ? "Development"
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Project title</dt>
              <dd>{fields.title}</dd>
            </div>
            <div>
              <dt>Project summary</dt>
              <dd>{fields.summary}</dd>
            </div>
            <div>
              <dt>Requested amount</dt>
              <dd>{formatMoney(fields.amount)}</dd>
            </div>
            <div>
              <dt>Budget attachment</dt>
              <dd>{application.attachment?.name}</dd>
            </div>
          </dl>
          <a href="#/">Return to my applications</a>
        </section>
      </>
    );
  const textField = (
    key: Exclude<keyof Fields, "declaration" | "summary" | "projectStage">,
    label: string,
    options: { type?: string; hint?: string; max?: number } = {},
  ) => (
    <div className="field" key={key}>
      <label htmlFor={key}>
        {label} <span className="required">(required)</span>
      </label>
      {options.hint && (
        <p className="hint" id={`${key}-hint`}>
          {options.hint}
        </p>
      )}
      <input
        id={key}
        name={key}
        type={options.type ?? "text"}
        inputMode={
          key === "amount" || key === "organisationNumber"
            ? "numeric"
            : undefined
        }
        value={fields[key]}
        maxLength={options.max ?? 120}
        aria-required="true"
        aria-invalid={!!errors[key]}
        aria-describedby={
          [options.hint ? `${key}-hint` : "", errors[key] ? `${key}-error` : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onChange={(event) => update(key, event.target.value)}
      />
      {errors[key] && (
        <p className="field-error" id={`${key}-error`}>
          {errors[key]}
        </p>
      )}
    </div>
  );
  const validation = submissionErrors(fields, application.attachment);
  const sections = [
    {
      id: "eligibility-section",
      label: "Project eligibility",
      complete: !validation.projectStage,
    },
    {
      id: "applicant-section",
      label: "Applicant details",
      complete:
        !validation.organisation &&
        !validation.organisationNumber &&
        !validation.contactName &&
        !validation.email,
    },
    {
      id: "project-section",
      label: "Project details",
      complete: !validation.title && !validation.summary && !validation.amount,
    },
    {
      id: "attachment-section",
      label: "Budget attachment",
      complete: !!application.attachment,
    },
    {
      id: "review-section",
      label: "Review and submit",
      complete: !!fields.declaration,
    },
  ];
  return (
    <>
      {back}
      <div className="page-heading application-heading">
        <div>
          <p className="breadcrumb">
            Applications <span aria-hidden="true">/</span> New application
          </p>
          <h1 ref={headingRef} tabIndex={-1}>
            Grant application
          </h1>
          <p>{PROGRAMME.name}</p>
          <p className="hint">
            Deadline:{" "}
            <time dateTime={application.round.closesAt}>
              {formatDeadline(application.round)}
            </time>
          </p>
        </div>
        <span className="badge draft">Draft</span>
      </div>
      <div className="form-layout">
        <aside className="form-contents" aria-labelledby="contents-heading">
          <h2 id="contents-heading">Application contents</h2>
          <nav aria-label="Application sections">
            <ol>
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      const target = document.getElementById(section.id);
                      target?.focus();
                      target?.scrollIntoView({
                        behavior: "instant",
                        block: "start",
                      });
                    }}
                  >
                    <span
                      className={`section-number ${section.complete ? "complete" : ""}`}
                      aria-hidden="true"
                    >
                      {section.complete ? "✓" : index + 1}
                    </span>
                    <span>
                      {section.label}
                      <small>
                        {section.complete ? "Complete" : "Information required"}
                      </small>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="draft-information">
            <span className="sidebar-label">Last saved</span>
            <strong>
              {new Date(application.savedAt).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </strong>
            <p>
              Save your form entries before leaving. An uploaded file is saved
              separately.
            </p>
          </div>
        </aside>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {Object.keys(errors).length > 0 && (
            <div
              className="notice error"
              role="alert"
              tabIndex={-1}
              ref={summaryRef}
              aria-labelledby="error-heading"
            >
              <h2 id="error-heading">Check your application</h2>
              <ul>
                {Object.entries(errors).map(([key, message]) => (
                  <li key={key}>
                    <a
                      href={`#${key}`}
                      onClick={(event) => {
                        event.preventDefault();
                        document.getElementById(key)?.focus();
                      }}
                    >
                      {message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="notice success" role="status">
              {notice}
            </p>
          )}
          {!application.round.submissionOpen && (
            <p className="notice" id="deadline-notice">
              This funding round is closed. You can keep editing and saving this
              draft, but it cannot be submitted.
            </p>
          )}
          <fieldset
            className="panel"
            id="eligibility-section"
            tabIndex={-1}
            disabled={busy}
          >
            <legend>Project eligibility</legend>
            <p className="section-description">
              This programme funds development work before production begins.
            </p>
            <div className="field">
              <label htmlFor="projectStage">
                Project stage <span className="required">(required)</span>
              </label>
              <p className="hint" id="projectStage-hint">
                Choose the project's current stage. Only development projects
                are eligible; an incomplete or ineligible draft can still be
                saved.
              </p>
              <select
                id="projectStage"
                value={fields.projectStage}
                onChange={(event) =>
                  update(
                    "projectStage",
                    event.target.value as Fields["projectStage"],
                  )
                }
                aria-required="true"
                aria-invalid={!!errors.projectStage}
                aria-describedby={`projectStage-hint${errors.projectStage ? " projectStage-error" : ""}`}
              >
                <option value="">Choose a stage</option>
                <option value="development">Development</option>
                <option value="production">Production</option>
                <option value="completed">Completed</option>
              </select>
              {fields.projectStage &&
                fields.projectStage !== "development" &&
                !errors.projectStage && (
                  <p className="hint">
                    Production and completed projects are not eligible for this
                    programme. Your draft can still be saved.
                  </p>
                )}
              {errors.projectStage && (
                <p id="projectStage-error" className="field-error">
                  {errors.projectStage}
                </p>
              )}
            </div>
          </fieldset>
          <fieldset
            className="panel"
            id="applicant-section"
            tabIndex={-1}
            disabled={busy}
          >
            <legend>Applicant details</legend>
            <p className="section-description">
              Enter the applicant organisation and a contact for this
              application.
            </p>
            {textField("organisation", "Organisation name")}
            <div className="field-grid">
              {textField("organisationNumber", "Organisation number", {
                hint: "Nine digits, as registered in the Brønnøysund Register Centre.",
                max: 30,
              })}
              {textField("contactName", "Contact name")}
            </div>
            {textField("email", "Email address", { type: "email", max: 200 })}
          </fieldset>
          <fieldset
            className="panel"
            id="project-section"
            tabIndex={-1}
            disabled={busy}
          >
            <legend>Project details</legend>
            <p className="section-description">
              Describe the development work and the funding requested.
            </p>
            {textField("title", "Project title", { max: 160 })}
            <div className="field">
              <label htmlFor="summary">
                Project summary <span className="required">(required)</span>
              </label>
              <p className="hint" id="summary-hint">
                What will you do, and who will benefit? Maximum 3,000
                characters.
              </p>
              <textarea
                id="summary"
                rows={4}
                maxLength={3000}
                value={fields.summary}
                onChange={(event) => update("summary", event.target.value)}
                aria-required="true"
                aria-invalid={!!errors.summary}
                aria-describedby={`summary-hint${errors.summary ? " summary-error" : ""}`}
              />
              {errors.summary && (
                <p id="summary-error" className="field-error">
                  {errors.summary}
                </p>
              )}
            </div>
            {textField("amount", "Requested amount (NOK)", {
              hint: "Whole kroner, from 1 to 200,000.",
              max: 30,
            })}
          </fieldset>
          <fieldset
            className="panel"
            id="attachment-section"
            tabIndex={-1}
            disabled={busy}
          >
            <legend>Budget attachment</legend>
            <div className="field">
              <label htmlFor="attachment">
                Project budget <span className="required">(required)</span>
              </label>
              <p id="attachment-hint" className="hint">
                One PDF, up to 1 MiB. Uploads are saved immediately.{" "}
                <a href="/fictional-budget.pdf" download="sample-budget.pdf">
                  Download a sample budget PDF.
                </a>
              </p>
              <input
                id="attachment"
                type="file"
                accept=".pdf,application/pdf"
                aria-required="true"
                aria-invalid={!!errors.attachment}
                aria-describedby={`attachment-hint${errors.attachment ? " attachment-error" : ""}`}
                onChange={(event) => {
                  void upload(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              {application.attachment && (
                <p className="attachment">
                  <span className="file-type" aria-hidden="true">
                    PDF
                  </span>
                  <strong>{application.attachment.name}</strong>
                  <span>
                    {Math.max(1, Math.ceil(application.attachment.size / 1024))}{" "}
                    KB · Uploaded
                  </span>
                </p>
              )}
              {errors.attachment && (
                <p id="attachment-error" className="field-error">
                  {errors.attachment}
                </p>
              )}
            </div>
          </fieldset>
          <section className="panel review" id="review-section" tabIndex={-1}>
            <h2>Review and submit</h2>
            <p>
              Check the information and budget before submitting. You can edit a
              draft; submitted applications are read-only.
            </p>
            <div className="field">
              <label className="checkbox" htmlFor="declaration">
                <input
                  id="declaration"
                  type="checkbox"
                  checked={fields.declaration}
                  disabled={busy}
                  onChange={(event) =>
                    update("declaration", event.target.checked)
                  }
                  aria-required="true"
                  aria-invalid={!!errors.declaration}
                  aria-describedby={
                    errors.declaration ? "declaration-error" : undefined
                  }
                />
                I confirm that the information is accurate (required)
              </label>
              {errors.declaration && (
                <p id="declaration-error" className="field-error">
                  {errors.declaration}
                </p>
              )}
            </div>
          </section>
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              onClick={save}
              disabled={busy}
            >
              Save draft
            </button>
            <span
              role="status"
              className={dirty ? "save-state unsaved" : "save-state"}
            >
              {busy
                ? "Working…"
                : dirty
                  ? "Unsaved form entries"
                  : "Form entries saved"}
            </span>
            <button
              type="submit"
              disabled={busy || !application.round.submissionOpen}
              aria-describedby={
                !application.round.submissionOpen
                  ? "deadline-notice"
                  : undefined
              }
            >
              Submit application <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
