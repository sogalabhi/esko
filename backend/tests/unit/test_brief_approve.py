from datetime import datetime, timezone

import pytest

from app.brief import ApprovalError, Brief, Section, Sentence, approve, edit_sentence

NOW = datetime(2026, 10, 17, 9, 30, tzinfo=timezone.utc)


def brief(status="ok"):
    return Brief(version=3, sections=[Section(title="Objective", sentences=[
        Sentence(text="Redesign the carton", status=status)])])


def test_approve_records_name_and_time():
    b = approve(brief(), " Asha ", NOW)
    assert b.approvedBy == "Asha" and b.approvedAt == NOW and b.version == 3


def test_approve_refused_while_unproven():
    with pytest.raises(ApprovalError):
        approve(brief("unproven"), "Asha", NOW)


def test_approve_refused_without_name():
    with pytest.raises(ApprovalError):
        approve(brief(), "  ", NOW)


def test_edit_bumps_version_clears_approval_and_unproves():
    approved = approve(brief(), "Asha", NOW)
    edited = edit_sentence(approved, 0, 0, "Redesign the carton for 2027")
    assert edited.version == 4 and edited.approvedBy is None and edited.approvedAt is None
    assert edited.sections[0].sentences[0].status == "unproven"
    assert approved.approvedBy == "Asha"  # original untouched
