import re
from pathlib import Path

_DIR = Path(__file__).parent


def load_prompt(name: str) -> tuple[str, str]:
    """Load the latest <name>.vN.md; returns (text, version like 'v1')."""
    pattern = re.compile(re.escape(name) + r"\.v(\d+)\.md")
    found = [(int(m.group(1)), p) for p in _DIR.glob(f"{name}.v*.md") if (m := pattern.fullmatch(p.name))]
    if not found:
        raise FileNotFoundError(f"No prompt named {name!r}")
    n, path = max(found)
    return path.read_text(encoding="utf-8").strip(), f"v{n}"
