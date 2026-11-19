"""Architectural, NoSQL driver, domain purity, security, and anti-AI-slop tests for merkat-catalog."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


class TestMerkatCatalogContracts(unittest.TestCase):
    def test_typescript_strict_and_mongodb_driver_configured(self) -> None:
        pkg = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
        tsc = json.loads((REPO_ROOT / "tsconfig.json").read_text(encoding="utf-8"))
        self.assertIn("mongodb", pkg["dependencies"])
        self.assertTrue(tsc["compilerOptions"]["strict"])
        self.assertTrue(tsc["compilerOptions"]["noUncheckedIndexedAccess"])

        any_pattern = re.compile(r"(:\s*any\b|\bas\s+any\b|<any>)")
        for path in (REPO_ROOT / "src").rglob("*.ts"):
            self.assertIsNone(any_pattern.search(path.read_text(encoding="utf-8")))

    def test_domain_purity(self) -> None:
        for path in (REPO_ROOT / "src" / "domain").rglob("*.ts"):
            text = path.read_text(encoding="utf-8")
            for forbidden in ("from \"mongodb\"", "node:http", "infrastructure/"):
                self.assertNotIn(forbidden, text)

    def test_ui_boutique_identity_and_safe_dom(self) -> None:
        ui = (REPO_ROOT / "ui" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Bodoni Moda", ui)
        self.assertIn("Figtree", ui)
        self.assertIn("#FAFAF9", ui.upper())
        self.assertIn("#A16207", ui.upper())
        self.assertNotIn("#F7F6F3", ui.upper())
        for sink in ("innerHTML", "outerHTML", "insertAdjacentHTML", "eval("):
            self.assertNotIn(sink, ui)

    def test_container_and_governance_files_present(self) -> None:
        dockerfile = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8")
        self.assertIn("USER merkat", dockerfile)
        self.assertTrue((REPO_ROOT / "docker-compose.yml").is_file())
        self.assertTrue((REPO_ROOT / "PRODUCT.md").is_file())
        self.assertTrue((REPO_ROOT / "DESIGN.md").is_file())
        self.assertTrue(
            (REPO_ROOT / ".specs" / "04-security" / "security-audit-report.spec.md").is_file()
        )


if __name__ == "__main__":
    unittest.main()
