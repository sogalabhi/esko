import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileText,
  FileUp,
  Printer,
  Quote,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router";
import { ProofLine } from "../components/ProofLine";
import { CartonDrawing, CartonError } from "../components/CartonDrawing";
import { VerdictBadge } from "../components/VerdictBadge";
import {
  DECISION_WORD,
  orderFindings,
  printVerdict,
  resolveRule,
} from "../lib/checks";
import { KIND_LABELS } from "../lib/findingKinds";
import { sourceLong } from "../lib/labels";
import { regionsFromFacts } from "../lib/clusters";
import { usePageImage } from "../lib/pageImage";
import {
  buildMarks,
  clusterMarks,
  packFileId,
  type MarkSet,
} from "../lib/markup";
import {
  byMark,
  cartonEvidence,
  decisionStatus,
  hasNoEvidence,
  markNumbers,
  productLine,
  ruleParts,
  resultsText,
  rulesUsed,
  truncate,
  whereShort,
} from "../lib/report";
import { tidyRef } from "../lib/ruleRef";
import { stamp } from "../lib/time";
import { usePackZones } from "../lib/usePackZones";
import { PdfFrame } from "../shell/SourceDrawer";
import { MARKETS } from "../shell/TopBar";
import { useProject } from "../state/project";
import type { BBox, Cleared, Finding, Project, Source } from "../types/project";
import { fallbackPage } from "./Markup";
import { MarkupCanvas } from "./markup/MarkupCanvas";
import { useCartonImage } from "./markup/useCartonImage";
import "./markup/markup.css";
import "./report.css";

const h2 = "text-[16px] font-semibold";

/** Which parts the print dialog gets: everything, or only the summary and the marked-up artwork. */
type PrintMode = "all" | "summary";

/** Shown when nothing has been checked yet (LoadGate's `empty`, and when files are in but no checks ran). */
export function EmptyReport() {
  return (
    <section
      aria-labelledby="report-title"
      className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center"
    >
      <FileUp size={24} aria-hidden="true" className="mx-auto text-ink-2" />
      <h1 id="report-title" className="mt-3 text-[20px] font-semibold">
        Report
      </h1>
      <p className="mt-1 text-ink-2">
        No report yet: no checks have run. Add the artwork and the approved
        product information first.
      </p>
      <Link
        to="/evidence"
        className="mt-4 inline-flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
      >
        Go to Files
      </Link>
    </section>
  );
}

const placeOf = (source: Source, project: Project) =>
  sourceLong(
    source,
    project.files.find((f) => f.id === source.fileId),
  );

/** A region of the page about twice as wide as high around the quote, kept inside the page (all mm). */
function cropRegion(b: BBox, page: { w: number; h: number }) {
  let w = Math.min(Math.max(b[2] + 14, (b[3] + 8) * 2, 36), page.w);
  let h = w / 2;
  if (h > page.h) {
    h = page.h;
    w = h * 2;
  }
  const x = Math.min(Math.max(b[0] + b[2] / 2 - w / 2, 0), page.w - w);
  const y = Math.min(Math.max(b[1] + b[3] / 2 - h / 2, 0), page.h - h);
  return { x, y, w, h };
}

