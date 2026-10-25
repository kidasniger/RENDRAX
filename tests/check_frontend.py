#!/usr/bin/env python3
"""Static checks for RENDRAX's inline JavaScript and privacy-sensitive references."""
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "docs" / "index.html"
SCRIPT_RE = re.compile(r"<script\b([^>]*)>([\s\S]*?)</script\s*>", re.IGNORECASE)
NON_EXECUTABLE = re.compile(
    r"""\btype\s*=\s*["'](?:application/json|application/ld\+json|importmap)["']""",
    re.IGNORECASE,
)


def main() -> None:
    html = PAGE.read_text(encoding="utf-8")
    for forbidden in ("esm.sh/react", "uploads/vmv7j3erf.html"):
        if forbidden in html:
            raise SystemExit(f"Privacy/dependency regression: {forbidden}")

    scripts = [
        (attrs, body)
        for attrs, body in SCRIPT_RE.findall(html)
        if body.strip() and not NON_EXECUTABLE.search(attrs)
    ]
    if not scripts:
        raise SystemExit("No executable inline scripts found.")

    with tempfile.TemporaryDirectory(prefix="rendrax-js-check-") as temp_dir:
        for index, (_, source) in enumerate(scripts, start=1):
            path = Path(temp_dir) / f"inline-{index}.mjs"
            path.write_text(source, encoding="utf-8")
            result = subprocess.run(
                ["node", "--check", str(path)],
                capture_output=True,
                text=True,
                check=False,
                timeout=15,
            )
            if result.returncode:
                raise SystemExit(
                    f"Inline JavaScript block {index} has a syntax error:\n"
                    f"{result.stdout}{result.stderr}"
                )

    print(f"Syntax OK: {len(scripts)} inline JavaScript block(s); privacy checks OK.")


if __name__ == "__main__":
    main()
