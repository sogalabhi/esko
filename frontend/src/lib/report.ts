import {
  fileShort,
  formatValue,
  marketCode,
  ruleStatusText,
  sourceShort,
  titleCase,
} from "./labels";
import { resolveRule } from "./checks";
import { tidyRef } from "./ruleRef";
import type { Mark } from "./markup";
import type { Finding, Project, Source, Verdict } from "../types/project";

/** Product line as the top bar derives it: the statement of identity and the net quantity. */
export function productLine(project: Pick<Project, "facts">): string {
  const identity = project.facts.find(
    (f) => f.field === "Statement of identity",
  );
  const net = project.facts.find((f) => f.field === "Net quantity");
  return [
    identity?.value ? titleCase(identity.value) : "Untitled product",
    net ? formatValue(net) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A fail the report cannot show as one: it has no evidence. It should never happen. */
export const hasNoEvidence = (f: Finding): boolean =>
  f.verdict === "fail" && f.evidence.length === 0;

export interface RuleRow {
  id: string;
  ref: string;
  /** Title (rulebook) or summary (market rule). */
  label: string;
  origin: string;
  status: string;
  /** Rulebook rule whose quote code could not find: listed, not applied. */
  unverified: boolean;
  /** Not applied: unverified or proposed. */
  notApplied: boolean;
  /** Verdicts of the findings that cite the rule. */
  verdicts: Verdict[];
}

/**
 * Rules behind the report: every market rule a finding cites, then every rule of the loaded rulebook
 * (so an unverified or proposed rule is visible as "not applied" instead of silently missing).
 */
export function rulesUsed(
  project: Pick<Project, "rules" | "rulebook" | "findings">,
): RuleRow[] {
  const verdictsOf = (id: string) =>
    project.findings
      .filter((f) => f.ruleIds.includes(id))
      .map((f) => f.verdict);
  const rulebookIds = new Set(project.rulebook?.rules.map((r) => r.id) ?? []);
  const cited = [...new Set(project.findings.flatMap((f) => f.ruleIds))].filter(
    (id) => !rulebookIds.has(id),
  );
  const rows: RuleRow[] = cited.map((id) => {
    const r = resolveRule(id, project);
    const known = project.rules.some((x) => x.id === id);
    return {
      id,
      ref: r.rule.ref,
      label: known ? r.rule.summary : "This rule is not in the loaded rules.",
      origin: known ? marketCode(r.rule.market) : "Unknown",
      status: known ? ruleStatusText(r.rule) : "not loaded",
      unverified: false,
      notApplied: false,
      verdicts: verdictsOf(id),
    };
  });
  for (const r of project.rulebook?.rules ?? []) {
    const unverified = !r.source.quoteChecked;
    const proposed = r.status === "proposed";
    rows.push({
      id: r.id,
      ref: r.id,
      label: r.title,
      origin: "Rulebook",
      status: unverified
        ? "unverified, not applied"
        : proposed
          ? "proposed, not applied"
          : "in force",
      unverified,
      notApplied: unverified || proposed,
      verdicts: verdictsOf(r.id),
    });
  }
  return rows;
}

/** Cut a long value for a table cell: at most `max` characters, ending in an ellipsis. The full text belongs in a title attribute. */
export function truncate(text: string | undefined | null, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** The number of each finding's mark on the carton (lowest number when it has several). A finding with no spot has none. */
export function markNumbers(
  marks: Pick<Mark, "n" | "finding">[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of [...marks].sort((a, b) => a.n - b.n))
    if (m.finding && !out.has(m.finding.id)) out.set(m.finding.id, m.n);
  return out;
}

/** Findings by mark number on the carton, the ones with no mark last (their order is kept). */
export function byMark<T extends Finding>(
  list: T[],
  numbers: Map<string, number>,
): T[] {
  const rank = (f: Finding) => numbers.get(f.id) ?? Number.POSITIVE_INFINITY;
  return list
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map((x) => x.f);
}

/**
 * Where a set of sources sit, short: "Carton: Left, Back · Sheet: B48, C48". Grouped by file kind, each
 * place once, at most `cap` places before "+N more".
 */
export function whereShort(
  sources: Source[],
  project: Pick<Project, "files">,
  cap = 6,
): string {
  const groups = new Map<string, string[]>();
  let total = 0;
  let more = 0;
  for (const s of sources) {
    const file = project.files.find((f) => f.id === s.fileId);
    const full = sourceShort(s, file);
    const head = fileShort(file);
    const spot = full === head ? "" : full.slice(head.length + 3);
    const list = groups.get(head) ?? [];
    if (list.includes(spot)) continue;
    if (total >= cap) {
      more++;
      continue;
    }
    list.push(spot);
    groups.set(head, list);
    total++;
  }
  const parts = [...groups.entries()].map(([head, spots]) => {
    const named = spots.filter(Boolean);
    return named.length ? `${head}: ${named.join(", ")}` : head;
  });
  return parts.join(" · ") + (more ? ` · +${more} more` : "");
}

/** A rule a finding cites, short: a market rule by its regulation reference, a rulebook rule by its id and short title. */
export interface RulePart {
  id: string;
  /** The id (rulebook) or the tidied regulation reference (market rule), cut to fit a table cell. */
  label: string;
  title?: string;
}

export function ruleParts(
  f: Finding,
  project: Pick<Project, "rules" | "rulebook">,
): RulePart[] {
  return f.ruleIds.map((id) => {
    const r = resolveRule(id, project);
    if (r.title) return { id, label: id, title: truncate(r.title, 30) };
    return {
      id,
      label: truncate(
        r.rule.ref && r.rule.ref !== id ? tidyRef(r.rule.ref) : id,
        34,
      ),
    };
  });
}

/** The first piece of evidence that points at a spot on the carton PDF; the report shows one crop per finding. */
export function cartonEvidence(
  f: Finding,
  project: Pick<Project, "files">,
): Source | undefined {
  return f.evidence.find((s) => {
    const type = project.files.find((x) => x.id === s.fileId)?.type;
    return (
      (type === "pdf" || type === "document") &&
      (!!s.where.bbox || !!s.where.panel)
    );
  });
}

/** "17 Oct 2026". */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

/** What a person decided about a review item, for the status column. */
export function decisionStatus(f: Finding): {
  word: string;
  note?: string;
  kind: "open" | "pass" | "fail";
} {
  const d = f.decision;
  if (!d) return { word: "Not decided yet", kind: "open" };
  return {
    word: `${d.verdict === "pass" ? "Fine" : "A problem"} — ${d.by}, ${shortDate(d.at)}`,
    note: d.note,
    kind: d.verdict,
  };
}

/** "2 fail · 1 review" for a rule's results. */
export function resultsText(verdicts: Verdict[]): string {
  if (verdicts.length === 0) return "No result";
  const word: Record<Verdict, string> = {
    fail: "fail",
    review: "review",
    pass: "pass",
  };
  return (["fail", "review", "pass"] as const)
    .filter((v) => verdicts.includes(v))
    .map((v) => `${verdicts.filter((x) => x === v).length} ${word[v]}`)
    .join(" · ");
}