/** One small crop of the carton around the quote (about 70 x 35 mm on paper). Without the backend's page image, the panel frame. */
function ReportCrop({ source, project }: { source: Source; project: Project }) {
  const { source: dataSource } = useProject();
  const bbox = source.where.bbox;
  const drawable =
    dataSource === "api" && !!bbox && (source.where.page ?? 1) === 1;
  const img = usePageImage(source.fileId, drawable);
  if (!drawable || img.status === "error" || img.status === "off") {
    return (
      <div data-crop className="report-crop report-crop-frame">
        <PdfFrame source={source} panels={project.pack.panels} />
      </div>
    );
  }
  if (img.status === "loading" || !bbox) {
    return (
      <div data-crop className="report-crop">
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center bg-border"
        >
          <span className="animate-pulse text-[12px] font-medium text-ink-2">
            Drawing the carton…
          </span>
        </div>
      </div>
    );
  }
  const r = cropRegion(bbox, img);
  const pct = (v: number, base: number, size: number) =>
    `${((v - base) / size) * 100}%`;
  return (
    <div data-crop className="report-crop">
      <img
        src={img.url}
        alt={`${source.where.panel ?? "Carton"} crop with the quote outlined`}
        draggable={false}
        className="absolute max-w-none select-none"
        style={{
          width: `${(img.w / r.w) * 100}%`,
          height: `${(img.h / r.h) * 100}%`,
          left: `${(-r.x / r.w) * 100}%`,
          top: `${(-r.y / r.h) * 100}%`,
        }}
      />
      <div
        data-highlight
        className="absolute border-2 border-info bg-info/15"
        style={{
          left: pct(bbox[0], r.x, r.w),
          top: pct(bbox[1], r.y, r.h),
          width: `${(bbox[2] / r.w) * 100}%`,
          height: `${(bbox[3] / r.h) * 100}%`,
        }}
      />
    </div>
  );
}

