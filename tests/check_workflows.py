#!/usr/bin/env python3
"""Validate workflow YAML structure and assert that untrusted rendering has no OIDC access."""
from pathlib import Path
import json
import yaml

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    render_path = ROOT / ".github" / "workflows" / "render.yml"
    test_path = ROOT / ".github" / "workflows" / "test-render.yml"
    for path in (render_path, test_path):
        parsed = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(parsed, dict) or not isinstance(parsed.get("jobs"), dict):
            raise SystemExit(f"Workflow YAML invalide : {path.relative_to(ROOT)}")

    render = yaml.safe_load(render_path.read_text(encoding="utf-8"))
    jobs = render["jobs"]
    for name in ("prepare", "render", "cleanup"):
        if name not in jobs:
            raise SystemExit(f"Étape de workflow absente : {name}")
    render_job = jobs["render"]
    if "id-token" in (render_job.get("permissions") or {}):
        raise SystemExit("Le job qui exécute le HTML ne doit pas avoir de permission OIDC.")
    render_text = render_path.read_text(encoding="utf-8")
    for required in ("api/source-url", "api/publish-url", "source_url_b64", "publish_url_b64", "inputs.sortie", "image/png", "image/jpeg", "image/webp"):
        if required not in render_text:
            raise SystemExit(f"Configuration de rendu privé manquante : {required}")
    if "api/runner-source" in render_text or "actions/upload-artifact@v4" in render_text or "gh release create" in render_text:
        raise SystemExit("Ancien flux de source/artefact public encore présent.")

    vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    if vercel.get("outputDirectory") != "docs":
        raise SystemExit("Le dossier de sortie Vercel ne correspond plus à l'interface.")

    print("Syntaxe YAML et contrôles de permissions du workflow OK.")


if __name__ == "__main__":
    main()
