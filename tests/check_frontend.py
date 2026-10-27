#!/usr/bin/env python3
"""Syntax-check frontend and server JavaScript, and guard privacy regressions."""
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
    videos_api = (ROOT / "api" / "videos.js").read_text(encoding="utf-8")
    for required in ("github-release", "github-artifact", "req.method === 'GET'", "actions/artifacts?per_page=100"):
        if required not in videos_api:
            raise SystemExit(f"Legacy history regression: missing {required}")
    for required in ("const legacy = await api('/videos')", "r.source === 'github-artifact'", "r.source === 'github-release'"):
        if required not in html:
            raise SystemExit(f"Legacy history UI regression: missing {required}")
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

    checked = []
    with tempfile.TemporaryDirectory(prefix="rendrax-js-check-") as temp_dir:
        for index, (_, source) in enumerate(scripts, start=1):
            path = Path(temp_dir) / f"inline-{index}.mjs"
            path.write_text(source, encoding="utf-8")
            checked.append((f"inline JavaScript block {index}", path))

        for directory in (ROOT / "api", ROOT / "lib"):
            for path in sorted(directory.glob("*.js")):
                checked.append((str(path.relative_to(ROOT)), path))

        for label, path in checked:
            result = subprocess.run(
                ["node", "--check", str(path)],
                capture_output=True,
                text=True,
                check=False,
                timeout=15,
            )
            if result.returncode:
                raise SystemExit(
                    f"JavaScript syntax error in {label}:\n"
                    f"{result.stdout}{result.stderr}"
                )

    print(
        f"Syntax OK: {len(scripts)} inline JavaScript block(s), "
        f"{len(checked) - len(scripts)} server module(s); privacy checks OK."
    )


if __name__ == "__main__":
    main()