function EvidenceLine({
  source,
  project,
}: {
  source: Source;
  project: Project;
}) {
  return (
    <li data-report-evidence className="rp-ev">
      <span className="font-mono text-[12px] text-ink-2">
        {placeOf(source, project)}
      </span>
      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium ${source.quoteChecked ? "text-ok" : "text-ai"}`}
      >
        {source.quoteChecked ? (
          <CircleCheck size={12} aria-hidden="true" />
        ) : (
          <CircleAlert size={12} aria-hidden="true" />
        )}
        {source.quoteChecked ? "checked by code" : "not checked"}
      </span>
      <span className="rp-quote italic" title={source.quote}>
        <Quote
          size={11}
          aria-hidden="true"
          className="mr-1 inline text-ink-2"
        />
        {source.quote}
      </span>
    </li>
  );
}

function RuleLine({
  finding,
  project,
}: {
  finding: Finding;
  project: Project;
}) {
  if (finding.ruleIds.length === 0) return null;
  return (
    <p className="rp-kv">
      <span className="rp-k">
        {finding.ruleIds.length === 1 ? "Rule" : "Rules"}
      </span>
      <span className="min-w-0">
        {finding.ruleIds.map((id) => {
          const r = resolveRule(id, project);
          return (
            <span
              key={id}
              className="mr-3 inline-flex flex-wrap items-baseline gap-x-1"
            >
              <span className="font-mono">
                {r.title
                  ? id
                  : r.rule.ref && r.rule.ref !== id
                    ? tidyRef(r.rule.ref)
                    : id}
              </span>
              {r.title && <span>{r.title}</span>}
              {r.statusText && (
                <span className="text-ink-2">· {r.statusText}</span>
              )}
              {r.warning && (
                <span className="inline-flex items-center gap-1 font-medium text-warn">
                  <TriangleAlert size={12} aria-hidden="true" />
                  unverified
                </span>
              )}
            </span>
          );
        })}
      </span>
    </p>
  );
}

/** One finding in the evidence appendix: compact text, at most one crop beside it. */
function ReportFinding({
  finding: f,
  project,
  mark,
}: {
  finding: Finding;
  project: Project;
  mark?: number;
}) {
  const titleId = `report-${f.id}`;
  const crop = cartonEvidence(f, project);
  return (
    <article
      data-report-finding
      data-finding-id={f.id}
      data-verdict={f.verdict}
      aria-labelledby={titleId}
      className="rp-block"
    >
      <div className={`rp-block-grid ${crop ? "has-crop" : ""}`}>
        <div className="min-w-0 space-y-1">
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <VerdictBadge verdict={f.verdict} decision={f.decision} />
            <span className="text-[12px] text-ink-2">
              {KIND_LABELS[f.kind]}
            </span>
            <h4 id={titleId} className="min-w-0 text-[15px] font-semibold">
              {mark != null ? `Mark ${mark}` : "No mark"} · {f.title}
            </h4>
          </header>
          <RuleLine finding={f} project={project} />
          {f.expected != null && (
            <p className="rp-kv">
              <span className="rp-k">Expected</span>
              <span className="rp-clamp font-mono">{f.expected}</span>
            </p>
          )}
          {f.found != null && (
            <p className="rp-kv">
              <span className="rp-k">Found</span>
              <span className="rp-clamp font-mono">{f.found}</span>
            </p>
          )}
          <ProofLine basis={f.basis} proof={f.proof} />
        </div>
        {crop && <ReportCrop source={crop} project={project} />}
      </div>
      <div className="mt-1 space-y-1">
        {f.evidence.length === 0 ? (
          <p className="text-[13px] text-ink-2">No evidence recorded.</p>
        ) : (
          <ul
            aria-label={`Evidence for ${f.title}`}
            className="rp-evidence space-y-0.5"
          >
            {f.evidence.map((s, i) => (
              <EvidenceLine
                key={`${s.fileId}-${s.where.cell ?? s.where.panel ?? ""}-${i}`}
                source={s}
                project={project}
              />
            ))}
          </ul>
        )}
        {f.decision && (
          <p
            data-decision
            className="flex flex-wrap items-center gap-x-2 text-[13px]"
          >
            <UserRound size={13} aria-hidden="true" className="text-ink-2" />
            <span className="font-medium">
              {f.decision.by} decided:{" "}
              {f.decision.verdict === "pass" ? "it's fine" : "it's a problem"}
            </span>
            <time dateTime={f.decision.at} className="text-ink-2">
              {stamp(f.decision.at)}
            </time>
            {f.decision.note && (
              <span className="text-ink-2">Note: {f.decision.note}</span>
            )}
          </p>
        )}
      </div>
    </article>
  );
}

type Part = "summary" | "detail";

function Section({
  id,
  title,
  count,
  part,
  children,
  className = "",
}: {
  id: string;
  title: string;
  count?: number;
  part: Part;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      data-report-section={id}
      data-part={part}
      className={`mt-8 ${className}`}
    >
      <h2 id={id} className={h2}>
        {title}
        {count != null && ` (${count})`}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="flex items-center gap-1.5 text-[14px] text-ink-2">
    <CircleCheck size={15} aria-hidden="true" />
    {children}
  </p>
);

function MarkCell({ n }: { n?: number }) {
  return n != null ? (
    <span className="font-mono tabular-nums font-semibold">{n}</span>
  ) : (
    <>
      <span aria-hidden="true" className="font-mono text-ink-2">
        –
      </span>
      <span className="sr-only">Not on the carton</span>
    </>
  );
}

/** One row per finding for the approver: where its mark is, what is wrong, which rule, where, and what to do about it. */
function SummaryTable({
  kind,
  caption,
  rows,
  numbers,
  project,
}: {
  kind: "fail" | "review";
  caption: string;
  rows: Finding[];
  numbers: Map<string, number>;
  project: Project;
}) {
  const last = kind === "fail" ? "Expected → Found" : "Status";
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="rp-table" data-summary-table={kind}>
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col style={{ width: "7%" }} />
          <col style={{ width: "30%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "27%" }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Mark</th>
            <th scope="col">Problem</th>
            <th scope="col">Rule</th>
            <th scope="col">Where</th>
            <th scope="col">{last}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const st = decisionStatus(f);
            return (
              <tr
                key={f.id}
                data-summary-row
                data-finding-id={f.id}
                data-verdict={f.verdict}
              >
                <td>
                  <MarkCell n={numbers.get(f.id)} />
                </td>
                <th scope="row" className="font-medium">
                  {f.title}
                </th>
                <td>
                  {f.ruleIds.length === 0
                    ? "–"
                    : ruleParts(f, project).map((r) => (
                        <span
                          key={r.id}
                          title={resolveRule(r.id, project).rule.summary}
                          className="block"
                        >
                          <span className="font-mono">{r.label}</span>
                          {r.title && <span> {r.title}</span>}
                        </span>
                      ))}
                </td>
                <td>{whereShort(f.evidence, project) || "–"}</td>
                {kind === "fail" ? (
                  <td>
                    <span
                      title={f.expected ?? undefined}
                      className="block font-mono"
                    >
                      {f.expected != null
                        ? truncate(f.expected, 60)
                        : "Not stated"}
                    </span>
                    <span
                      title={f.found ?? undefined}
                      className="block font-mono"
                    >
                      <span aria-hidden="true">→ </span>
                      <span className="sr-only">Found: </span>
                      {f.found != null ? truncate(f.found, 60) : "Not found"}
                    </span>
                  </td>
                ) : (
                  <td data-status={st.kind}>
                    <span
                      className={`inline-flex items-start gap-1 font-medium ${st.kind === "pass" ? "text-ok" : st.kind === "fail" ? "text-bad" : "text-warn"}`}
                    >
                      {st.kind === "pass" ? (
                        <CircleCheck
                          size={13}
                          aria-hidden="true"
                          className="mt-0.5 shrink-0"
                        />
                      ) : st.kind === "fail" ? (
                        <CircleX
                          size={13}
                          aria-hidden="true"
                          className="mt-0.5 shrink-0"
                        />
                      ) : (
                        <CircleAlert
                          size={13}
                          aria-hidden="true"
                          className="mt-0.5 shrink-0"
                        />
                      )}
                      <span>{st.word}</span>
                    </span>
                    {st.note && (
                      <span title={st.note} className="block text-ink-2">
                        Note: {truncate(st.note, 80)}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Every math finding in one table: what is printed, what the code computed, and the working. */
function MathTable({
  rows,
  numbers,
  project,
}: {
  rows: Finding[];
  numbers: Map<string, number>;
  project: Project;
}) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="rp-table" data-math-table>
        <caption className="sr-only">
          Numbers checked by code: what is printed, what the code computed and
          the working
        </caption>
        <colgroup>
          <col style={{ width: "7%" }} />
          <col style={{ width: "26%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "27%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Mark</th>
            <th scope="col">Item</th>
            <th scope="col">Printed</th>
            <th scope="col">Computed by code</th>
            <th scope="col">Working</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr
              key={f.id}
              data-report-finding
              data-finding-id={f.id}
              data-verdict={f.verdict}
            >
              <td>
                <MarkCell n={numbers.get(f.id)} />
              </td>
              <th scope="row" className="font-medium">
                <span className="block">{f.title}</span>
                <VerdictBadge verdict={f.verdict} decision={f.decision} />
              </th>
              <td className="font-mono">{f.found ?? "–"}</td>
              <td className="font-mono">{f.expected ?? "–"}</td>
              <td className="font-mono">
                {f.proof ?? "–"}
                {f.basis === "ai" && (
                  <span className="block font-sans text-ai">
                    AI judgement, not checked by code
                  </span>
                )}
              </td>
              <td>{whereShort(f.evidence, project) || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClearedRow({ item }: { item: Cleared }) {
  return (
    <li data-report-row data-cleared={item.id} className="rp-line">
      <ShieldCheck
        size={14}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-ok"
      />
      <span>
        <span className="font-medium">{item.title}</span> ·{" "}
        <span className="font-mono">{item.proof}</span>
      </span>
    </li>
  );
}

/** The carton with every fail and review mark, drawn from the same pieces as Marked-up artwork. */
function ArtworkMarkup({ project, set }: { project: Project; set: MarkSet }) {
  const { source } = useProject();
  const mockMode = source === "mock";
  const packId = packFileId(project);
  const packFile = project.files.find((f) => f.id === packId);
  const [attempt, setAttempt] = useState(0);
  const img = useCartonImage(packId, !mockMode && !!packId, attempt);
  const zones = usePackZones(mockMode, packId);
  const regions = useMemo(
    () => [
      ...zones,
      ...(packId ? regionsFromFacts(project.facts, packId) : []),
    ],
    [zones, project.facts, packId],
  );
  const groups = useMemo(
    () => clusterMarks(set.marks, regions),
    [set.marks, regions],
  );
  const hints: BBox[] = useMemo(
    () =>
      project.facts.flatMap((f) =>
        f.sources
          .filter((s) => s.fileId === packId && s.where.bbox)
          .map((s) => s.where.bbox as BBox),
      ),
    [project.facts, packId],
  );
  if (!packId)
    return (
      <Empty>
        There is no carton PDF among the files, so there is nothing to mark up.
      </Empty>
    );
  const page =
    img.status === "ready"
      ? { w: img.w, h: img.h }
      : fallbackPage(project, packId);
  const total = set.marks.length + set.offPack.length;
  return (
    <>
      {img.status === "error" && (
        <div className="mb-2">
          <CartonError
            reason={img.reason}
            then="The marks sit on the panel outlines instead."
            onRetry={() => setAttempt((a) => a + 1)}
          />
        </div>
      )}
      {total === 0 ? (
        <Empty>
          Nothing to mark: no fail or review check has a spot on the carton.
        </Empty>
      ) : (
        <figure
          aria-labelledby="markup-caption"
          className="report-artwork overflow-hidden rounded-card border border-border bg-surface"
        >
          {img.status === "loading" ? (
            <CartonDrawing ratio={`${page.w + 168} / ${page.h}`} />
          ) : (
            <MarkupCanvas
              page={page}
              image={img.status === "ready" ? img.url : null}
              panels={project.pack.panels}
              hints={hints}
              set={set}
              groups={groups}
              marked
              sticky={false}
              animate={false}
              interactive={false}
              label="Carton markup"
            />
          )}
          <figcaption
            id="markup-caption"
            className="border-t border-border px-3 py-2 text-[12px] text-ink-2"
          >
            {packFile?.name ?? "Carton"} · fail and review marks, positions in
            mm. The tables on the first page say what each numbered mark is.
          </figcaption>
        </figure>
      )}
    </>
  );
}

/** Print approval report: a summary an approver can sign from, the marked-up carton, then the evidence. */
export function Report() {
  const { project, market, source } = useProject();
  const [today] = useState(() => new Date());
  const [printMode, setPrintMode] = useState<PrintMode>("all");
  const findings = project.findings;
  const v = printVerdict(findings);
  const sorted = (verdict: Finding["verdict"]) =>
    orderFindings(findings.filter((f) => f.verdict === verdict));
  const dataProblems = findings.filter(hasNoEvidence);
  const fails = sorted("fail").filter((f) => !hasNoEvidence(f));
  const reviews = sorted("review");
  const passes = sorted("pass");
  const undecided = reviews.filter((f) => !f.decision);
  const decided = findings
    .filter((f) => f.decision)
    .sort((a, b) => Date.parse(a.decision!.at) - Date.parse(b.decision!.at));
  const rules = useMemo(() => rulesUsed(project), [project]);
  const packId = packFileId(project);
  const set = useMemo(
    () => buildMarks(project, packId ?? "", source === "mock"),
    [project, packId, source],
  );
  const numbers = useMemo(() => markNumbers(set.marks), [set]);
  const artwork = project.files.filter((f) => f.role === "artwork");
  const approved = project.files.filter((f) => f.role === "approved_info");
  const marketName = MARKETS.find((m) => m.id === market)?.label ?? market;
  const date = today.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const names = (list: typeof artwork) =>
    list.length ? list.map((f) => f.name).join(", ") : "Not set";

  // After the print dialog closes, the whole report is back on screen.
  useEffect(() => {
    const back = () => setPrintMode("all");
    window.addEventListener("afterprint", back);
    return () => window.removeEventListener("afterprint", back);
  }, []);

  if (findings.length === 0) return <EmptyReport />;

  const print = (mode: PrintMode) => {
    // The attribute must be on the page before the browser lays it out for printing.
    flushSync(() => setPrintMode(mode));
    window.print();
  };

  const failRows = byMark(fails, numbers);
  const reviewRows = byMark(reviews, numbers);
  const mathRows = [...fails, ...reviews].filter((f) => f.kind === "math");
  const failBlocks = byMark(
    fails.filter((f) => f.kind !== "math"),
    numbers,
  );
  const reviewBlocks = byMark(
    reviews.filter((f) => f.kind !== "math"),
    numbers,
  );
  const detailCount = mathRows.length + failBlocks.length + reviewBlocks.length;

  let VerdictIcon = CircleDashed;
  let tone = "text-ink-2 border-border";
  let line = "";
  if (v.ready) {
    VerdictIcon = CircleCheck;
    tone = "text-ok border-ok/40 bg-ok/10";
    line = "Ready to print";
  } else {
    VerdictIcon = v.fail ? CircleX : CircleAlert;
    tone = v.fail
      ? "text-bad border-bad/40 bg-bad/10"
      : "text-warn border-warn/40 bg-warn/10";
    line = `Not ready to print: ${v.fail} fail · ${v.review} review`;
  }

  const meta: [string, string][] = [
    ["Product", productLine(project)],
    ["Artwork file", names(artwork)],
    ["Approved information", names(approved)],
    [
      "Rulebook",
      project.rulebook ? project.rulebook.name : "No rulebook loaded",
    ],
    ["Market", marketName],
    ["Date", date],
  ];
  const printBtn =
    "inline-flex items-center gap-1.5 rounded-chip px-4 py-2 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info";

  return (
    <article
      aria-labelledby="report-title"
      data-print={printMode}
      className="report-doc mx-auto max-w-[900px]"
    >
      <header>
        <div className="no-print flex flex-wrap items-start justify-between gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
            Print approval report
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => print("summary")}
              className={`${printBtn} border border-border bg-surface text-ink hover:border-ink-2`}
            >
              <Printer size={16} aria-hidden="true" />
              Print summary
            </button>
            <button
              type="button"
              onClick={() => print("all")}
              className={`${printBtn} bg-accent text-white hover:bg-accent/90`}
            >
              <Printer size={16} aria-hidden="true" />
              Print report
            </button>
          </div>
        </div>
        <p className="hidden text-[10pt] font-semibold uppercase tracking-wide print:block">
          Print approval report
        </p>
        <h1
          id="report-title"
          className="mt-1 flex items-center gap-2 text-[20px] font-semibold"
        >
          <FileText size={20} aria-hidden="true" className="text-ink-2" />
          Report
        </h1>
        <dl
          data-report-meta
          className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2"
        >
          {meta.map(([k, val]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[12px] text-ink-2">{k}</dt>
              <dd className="break-words text-[14px] font-medium">{val}</dd>
            </div>
          ))}
        </dl>
        <p
          data-report-verdict
          className={`mt-4 flex flex-wrap items-center gap-2 rounded-card border px-4 py-3 text-[18px] font-semibold ${tone}`}
        >
          <VerdictIcon size={22} aria-hidden="true" />
          {line}
        </p>
        <p className="mt-2 text-[13px] text-ink-2">
          <span className="font-mono">
            {fails.length + dataProblems.length}
          </span>{" "}
          fail · <span className="font-mono">{reviews.length}</span> needs
          review (<span className="font-mono">{undecided.length}</span> not
          decided yet) · <span className="font-mono">{passes.length}</span> pass
          · <span className="font-mono">{project.cleared.length}</span> checked
          and fine. A review item a person decided is a problem counts as a fail
          in the line above.
        </p>
      </header>

      {dataProblems.length > 0 && (
        <section
          aria-labelledby="data-problem"
          role="alert"
          data-part="summary"
          className="mt-6 rounded-card border border-bad/40 bg-bad/10 p-4"
        >
          <h2
            id="data-problem"
            className="flex items-center gap-1.5 text-[16px] font-semibold"
          >
            <CircleAlert size={16} aria-hidden="true" />
            Data problem
          </h2>
          <p className="mt-1 text-[14px]">
            {dataProblems.length} result
            {dataProblems.length === 1 ? " has" : "s have"} no evidence, so{" "}
            {dataProblems.length === 1 ? "it is" : "they are"} not shown as
            {dataProblems.length === 1 ? " a fail" : " fails"}. This should not
            happen; tell whoever runs the checker.
          </p>
          <ul className="mt-1 list-disc pl-5 text-[14px]">
            {dataProblems.map((f) => (
              <li key={f.id}>{f.title}</li>
            ))}
          </ul>
        </section>
      )}

      <Section
        id="rep-fail"
        title="Must change before print"
        count={failRows.length}
        part="summary"
      >
        {failRows.length === 0 ? (
          <Empty>Nothing failed.</Empty>
        ) : (
          <SummaryTable
            kind="fail"
            caption="Fail findings, in the order of their marks on the carton"
            rows={failRows}
            numbers={numbers}
            project={project}
          />
        )}
      </Section>

      <Section
        id="rep-review"
        title="Needs a person"
        count={reviewRows.length}
        part="summary"
      >
        {reviewRows.length === 0 ? (
          <Empty>Nothing needs a person.</Empty>
        ) : (
          <SummaryTable
            kind="review"
            caption="Findings a person decides, with their status"
            rows={reviewRows}
            numbers={numbers}
            project={project}
          />
        )}
      </Section>

      <section
        aria-labelledby="rep-signoff"
        data-signoff
        data-part="summary"
        className="mt-8 border-t-2 border-ink pt-4"
      >
        <h2 id="rep-signoff" className={h2}>
          Sign-off
        </h2>
        <p className="mt-6 flex flex-wrap items-end gap-x-3 gap-y-6 text-[14px]">
          <span>Approved for print by</span>
          <span
            aria-hidden="true"
            className="inline-block h-6 w-72 border-b border-ink"
          />
          <span>date</span>
          <span
            aria-hidden="true"
            className="inline-block h-6 w-40 border-b border-ink"
          />
        </p>
        <p className="mt-1 text-[12px] text-ink-2">
          Both lines are left blank on purpose: sign the printed report.
        </p>
      </section>

      <Section
        id="rep-artwork"
        title="Marked-up artwork"
        part="summary"
        className="report-artwork-page"
      >
        <ArtworkMarkup project={project} set={set} />
      </Section>

      <Section
        id="rep-evidence"
        title="Evidence for each finding"
        count={detailCount}
        part="detail"
      >
        {detailCount === 0 ? (
          <Empty>Nothing failed and nothing needs a person.</Empty>
        ) : (
          <div className="space-y-5">
            {mathRows.length > 0 && (
              <section aria-labelledby="rep-math">
                <h3 id="rep-math" className="rp-h3">
                  Numbers checked by code ({mathRows.length})
                </h3>
                <div className="mt-2">
                  <MathTable
                    rows={mathRows}
                    numbers={numbers}
                    project={project}
                  />
                </div>
              </section>
            )}
            {failBlocks.length > 0 && (
              <section aria-labelledby="rep-ev-fail" data-ev-group="fail">
                <h3 id="rep-ev-fail" className="rp-h3">
                  Fail ({failBlocks.length})
                </h3>
                <ul className="mt-2 space-y-2">
                  {failBlocks.map((f) => (
                    <li key={f.id}>
                      <ReportFinding
                        finding={f}
                        project={project}
                        mark={numbers.get(f.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {reviewBlocks.length > 0 && (
              <section aria-labelledby="rep-ev-review" data-ev-group="review">
                <h3 id="rep-ev-review" className="rp-h3">
                  Needs review ({reviewBlocks.length})
                </h3>
                <ul className="mt-2 space-y-2">
                  {reviewBlocks.map((f) => (
                    <li key={f.id}>
                      <ReportFinding
                        finding={f}
                        project={project}
                        mark={numbers.get(f.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Section>

      <Section id="rep-pass" title="Passed" count={passes.length} part="detail">
        {passes.length === 0 ? (
          <Empty>Nothing passed yet.</Empty>
        ) : (
          <ul className="space-y-1">
            {passes.map((f) => (
              <li
                key={f.id}
                data-report-row
                data-finding-id={f.id}
                data-verdict="pass"
                className="rp-line"
              >
                <CircleCheck
                  size={14}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-ok"
                />
                <span>
                  <span className="font-medium">{f.title}</span>
                  <span className="text-ink-2">
                    {" "}
                    · {whereShort(f.evidence, project) || "no spot recorded"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="rep-cleared"
        title="Checked and fine"
        count={project.cleared.length}
        part="detail"
        className="rp-tight"
      >
        {project.cleared.length === 0 ? (
          <Empty>Nothing was checked and cleared without a flag.</Empty>
        ) : (
          <>
            <p className="mb-2 text-[13px] text-ink-2">
              Looked like a problem, checked by code, not flagged. Each line is
              its proof.
            </p>
            <ul className="space-y-1">
              {project.cleared.map((c) => (
                <ClearedRow key={c.id} item={c} />
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section
        id="rep-rules"
        title="Rules used"
        count={rules.length}
        part="detail"
      >
        {rules.length === 0 ? (
          <Empty>No rule is cited and no rulebook is loaded.</Empty>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="rp-table">
              <caption className="sr-only">
                Rules behind the report, with their source, status and results
              </caption>
              <colgroup>
                <col style={{ width: "17%" }} />
                <col style={{ width: "39%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "17%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Title / summary</th>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col">Results</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr
                    key={`${r.origin}-${r.id}`}
                    data-report-row
                    data-rule={r.id}
                    data-unverified={r.unverified || undefined}
                  >
                    <th scope="row" className="font-mono font-normal">
                      {r.origin === "Rulebook" ? r.id : tidyRef(r.ref)}
                    </th>
                    <td>
                      <span title={r.label} className="rp-clamp">
                        {r.label}
                      </span>
                    </td>
                    <td>{r.origin}</td>
                    <td>
                      {r.notApplied ? (
                        <span className="inline-flex items-start gap-1 font-medium text-warn">
                          <TriangleAlert
                            size={13}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0"
                          />
                          {r.status}
                        </span>
                      ) : (
                        r.status
                      )}
                    </td>
                    <td>{resultsText(r.verdicts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        id="rep-decisions"
        title="Decisions log"
        count={decided.length}
        part="detail"
      >
        {decided.length === 0 ? (
          <Empty>No review decision has been made yet.</Empty>
        ) : (
          <ol className="space-y-1">
            {decided.map((f) => (
              <li
                key={f.id}
                data-report-row
                data-decision-of={f.id}
                className="rp-line"
              >
                <UserRound
                  size={14}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-ink-2"
                />
                <span>
                  <time
                    dateTime={f.decision!.at}
                    className="font-mono text-[12px] text-ink-2"
                  >
                    {stamp(f.decision!.at)}
                  </time>{" "}
                  <span className="font-medium">{f.decision!.by}</span>{" "}
                  <span>{DECISION_WORD[f.decision!.verdict]}</span>
                  <span className="text-ink-2"> · {f.title}</span>
                  {f.decision!.note && (
                    <span className="block text-ink-2">
                      Note: {f.decision!.note}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </article>
  );
}
