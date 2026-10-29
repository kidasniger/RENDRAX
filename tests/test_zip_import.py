#!/usr/bin/env python3
"""Tests d’intégration de l’import ZIP RENDRAX."""
import base64
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.safe_extract_zip import UnsafeArchive, extract_archive

FIXTURE_B64 = "UEsDBBQAAAAIAJC7XV12UFdWEQEAAHcBAAAKAAAAaW5kZXguaHRtbC2QPU4DMRCF+5xicE1ipaOwV0JAkQahpEF0xp5dj/B6V57ZDem4BkfgHNyEk+BsUs2v3nxvzE0YvJxGhCh9albmHCC53FnVFtWYiC40pkdx4KMrjGLVJO36Tl272fVo1Ux4HIciCvyQBXPdOlKQaAPO5HG9FLeUScilNXuX0G6rhJAkbPZPz4/7+1d4271AS58yFTT6MjKJ8gcUTFaxnBJyRKxXYsHWKs+sl+6mZlVNL7Qr8z6EU8VzlKuBbbPrz2iL+vVS3dw2ZqwT1yGgwMPhsPjrfn8YAo4TMaS/r29XfKQZN0aPjaG+Ay7eKsf1D6wD9sOG506BS9XwLqWJpTihIVcNEGQ5Q1049AVKL3/+B1BLAwQUAAAACACQu11dN5wLoKwAAADwAAAADQAAAGNzcy9zdHlsZS5jc3NNj8sOgjAURD+GuKNJARPN7cpPudLXjX2lrQoS/l0RF+7OnMVkxlbv2muU8+IxGwrAxZNktdBxfhBWkbF1Zx1DZRo9uRkumdC1BUNhRWXS4orjzeR4DxKajnfn/iTG6GKGRmu9fvslleRwBpNJig+NilFVvsCoQlV59UhhqWqqDB2Z8NMioZQUDAx9mlbbLd8ZhV4KjptJf6LfBHmz7A+GnqdJeJzYns/88VzfUEsDBBQAAAAIAJC7XV0TX+d93QAAAFYBAAAPAAAAYXNzZXRzL2RlbW8uc3ZndZDBSsQwEIZfZRjP3aTpGrpLU9CbiOjZW03TJpC2Sxqauk/vRFQQ9BTyz/f9E9Ks2wj75OdVoY3xcmYspXRI1WEJIxOcc0YEQnJ9tArlkSNY40YbFVaSLpsz6X7ZFXLgQGPIadsEo+P/UiBe1AiD817hjbiVlXlD1jbaBe0NaJpXgkD9rrD8NBTW8kcYhiHTly5a6BU+iROHshTbSfpaFMf6+kd1NHuE716qrTidOSy6WduFFkyu770hdZljMXST84TdBdf5r2x1V5PFX+9oXx9e4PmxYbmrbfJ3tR9QSwECFAMUAAAACACQu11ddlBXVhEBAAB3AQAACgAAAAAAAAAAAAAAgAEAAAAAaW5kZXguaHRtbFBLAQIUAxQAAAAIAJC7XV03nAugrAAAAPAAAAANAAAAAAAAAAAAAACAATkBAABjc3Mvc3R5bGUuY3NzUEsBAhQDFAAAAAgAkLtdXRNf533dAAAAVgEAAA8AAAAAAAAAAAAAAIABEAIAAGFzc2V0cy9kZW1vLnN2Z1BLBQYAAAAAAwADALAAAAAaAwAAAAA="


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
