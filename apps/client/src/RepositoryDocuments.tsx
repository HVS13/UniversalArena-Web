import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import baseline from "../../../BASELINE.md?raw";
import decisions from "../../../DECISIONS.md?raw";
import friendAlpha from "../../../FRIEND_ALPHA.md?raw";
import playtestReport from "../../../PLAYTEST_REPORT.md?raw";
import readme from "../../../README.md?raw";
import releaseChecklist from "../../../RELEASE_CHECKLIST.md?raw";
import rulesImplementation from "../../../RULES_IMPLEMENTATION.md?raw";
import relayReadme from "../../../server/README.md?raw";

const repositoryUrl = "https://github.com/HVS13/UniversalArena-Web/blob/main/";

const documents = [
  {
    id: "readme",
    label: "Project overview",
    path: "README.md",
    content: readme,
  },
  {
    id: "friend-alpha",
    label: "Friend Alpha guide",
    path: "FRIEND_ALPHA.md",
    content: friendAlpha,
  },
  {
    id: "rules-implementation",
    label: "Rules implementation",
    path: "RULES_IMPLEMENTATION.md",
    content: rulesImplementation,
  },
  {
    id: "release-checklist",
    label: "Release checklist",
    path: "RELEASE_CHECKLIST.md",
    content: releaseChecklist,
  },
  {
    id: "playtest-report",
    label: "Playtest report",
    path: "PLAYTEST_REPORT.md",
    content: playtestReport,
  },
  {
    id: "baseline",
    label: "Technical baseline",
    path: "BASELINE.md",
    content: baseline,
  },
  {
    id: "decisions",
    label: "Decision record",
    path: "DECISIONS.md",
    content: decisions,
  },
  {
    id: "relay-hosting",
    label: "Relay hosting guide",
    path: "server/README.md",
    content: relayReadme,
  },
] as const;

export const RepositoryDocuments = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState<(typeof documents)[number]["id"]>("readme");
  const activeDocument = documents.find((document) => document.id === activeId) ?? documents[0];

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const viewer = isOpen
    ? createPortal(
        <div
          className="ua-modal ua-docs"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
            className="ua-modal__content ua-docs__content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ua-docs-title"
          >
            <div className="ua-docs__header">
              <div>
                <p className="ua-kicker">Repository reference</p>
                <h2 id="ua-docs-title">Project documents</h2>
              </div>
              <button
                type="button"
                className="ua-button ua-button--ghost"
                autoFocus
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>

            <label className="ua-label ua-docs__picker">
              Document
              <select
                value={activeId}
                onChange={(event) =>
                  setActiveId(event.target.value as (typeof documents)[number]["id"])
                }
              >
                {documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="ua-docs__meta">
              <span>{activeDocument.path}</span>
              <a
                href={`${repositoryUrl}${activeDocument.path}`}
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </a>
            </div>

            <pre className="ua-docs__document" tabIndex={0}>
              {activeDocument.content}
            </pre>
          </section>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <footer className="ua-footer">
        <p>Deterministic 3v3 card combat built from the canonical Universal Arena data.</p>
        <button
          type="button"
          className="ua-footer__docs-trigger"
          onClick={() => setIsOpen(true)}
        >
          Project documents
        </button>
      </footer>

      {viewer}
    </>
  );
};
