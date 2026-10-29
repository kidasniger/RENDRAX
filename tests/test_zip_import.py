#!/usr/bin/env python3
"""Tests d’intégration de l’import ZIP RENDRAX."""
import base64
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.safe_extract_zip import UnsafeArchive, extract_archive

FIXTURE_B64 = (Path(__file__).parent / "fixtures/zip-project.zip.b64").read_text(encoding="ascii").strip()


class ZipImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def archive(self, payload, name="fixture.zip"):
        path = self.root / name
        path.write_bytes(payload)
        return path

    def test_fixture_extracts_html_css_and_image(self):
        archive = self.archive(base64.b64decode(FIXTURE_B64))
        destination = self.root / "extracted"
        main = extract_archive(archive, destination, "index.html")
        self.assertEqual(main, str(destination.resolve() / "index.html"))
        self.assertIn("assets/demo.svg", (destination / "index.html").read_text())
        self.assertTrue((destination / "css/style.css").is_file())
        self.assertTrue((destination / "assets/demo.svg").is_file())

    def test_rejects_path_traversal(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as z:
            z.writestr("../outside.txt", "not allowed")
            z.writestr("index.html", "<html></html>")
        with self.assertRaises(UnsafeArchive):
            extract_archive(self.archive(data.getvalue()), self.root / "bad", "index.html")
        self.assertFalse((self.root / "outside.txt").exists())

    def test_rejects_symlink(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as z:
            link = zipfile.ZipInfo("assets/link")
            link.create_system = 3
            link.external_attr = (0o120777 << 16)
            z.writestr(link, "../../outside.txt")
            z.writestr("index.html", "<html></html>")
        with self.assertRaises(UnsafeArchive):
            extract_archive(self.archive(data.getvalue()), self.root / "bad-link", "index.html")

    def test_rejects_missing_selected_html(self):
        archive = self.archive(base64.b64decode(FIXTURE_B64))
        with self.assertRaises(UnsafeArchive):
            extract_archive(archive, self.root / "missing", "absent.html")


if __name__ == "__main__":
    unittest.main(verbosity=2)
