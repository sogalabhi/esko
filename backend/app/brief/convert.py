"""The brief as the project JSON carries it (camelCase, ISO times) <-> the brief the audit and approval work on."""
from __future__ import annotations

from datetime import datetime

from app.brief.model import Brief, Section, Sentence
from app.models.project import Brief as ProjectBrief
from app.models.project import BriefLogEntry, BriefSection, BriefSentence


def to_internal(pb: ProjectBrief) -> Brief:
    return Brief(
        version=pb.version,
        sections=[Section(title=s.title, sentences=[
            Sentence(text=x.text, factIds=list(x.fact_ids), status=x.status, problems=list(x.problems), source=x.source)
            for x in s.sentences]) for s in pb.sections],
        approvedBy=pb.approved_by,
        approvedAt=datetime.fromisoformat(pb.approved_at) if pb.approved_at else None,
    )


def to_project(b: Brief, log: list[BriefLogEntry]) -> ProjectBrief:
    return ProjectBrief(
        version=b.version,
        sections=[BriefSection(title=s.title, sentences=[
            BriefSentence(text=x.text, fact_ids=list(x.factIds), status=x.status, problems=list(x.problems), source=x.source)
            for x in s.sentences]) for s in b.sections],
        approved_by=b.approvedBy,
        approved_at=b.approvedAt.isoformat(timespec="seconds") if b.approvedAt else None,
        log=list(log),
    )
