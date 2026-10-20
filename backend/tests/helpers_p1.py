"""Problem 1 (design brief) tests need design and brand-basics questions, which checker mode switches off in the
company pack (`design_questions: false`). They take a copy of the pack with the setting turned back on."""
from app.analysis import load_market
from app.markets.schema import MarketPack


def design_pack(market: str = "us") -> MarketPack:
    pack = load_market(market).model_copy(deep=True)  # never touch the cached pack
    for s in [pack.settings, *pack.layers]:
        s.design_questions = True
    return pack
