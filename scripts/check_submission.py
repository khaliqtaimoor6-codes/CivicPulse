#!/usr/bin/env python3
"""Mechanical pre-submission lint for CivicPulse.

Run from the repository root, as the assignment README instructs:

    python scripts/check_submission.py

This is a lint, not a grader. It mechanises the automatic deductions in
section 5.3 of the assignment brief -- the failures that cost marks
silently -- plus the structural items from sections 3.4 and 5.7. A clean
run does not mean a good mark; a dirty run very nearly guarantees a bad
one.

Exit code is 0 when every check passes, 1 otherwise.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PASS, FAIL, WARN, SKIP = "PASS", "FAIL", "WARN", "SKIP"
results: list[tuple[str, str, str]] = []


def record(name: str, status: str, detail: str = "") -> None:
    results.append((name, status, detail))


def read(rel: str) -> str:
    path = ROOT / rel
    return path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""


def git(*args: str) -> str:
    try:
        out = subprocess.run(
            ["git", *args],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
        return out.stdout if out.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def skip_without_git() -> bool:
    return not (ROOT / ".git").exists()


# --------------------------------------------------------------------------
# 5.3 automatic deductions
# --------------------------------------------------------------------------


def check_no_secrets_in_history() -> None:
    """-20: a .env, key, token or password anywhere in git history."""
    if skip_without_git():
        record("no secrets in git history", SKIP, "not a git repository")
        return

    added = git("log", "--all", "--pretty=format:", "--name-only", "--diff-filter=A")
    leaked = sorted(
        {
            name
            for name in added.split()
            if re.search(r"(^|/)\.env$|\.pem$|id_rsa|\.key$|credentials?\.json$", name)
            and not name.endswith(".example")
        }
    )
    if leaked:
        record("no secrets in git history", FAIL, f"tracked: {', '.join(leaked[:5])}")
        return

    # Look for high-entropy assignments that are not obviously placeholders.
    pattern = re.compile(
        r"(api[_-]?key|secret|password|passwd|token)"
        r"\s*[:=]\s*[\"']?([A-Za-z0-9/+_\-]{16,})",
        re.IGNORECASE,
    )
    benign = re.compile(
        r"example|placeholder|your[_-]|changeme|dummy|fake|redacted|\$\{|\$[A-Z_]+"
        r"|getenv|environ|password-stdin|GITHUB_TOKEN|secretkeyref|"
        r"context\.set|test_|\.md:",
        re.IGNORECASE,
    )
    suspects: list[str] = []
    for rev in git("rev-list", "--all").split():
        for line in git("grep", "-nIE", pattern.pattern, rev, "--", ":!*.md").splitlines():
            if len(line) > 7 and not benign.search(line):
                suspects.append(line.split(":", 2)[-1].strip()[:90])
        if len(suspects) > 5:
            break
    if suspects:
        record("no secrets in git history", FAIL, f"{len(suspects)} suspect line(s): {suspects[0]}")
    else:
        record("no secrets in git history", PASS)


def check_no_key_in_manifests() -> None:
    """-15: an LLM API key in a committed manifest, even base64-encoded."""
    offenders: list[str] = []
    for path in sorted((ROOT / "k8s").rglob("*.yaml")):
        for num, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if re.search(r"(api[_-]?key|llm_api_key)\s*:\s*(?!$)", stripped, re.IGNORECASE):
                value = stripped.split(":", 1)[1].strip().strip("\"'")
                # A reference to a Secret is the correct pattern; a literal is not.
                if value and not value.startswith("$"):
                    offenders.append(f"{path.relative_to(ROOT)}:{num}")
    if offenders:
        record("no API key literal in k8s manifests", FAIL, ", ".join(offenders[:4]))
    else:
        record("no API key literal in k8s manifests", PASS, "Secret refs only")


def check_pinned_images() -> None:
    """-8: unpinned base image, or postgres/redis/node without a tag."""
    problems: list[str] = []
    for dockerfile in ("backend/Dockerfile", "frontend/Dockerfile"):
        for line in read(dockerfile).splitlines():
            m = re.match(r"\s*FROM\s+(\S+)", line, re.IGNORECASE)
            if not m:
                continue
            image = m.group(1)
            if image.startswith("$"):
                continue
            if ":" not in image.split("/")[-1] and "@" not in image:
                problems.append(f"{dockerfile}: {image} has no tag")
            elif re.search(r":(alpine|latest|stable|main|edge)$", image):
                problems.append(f"{dockerfile}: {image} is a floating tag")
    for rel in ("compose.yaml", "compose.prod.yaml"):
        text = read(rel)
        for image in re.findall(r"^\s+image:\s*(\S+)", text, re.MULTILINE):
            if image.startswith("$"):
                continue
            tail = image.split("/")[-1]
            if ":" not in tail and "@" not in image:
                problems.append(f"{rel}: {image} has no tag")
    if problems:
        record("images pinned", FAIL, "; ".join(problems[:4]))
    else:
        record("images pinned", PASS)


def check_no_localhost_service_traffic() -> None:
    """-8: localhost used for service-to-service communication."""
    problems: list[str] = []
    for rel in ("compose.yaml", "compose.prod.yaml"):
        for num, line in enumerate(read(rel).splitlines(), 1):
            s = line.strip()
            if s.startswith("#"):
                continue
            # A healthcheck probing itself, or a browser CORS origin, is fine.
            if "test:" in s or "CORS_ORIGIN" in s or "command:" in s:
                continue
            if re.search(r"(?<![:\w])(localhost|127\.0\.0\.1)(?![\w.])", s):
                problems.append(f"{rel}:{num}")
    for path in sorted((ROOT / "k8s").rglob("*.yaml")):
        for num, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if re.search(r"(?<![:\w])(localhost|127\.0\.0\.1)(?![\w.])", line):
                problems.append(f"{path.relative_to(ROOT)}:{num}")
    if problems:
        record("no localhost service-to-service", FAIL, ", ".join(problems[:4]))
    else:
        record("no localhost service-to-service", PASS)


def check_network_segmentation() -> None:
    """-8: the frontend must not be able to reach the database."""
    text = read("compose.yaml")
    if not text:
        record("frontend cannot reach the database", SKIP, "compose.yaml not found")
        return

    def networks_for(service: str) -> set[str]:
        m = re.search(rf"^  {re.escape(service)}:\n((?:    .*\n|\n)*)", text, re.MULTILINE)
        if not m:
            return set()
        body = m.group(1)
        idx = body.find("networks:")
        if idx == -1:
            return set()
        tail = body[idx:]
        stop = re.search(r"^    \w+:", tail, re.MULTILINE)
        if stop:
            tail = tail[: stop.start()]
        return set(re.findall(r"^\s+- ([\w-]+)\s*$", tail, re.MULTILINE))

    frontend = networks_for("frontend")
    datastore = networks_for("postgres") | networks_for("redis")
    if not frontend or not datastore:
        record("frontend cannot reach the database", WARN, "could not parse compose networks")
        return
    overlap = frontend & datastore
    if overlap:
        record("frontend cannot reach the database", FAIL, f"shared network(s): {sorted(overlap)}")
    else:
        record("frontend cannot reach the database", PASS, f"frontend={sorted(frontend)}")


def check_no_published_data_ports() -> None:
    """-8: a published database or cache port in compose.prod.yaml."""
    text = read("compose.prod.yaml")
    if not text:
        record("no published DB/cache port in prod", SKIP, "compose.prod.yaml not found")
        return
    problems: list[str] = []
    for service in ("postgres", "redis"):
        m = re.search(rf"^  {service}:\n((?:    .*\n|\n)*)", text, re.MULTILINE)
        if not m:
            continue
        body = m.group(1)
        stop = re.search(r"^  \w+:", body, re.MULTILINE)
        if stop:
            body = body[: stop.start()]
        ports = re.search(r"^\s+ports:\n((?:\s+-.*\n)+)", body, re.MULTILINE)
        if ports:
            problems.append(f"{service} publishes {ports.group(1).strip()[:40]}")
    if problems:
        record("no published DB/cache port in prod", FAIL, "; ".join(problems))
    else:
        record("no published DB/cache port in prod", PASS)


def check_workflow_gating() -> None:
    """-8: a publishing or deploying job not gated by needs:."""
    try:
        import yaml
    except ImportError:
        record("publishing jobs gated by needs:", SKIP, "PyYAML not installed")
        return

    problems: list[str] = []
    for name in ("cd", "release"):
        path = ROOT / f".github/workflows/{name}.yml"
        if not path.is_file():
            problems.append(f"{name}.yml missing")
            continue
        try:
            doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            problems.append(f"{name}.yml does not parse: {exc}")
            continue
        jobs = (doc or {}).get("jobs") or {}
        publishers = {"build-push", "deploy-k8s", "release"}
        present = publishers & set(jobs)
        # A single-job workflow has nothing upstream to gate on.
        for job in present:
            if len(jobs) == 1:
                continue
            if not jobs[job].get("needs"):
                problems.append(f"{name}.yml:{job} has no needs:")
    if problems:
        record("publishing jobs gated by needs:", FAIL, "; ".join(problems))
    else:
        record("publishing jobs gated by needs:", PASS)


def check_never_deploy_latest() -> None:
    """-8: deploying :latest anywhere. Pushing it is allowed."""
    problems: list[str] = []
    for name in ("cd", "release"):
        text = read(f".github/workflows/{name}.yml")
        for num, line in enumerate(text.splitlines(), 1):
            if "latest" not in line:
                continue
            s = line.strip()
            # Pushing :latest is required by the brief; deploying it is not.
            if re.search(r"--tag\b", s) or s.startswith("#"):
                continue
            if re.search(r"kustomize edit set image|newTag|newName|image:\s*\S*:latest", s):
                problems.append(f"{name}.yml:{num}")
    if problems:
        record("never deploys :latest", FAIL, ", ".join(problems))
    else:
        record("never deploys :latest", PASS, "pushed but not deployed")


def check_postgres_is_stateful() -> None:
    """-8: PostgreSQL as a Deployment with no PVC."""
    try:
        import yaml
    except ImportError:
        record("postgres is a StatefulSet with a PVC", SKIP, "PyYAML not installed")
        return
    text = read("k8s/base/postgres-statefulset.yaml") or read("k8s/base/postgres.yaml")
    if not text:
        record("postgres is a StatefulSet with a PVC", FAIL, "no postgres manifest found")
        return
    # The manifest is a multi-document stream (Service + StatefulSet).
    stateful = None
    for doc in yaml.safe_load_all(text):
        if isinstance(doc, dict) and doc.get("kind") in ("StatefulSet", "Deployment"):
            stateful = doc
            break
    if not stateful:
        record("postgres is a StatefulSet with a PVC", FAIL, "no StatefulSet/Deployment in the postgres manifest")
        return
    kind = stateful.get("kind")
    claims = stateful.get("spec", {}).get("volumeClaimTemplates") or []
    if kind == "StatefulSet" and claims:
        names = [c.get("metadata", {}).get("name") for c in claims]
        record("postgres is a StatefulSet with a PVC", PASS, f"claims={names}")
    else:
        record("postgres is a StatefulSet with a PVC", FAIL, f"kind={kind}, volumeClaimTemplates={len(claims)}")


def check_no_direct_pushes_to_main() -> None:
    """-5: commits pushed directly to main."""
    if skip_without_git():
        record("no direct pushes to main", SKIP, "not a git repository")
        return
    if not git("rev-parse", "--verify", "origin/main"):
        record("no direct pushes to main", SKIP, "origin/main not fetched")
        return
    count = git("rev-list", "--no-merges", "--count", "origin/dev..origin/main").strip()
    if count in ("", None):
        record("no direct pushes to main", SKIP, "origin/dev not fetched")
    elif count == "0":
        record("no direct pushes to main", PASS, "main contains only merge commits")
    else:
        record("no direct pushes to main", FAIL, f"{count} non-merge commit(s) unique to main")


# --------------------------------------------------------------------------
# Structural requirements
# --------------------------------------------------------------------------


def check_required_layout() -> None:
    required = [
        "README.md",
        "LICENSE",
        "compose.yaml",
        "compose.prod.yaml",
        ".env.example",
        ".gitignore",
        "load/k6-script.js",
        "docs/ENGINEERING-NOTES.md",
        "docs/RUNBOOK.md",
        "docs/AI-USAGE.md",
        "scripts/check_submission.py",
        ".github/workflows/ci.yml",
        ".github/workflows/cd.yml",
        ".github/workflows/release.yml",
        "backend/Dockerfile",
        "backend/.dockerignore",
        "backend/pyproject.toml",
        "frontend/Dockerfile",
        "frontend/.dockerignore",
        "frontend/nginx.conf",
    ]
    missing = [r for r in required if not (ROOT / r).exists()]
    if missing:
        record("required layout present", FAIL, f"missing: {', '.join(missing)}")
    else:
        record("required layout present", PASS, f"{len(required)} paths")


def check_adrs() -> None:
    adrs = sorted(p.name for p in (ROOT / "docs/adr").glob("*.md")) if (ROOT / "docs/adr").is_dir() else []
    if len(adrs) >= 4:
        record("four ADRs", PASS, ", ".join(adrs))
    else:
        record("four ADRs", FAIL, f"found {len(adrs)}: {', '.join(adrs) or 'none'}")


def check_env_example_and_gitignore() -> None:
    problems = []
    if not (ROOT / ".env.example").is_file():
        problems.append(".env.example missing")
    ignores = read(".gitignore")
    if ".env" not in ignores:
        problems.append(".env is not gitignored")
    if (ROOT / ".env").exists():
        problems.append("a real .env is present in the working tree")
    record(".env hygiene", FAIL if problems else PASS, "; ".join(problems))


def check_test_counts() -> None:
    backend_tests = len(re.findall(r"^def test_|^async def test_", read("backend/tests/conftest.py"), re.M))
    for path in sorted((ROOT / "backend/tests").glob("test_*.py")):
        backend_tests += len(re.findall(r"^def test_|^async def test_", path.read_text(encoding="utf-8"), re.M))
    frontend_tests = 0
    for path in sorted((ROOT / "frontend/tests").glob("*.test.tsx")):
        frontend_tests += len(re.findall(r"\b(?:it|test)\(", path.read_text(encoding="utf-8")))
    if backend_tests >= 14:
        record("backend test count >= 14", PASS, f"{backend_tests} tests")
    else:
        record("backend test count >= 14", FAIL, f"{backend_tests} tests")
    if frontend_tests >= 5:
        record("frontend test count >= 5", PASS, f"{frontend_tests} tests")
    else:
        record("frontend test count >= 5", FAIL, f"{frontend_tests} tests")


def check_frontend_test_script() -> None:
    try:
        pkg = json.loads(read("frontend/package.json"))
    except json.JSONDecodeError:
        record("frontend test script configured", FAIL, "package.json does not parse")
        return
    scripts = pkg.get("scripts") or {}
    if "test" in scripts:
        record("frontend test script configured", PASS, scripts["test"])
    else:
        record("frontend test script configured", FAIL, "no test script; CI would skip frontend tests")


def check_readme_quickstart() -> None:
    text = read("README.md")
    if not text:
        record("README quickstart", FAIL, "README.md is empty")
        return
    has_quickstart = re.search(r"quickstart|quick start|getting started", text, re.IGNORECASE)
    has_command = re.search(r"docker compose (up|build)", text)
    if has_quickstart and has_command:
        record("README quickstart", PASS, "documents a one-command start")
    else:
        record("README quickstart", FAIL, "no recognisable one-command quickstart")


def check_workflow_permissions() -> None:
    """Least privilege: every workflow declares permissions, and every job is scoped."""
    try:
        import yaml
    except ImportError:
        record("least-privilege workflow permissions", SKIP, "PyYAML not installed")
        return
    problems: list[str] = []
    for name in ("ci", "cd", "release"):
        path = ROOT / f".github/workflows/{name}.yml"
        if not path.is_file():
            problems.append(f"{name}.yml missing")
            continue
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if "permissions" not in doc:
            problems.append(f"{name}.yml has no top-level permissions")
        for job, body in (doc.get("jobs") or {}).items():
            if not body.get("permissions"):
                problems.append(f"{name}.yml:{job} has no permissions")
    if problems:
        record("least-privilege workflow permissions", FAIL, "; ".join(problems[:5]))
    else:
        record("least-privilege workflow permissions", PASS)


def check_evidence() -> None:
    directory = ROOT / "docs/evidence"
    files = sorted(p.name for p in directory.glob("*")) if directory.is_dir() else []
    if not files:
        record("evidence captured", FAIL, "docs/evidence is empty")
    elif len(files) >= 3:
        record("evidence captured", PASS, f"{len(files)} files")
    else:
        record("evidence captured", WARN, f"only {len(files)} file(s)")


def main() -> int:
    check_no_secrets_in_history()
    check_no_key_in_manifests()
    check_pinned_images()
    check_no_localhost_service_traffic()
    check_network_segmentation()
    check_no_published_data_ports()
    check_workflow_gating()
    check_never_deploy_latest()
    check_postgres_is_stateful()
    check_no_direct_pushes_to_main()
    check_required_layout()
    check_adrs()
    check_env_example_and_gitignore()
    check_test_counts()
    check_frontend_test_script()
    check_readme_quickstart()
    check_workflow_permissions()
    check_evidence()

    width = max(len(name) for name, _, _ in results) + 2
    failures = 0
    for name, status, detail in results:
        if status == FAIL:
            failures += 1
        line = f"  {status:<4} {name:<{width}}"
        if detail:
            line += f"  {detail}"
        print(line)

    total = len(results)
    print()
    print(f"  {total - failures}/{total} checks passed")
    if failures:
        print(f"  {failures} blocking issue(s). See the automatic deductions in section 5.3.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
