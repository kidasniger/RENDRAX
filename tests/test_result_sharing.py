import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ResultSharingTests(unittest.TestCase):
    def test_result_ui_supports_download_sharing_and_local_qr(self):
        page = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        styles = (ROOT / "docs" / "assets" / "rendrax-redesign.css").read_text(encoding="utf-8")
        service_worker = (ROOT / "docs" / "sw.js").read_text(encoding="utf-8")
        qr_library = ROOT / "docs" / "assets" / "rendrax-qr.js"
        qr_license = ROOT / "docs" / "assets" / "rendrax-qr-LICENSE.txt"

        for marker in (
            'rendrax-qr.js', 'safeDownloadName', 'Nom du fichier',
            'Télécharger le MP4', 'Lien copié ✓', 'aria-live',
            'navigator.share', 'Afficher le QR code', 'qrgen.QrCode.encodeText',
            'setResultExpiry', 'Disponible encore ', 'Résolution ',
            'Avec filigrane RENDRAX', 'Nouvelle vidéo',
            "Refaire avec d'autres réglages", 'Supprimer cette vidéo'
        ):
            self.assertIn(marker, page)
        for marker in ('.rdx-result-player', '.rdx-download-primary', '.rdx-qr-dialog', '.rdx-expiry[data-alert="true"]'):
            self.assertIn(marker, styles)
        self.assertTrue(qr_library.is_file())
        self.assertTrue(qr_license.is_file())
        self.assertIn('/assets/rendrax-qr.js', service_worker)
        self.assertIn('rendrax-shell-v3', service_worker)

    def test_share_page_and_download_routes_are_server_generated(self):
        api = (ROOT / "api" / "videos.js").read_text(encoding="utf-8")
        job = (ROOT / "api" / "job.js").read_text(encoding="utf-8")
        storage = (ROOT / "lib" / "b2-storage.js").read_text(encoding="utf-8")
        config = (ROOT / "vercel.json").read_text(encoding="utf-8")

        for marker in ("async function sharePage", "og:title", "og:description", "og:image", "og:video",
                       "async function metadataResponse", "action === 'share'", "action === 'metadata'",
                       "action === 'stream'", "attachment; filename=", "width: metadata.width",
                       "watermark: metadata.watermark"):
            self.assertIn(marker, api)
        self.assertIn('ResponseContentDisposition', storage)
        self.assertIn('width: metadata.width', job)
        self.assertIn('"destination": "/api/videos?action=share&id=:id"', config)

    def test_workflow_publishes_ffprobe_metadata(self):
        workflow = (ROOT / ".github" / "workflows" / "render.yml").read_text(encoding="utf-8")
        for marker in ("ffprobe -v error", "stream=width,height,r_frame_rate", "format.duration",
                       "--argjson width", "--argjson height", "--argjson duration",
                       "--argjson fps", "watermark:($watermark==\"true\")"):
            self.assertIn(marker, workflow)


if __name__ == "__main__":
    unittest.main()
