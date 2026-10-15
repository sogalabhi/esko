"""Approve stamps name and time; any edit afterwards bumps the version and clears the approval."""
from datetime import datetime

from app.brief.model import Brief, Section, Sentence


class ApprovalError(ValueError):
    pass


def approve(brief: Brief, name: str, now: datetime) -> Brief:
    if not name.strip():
        raise ApprovalError("Approval needs a name")
    unproven = brief.unproven
    if unproven:
        raise ApprovalError(f"{len(unproven)} sentence(s) are unproven; fix or remove them first")
    return brief.model_copy(update={"approvedBy": name.strip(), "approvedAt": now})


def edit_sentence(
    brief: Brief, section: int, index: int, text: str, fact_ids: list[str] | None = None,
) -> Brief:
    """Replace a sentence. It becomes unproven until the audit runs again."""
    old = brief.sections[section].sentences[index]
    new = Sentence(text=text, factIds=list(old.factIds if fact_ids is None else fact_ids))
    sections = [s.model_copy(deep=True) for s in brief.sections]
    sentences = sections[section].sentences
    sections[section] = Section(title=sections[section].title,
                                sentences=[*sentences[:index], new, *sentences[index + 1:]])
    return brief.model_copy(update={"sections": sections, "version": brief.version + 1,
                                    "approvedBy": None, "approvedAt": None})
