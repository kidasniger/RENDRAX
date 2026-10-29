import argparse
import base64
import importlib.util
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from h2m.profiles import LOTTIE_CAPTURE_SCRIPT, PRECISE_PROFILES, detect_lottie_stage_size
from h2m.render import (
    centered_crop_clip, detect_scene_rect, detect_scene_size, format_description,
    output_dimensions, resolve_scene_format, select_fps, select_quality,
)
from h2m.scripts_js import JS_HELPERS

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("html2mp4", ROOT / "html2mp4.py")
renderer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


class Html2Mp4Tests(unittest.TestCase):
    def test_default_stage_size(self):
        self.assertEqual(renderer.detect_stage_size("<style>.stage{width:1080px;height:1920px}</style>"), (1080, 1920))

    def test_stage_size_falls_back_for_generic_html(self):
        self.assertEqual(renderer.detect_stage_size("<html><body>hello</body></html>"), (1080, 1920))

    def test_output_formats(self):
        sample = "<style>.stage{width:720px;height:1280px}</style>"
        self.assertEqual(renderer.choose_frame_size(sample, "portrait"), (1080, 1920))
        self.assertEqual(renderer.choose_frame_size(sample, "landscape"), (1920, 1080))
        self.assertEqual(renderer.choose_frame_size(sample, "square"), (1080, 1080))
        self.assertEqual(renderer.choose_frame_size(sample, "auto"), (720, 1280))

    def test_runtime_scene_size_detection_and_aspect_formats(self):
        fixtures = ROOT / "tests" / "fixtures"
        cases = (
            ("scene-landscape.html", (1920, 1080), "landscape"),
            ("scene-portrait.html", (1080, 1920), "portrait"),
            ("scene-square.html", (1080, 1080), "square"),
        )
        for filename, expected_size, expected_format in cases:
            with self.subTest(filename=filename):
                html = (fixtures / filename).read_text(encoding="utf-8")
                size = renderer.detect_stage_size(html)
                self.assertEqual(size, expected_size)
                self.assertEqual(resolve_scene_format(*size), expected_format)
                self.assertEqual(output_dimensions(*size, "auto", 1), expected_size)
                half = output_dimensions(*size, "auto", 0.5)
                self.assertEqual(half, (expected_size[0] // 2, expected_size[1] // 2))
                self.assertEqual(format_description(expected_format), {
                    "landscape": "paysage 16:9",
                    "portrait": "portrait 9:16",
                    "square": "carré 1:1",
                }[expected_format])

    def test_runtime_detector_prefers_measured_canvas_scene_dimensions(self):
        class FakeCDP:
            def ev(self, expression, await_promise=False):
                return {
                    "x": 0, "y": 0, "width": 960, "height": 540,
                    "sceneWidth": 1920, "sceneHeight": 1080, "source": "canvas",
                }
        self.assertEqual(detect_scene_size(FakeCDP()), (1920, 1080))
        self.assertEqual(detect_scene_rect(FakeCDP())["source"], "canvas")

    def test_runtime_detector_falls_back_when_browser_measurement_fails(self):
        class BrokenCDP:
            def ev(self, expression, await_promise=False):
                raise RuntimeError("document unavailable")
        self.assertEqual(detect_scene_size(BrokenCDP(), (720, 1280)), (720, 1280))

    def test_manual_format_forces_output_ratio_and_scale(self):
        self.assertEqual(output_dimensions(1920, 1080, "portrait", 1), (1080, 1920))
        self.assertEqual(output_dimensions(1080, 1920, "landscape", 0.5), (960, 540))
        self.assertEqual(output_dimensions(1921, 1081, "auto", 1), (1920, 1080))
        self.assertEqual(output_dimensions(1280, 720, "auto", 1), (1920, 1080))
        self.assertEqual(output_dimensions(1600, 1200, "auto", 1), (1920, 1080))
        self.assertEqual(output_dimensions(1081, 1921, "auto", 0.5), (540, 960))

    def test_manual_format_center_crops_without_distortion_or_bars(self):
        portrait_scene = {
            "x": 0, "y": 0, "width": 1080, "height": 1920,
            "scene_width": 1080, "scene_height": 1920, "source": "stage",
        }
        clip = centered_crop_clip(portrait_scene, 1920, 1080)
        self.assertAlmostEqual(clip["width"] / clip["height"], 1920 / 1080, places=3)
        self.assertGreater(clip["y"], 0)
        self.assertLess(clip["height"], portrait_scene["height"])
        self.assertAlmostEqual(clip["scale"] * clip["width"], 1920, delta=1)

    def test_lottie_web_and_dotlottie_profiles_are_detected_and_patched(self):
        fixtures = ROOT / "tests" / "fixtures"
        web_html = (fixtures / "lottie-web.html").read_text(encoding="utf-8")
        self.assertEqual(renderer.detect_profile(web_html)[0], "lottie")
        patched_web, profile_web = renderer.patch_html(web_html)
        self.assertEqual(profile_web, "lottie")
        self.assertIn("window.__h2mCallLottieLoad(lottie,", patched_web)
        self.assertIn("window.__h2mLottieReady", patched_web)

        dotlottie_html = (fixtures / "lottie-dotlottie.html").read_text(encoding="utf-8")
        self.assertEqual(renderer.detect_profile(dotlottie_html)[0], "lottie")
        patched_dotlottie, profile_dotlottie = renderer.patch_html(dotlottie_html)
        self.assertEqual(profile_dotlottie, "lottie")
        self.assertIn("window.__h2mTrackLottieClass(Player)", patched_dotlottie)
        self.assertIn("window.__manual = true", patched_dotlottie)

        aliased_html = (
            '<!doctype html><html><head><style>.lottie-view{width:1920px;height:1080px}</style>'
            '<script type="module">import Player from "lottie-web";'
            'const animation = Player.loadAnimation({container: document.querySelector(".lottie-view")});'
            '</script></head><body><div class="lottie-view"></div></body></html>'
        )
        self.assertEqual(renderer.detect_profile(aliased_html)[0], "lottie")
        patched_alias, profile_alias = renderer.patch_html(aliased_html)
        self.assertEqual(profile_alias, "lottie")
        self.assertIn("window.__h2mCallLottieLoad(Player,", patched_alias)

        self.assertEqual(detect_lottie_stage_size(web_html), (1920, 1080))
        self.assertEqual(detect_lottie_stage_size(dotlottie_html), (1080, 1920))

    def test_lottie_profile_is_seekable_and_accepts_silent_animation(self):
        self.assertIn("lottie", PRECISE_PROFILES)
        self.assertIn("player.goToAndStop(playerTime * 1000, false)", JS_HELPERS)
        self.assertIn("animation.currentTime = time * 1000", JS_HELPERS)
        self.assertIn("readNumber(player, 'duration')", LOTTIE_CAPTURE_SCRIPT)
        self.assertIn("typeof value === 'function'", LOTTIE_CAPTURE_SCRIPT)
        self.assertIn("typeof framesValue === 'function'", JS_HELPERS)
        self.assertIn("window.__h2mLottieDuration()", (ROOT / "h2m" / "render.py").read_text(encoding="utf-8"))
        self.assertIn("rendu Lottie sera exporté sans son", (ROOT / "h2m" / "render.py").read_text(encoding="utf-8"))

    def test_relative_asset_base_is_injected(self):
        html = "<html><head></head><body><img src='assets/pic.png'></body></html>"
        result = renderer.inject_base_url(html, "file:///tmp/source/")
        self.assertIn('<base href="file:///tmp/source/">', result)
        self.assertIn("assets/pic.png", result)

    def test_existing_base_is_preserved(self):
        html = '<html><head><base href="https://example.test/"></head></html>'
        self.assertEqual(renderer.inject_base_url(html, "file:///tmp/source/"), html)

    def test_audio_capture_is_injected_before_page_scripts(self):
        html = "<html><head><script>window.pageCode=true</script></head><body></body></html>"
        result = renderer.inject_generic_audio_capture(html)
        self.assertLess(result.index("__h2mCaptureInstalled"), result.index("window.pageCode=true"))
        self.assertIn("window.__h2mStop", result)

    def test_generic_capture_is_not_injected_twice(self):
        html = renderer.inject_generic_audio_capture("<html><head></head><body></body></html>")
        self.assertEqual(renderer.inject_generic_audio_capture(html), html)

    def test_fixtures_cover_css_canvas_and_webaudio(self):
        fixtures = ROOT / "tests" / "fixtures"
        self.assertTrue((fixtures / "css-animation.html").is_file())
        self.assertTrue((fixtures / "canvas-animation.html").is_file())
        self.assertTrue((fixtures / "webaudio.html").is_file())
        self.assertTrue((fixtures / "static.html").is_file())
        self.assertTrue((fixtures / "start-button.html").is_file())
        self.assertTrue((fixtures / "gsap-audio-timeline.html").is_file())
        self.assertTrue((fixtures / "gsap-duration-audio-timeline.html").is_file())

    # --- vérification automatique du fichier ---
    EDITPRO = ('<html><body><div id="stage"></div><script>const IM={"voice":"' + "QUJD" * 400 + '"};'
               'function render(t){} (function loop(){let t=4.6;render(t)})();</script></body></html>')

    def test_invalid_files_are_rejected(self):
        self.assertEqual(renderer.detect_profile("")[0], "invalid")
        self.assertEqual(renderer.detect_profile("bonjour, ceci est juste du texte")[0], "invalid")

    def test_plain_html_is_generic(self):
        self.assertEqual(renderer.detect_profile("<html><body><p>x</p></body></html>")[0], "generic")

    def test_kidas_file_is_recognised(self):
        text = (ROOT / "kidas.html").read_text(encoding="utf-8", errors="ignore")
        self.assertEqual(renderer.detect_profile(text)[0], "kidas")

    def test_editpro_pattern_is_recognised(self):
        self.assertEqual(renderer.detect_profile(self.EDITPRO)[0], "editpro")

    def test_kidas_patch_freezes_time_state(self):
        text = (ROOT / "kidas.html").read_text(encoding="utf-8", errors="ignore")
        patched, profile = renderer.patch_html(text)
        self.assertEqual(profile, "kidas")
        self.assertIn("window.__manual||__s(v)", patched)
        self.assertIn("window.__setT=__s", patched)

    def test_editpro_patch_stops_page_loop(self):
        patched, profile = renderer.patch_html(self.EDITPRO)
        self.assertEqual(profile, "editpro")
        self.assertIn("if(window.__manual)return;let t=", patched)

    def test_editpro_voice_is_extracted_and_duration_defaults(self):
        with tempfile.TemporaryDirectory() as d:
            audio = renderer.extract_audio(self.EDITPRO, Path(d), "editpro")
            self.assertTrue(audio["voice"].is_file())
            self.assertIsNone(audio["music"])
            self.assertEqual(audio["voice"].read_bytes(), base64.b64decode("QUJD" * 400))
        self.assertEqual(renderer.editpro_duration(self.EDITPRO), 60.0)
        self.assertEqual(renderer.editpro_duration("if(t>=45){t=45;run=false}"), 45.0)

    MUSICPRO = ("<html><head></head><body><canvas id='st'></canvas><script>const D=48.59;let vP=0,mP=0;"
                "function render(t){} function music(){} function go(){ac.resume()} "
                "(function lp(){render(0);requestAnimationFrame(lp)})();"
                "const b=atob(VOICE);</script></body></html>")

    GSAPVIDEO = ('<html><head><style>#st{width:1080px;height:1920px}</style></head><body><div id="st"></div>'
                 '<audio id="a" src="data:audio/wav;base64,QUJD"></audio><script>'
                 'const T=[0,1],SUB=[[0,"start"]],tl=gsap.timeline({paused:true});'
                 'let started=0;(function lp(){const t=started?a.currentTime:1.6;tl.time(t,false);requestAnimationFrame(lp)})();'
                 '</script></body></html>')

    # Variante rencontrée dans Cest_quoi_un_algorithme_Video.html :
    # durée D et appel tl.time(Math.min(t,D), false), sans const T.
    GSAPVIDEO_D_VARIANT = (
        '<html><head><style>#st{position:absolute;width:1080px;height:1920px}</style></head><body>'
        '<div id="st"></div><audio id="a" src="data:audio/mpeg;base64,QUJD"></audio><script>'
        'const D=51.88;const AN=[[0,0],[1,1]],SUB=[[0,"start"]];'
        'const tl=gsap.timeline({paused:true});let started=0;'
        '(function lp(){const t=started?a.currentTime:1.5;tl.time(Math.min(t,D),false);requestAnimationFrame(lp)})();'
        '</script></body></html>'
    )

    def test_gsap_audio_timeline_pattern_is_recognised(self):
        self.assertEqual(renderer.detect_profile(self.GSAPVIDEO)[0], "gsapvideo")
        self.assertIn("gsapvideo", renderer.PRECISE_PROFILES)

    def test_gsap_audio_timeline_duration_variant_is_recognised_and_patched(self):
        self.assertEqual(renderer.detect_profile(self.GSAPVIDEO_D_VARIANT)[0], "gsapvideo")
        patched, profile = renderer.patch_html(self.GSAPVIDEO_D_VARIANT)
        self.assertEqual(profile, "gsapvideo")
        self.assertLess(patched.index("window.__manual=true"), patched.index("const D=51.88"))
        self.assertIn("(function lp(){if(window.__manual)return;", patched)

    def test_gsap_seek_supports_D_duration_without_T(self):
        # Prevent regression: some GSAP templates expose D and AN but no global T.
        self.assertIn("typeof T !== 'undefined'", JS_HELPERS)
        self.assertIn("typeof D !== 'undefined'", JS_HELPERS)
        self.assertIn("document.querySelector('#a')", JS_HELPERS)

    def test_gsap_audio_timeline_patch_stops_real_time_loop(self):
        patched, profile = renderer.patch_html(self.GSAPVIDEO)
        self.assertEqual(profile, "gsapvideo")
        self.assertLess(patched.index("window.__manual=true"), patched.index("const T=[0,1]"))
        self.assertIn("(function lp(){if(window.__manual)return;", patched)

    def test_gsap_audio_timeline_audio_is_extracted(self):
        with tempfile.TemporaryDirectory() as d:
            audio = renderer.extract_audio(self.GSAPVIDEO, Path(d), "gsapvideo")
            self.assertTrue(audio["voice"].is_file())
            self.assertEqual(audio["voice"].read_bytes(), base64.b64decode("QUJD"))

    def test_musicpro_pattern_is_recognised(self):
        self.assertEqual(renderer.detect_profile(self.MUSICPRO)[0], "musicpro")

    def test_musicpro_patch_enables_manual_mode_before_page_scripts(self):
        patched, profile = renderer.patch_html(self.MUSICPRO)
        self.assertEqual(profile, "musicpro")
        self.assertLess(patched.index("window.__manual=true"), patched.index("const D=48.59"))
        self.assertIn("function go(){if(window.__manual)return;", patched)
        self.assertIn("(function lp(){if(window.__manual)return;", patched)

    def test_generic_capture_records_from_context_creation(self):
        result = renderer.inject_generic_audio_capture("<html><head></head><body></body></html>")
        self.assertIn("window.__h2mMark", result)
        self.assertNotIn("if (active) start(ctx)", result)

    def test_music_volume_is_read_from_page(self):
        with tempfile.TemporaryDirectory() as d:
            text = "AUD='data:audio/mpeg;base64,QUJD',MUS='data:audio/mpeg;base64,QUJD';mu.current.volume=.22"
            self.assertAlmostEqual(renderer.extract_audio(text, Path(d), "kidas")["music_volume"], 0.22)

    def test_output_path_uses_html_name(self):
        args = argparse.Namespace(name="", test=0, preview=False)
        self.assertEqual(renderer.output_path(Path("/x/ma video.html"), args), Path("/x/ma video.mp4"))

    def test_output_path_custom_name_is_sanitised(self):
        args = argparse.Namespace(name="a/b:c", test=0, preview=False)
        self.assertEqual(renderer.output_path(Path("/x/v.html"), args).parent, Path("/x"))
        self.assertNotIn("/", renderer.output_path(Path("/x/v.html"), args).name)

    def test_output_path_suffixes_for_test_and_preview(self):
        self.assertTrue(renderer.output_path(Path("/x/v.html"), argparse.Namespace(name="", test=5, preview=False)).name.endswith("_test.mp4"))
        self.assertTrue(renderer.output_path(Path("/x/v.html"), argparse.Namespace(name="", test=0, preview=True)).name.endswith("_apercu.mp4"))

    def test_quality_presets_cover_all_levels(self):
        for level in ("fast", "standard", "high"):
            self.assertIn("jpeg", renderer.QUALITY[level])

    def test_automatic_fps_uses_60_for_seekable_profiles_and_30_for_generic(self):
        for profile in PRECISE_PROFILES:
            expected = 60
            self.assertEqual(select_fps(profile, "auto"), expected, profile)
        self.assertEqual(select_fps("generic", "auto"), 30)
        self.assertEqual(select_fps("generic", 24), 24)
        self.assertEqual(select_fps("gsapvideo", 24), 24)

    def test_automatic_quality_optimizes_preview_and_reduced_renders(self):
        self.assertEqual(select_quality("auto", scale=1, test=0), "standard")
        self.assertEqual(select_quality("auto", scale=0.5, test=0), "fast")
        self.assertEqual(select_quality("auto", scale=1, test=10), "fast")
        self.assertEqual(select_quality("high", scale=0.5, test=10), "high")

    def test_frontend_detects_specialized_audio_profiles_without_manual_fps_control(self):
        page = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn('<select id="fps">', page)
        self.assertIn("const gsapvideo =", page)
        self.assertIn("const musicpro =", page)
        self.assertIn("const lottieWeb =", page)
        self.assertIn("detectSceneSizeFromText", page)
        self.assertIn("Format détecté :", page)
        self.assertIn("workflowStepLabel", page)
        # Explicitly delegate media playback but keep untrusted HTML isolated.
        self.assertIn('sandbox="allow-scripts" allow="autoplay"', page)
        self.assertNotIn('sandbox="allow-scripts allow-same-origin"', page)
        self.assertIn("Chargement de l’aperçu…", page)
        self.assertIn("p.addEventListener('load', reveal", page)
        self.assertIn("p.srcdoc = fileText", page)

    def test_watermark_is_optional_from_ui_through_workflow(self):
        page = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        api = (ROOT / "api" / "render.js").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "render.yml").read_text(encoding="utf-8")
        cli = (ROOT / "html2mp4.py").read_text(encoding="utf-8")
        self.assertIn('id="watermark" type="checkbox">', page)
        self.assertNotIn('id="watermark" type="checkbox" checked', page)
        self.assertIn("Optionnel. Active cette option", page)
        self.assertIn("watermark: $('#watermark').checked", page)
        self.assertIn("watermark = true", api)
        self.assertIn("watermark: String(watermarkEnabled)", api)
        self.assertIn("type: boolean", workflow)
        self.assertIn('args+=(--no-watermark)', workflow)
        self.assertIn('--no-watermark', cli)

    def test_server_auth_and_dispatch_use_renamed_repository(self):
        server = (ROOT / "lib" / "kidas-server.js").read_text(encoding="utf-8")
        render_api = (ROOT / "api" / "render.js").read_text(encoding="utf-8")
        job_api = (ROOT / "api" / "job.js").read_text(encoding="utf-8")
        videos_api = (ROOT / "api" / "videos.js").read_text(encoding="utf-8")
        delete_api = (ROOT / "api" / "delete-video.js").read_text(encoding="utf-8")
        self.assertIn("kidasniger/RENDRAX/.github/workflows/render.yml@refs/heads/main", server)
        self.assertIn("payload.repository === 'kidasniger/RENDRAX'", server)
        self.assertIn("/repos/kidasniger/RENDRAX/actions/workflows/render.yml/dispatches", render_api)
        for source in (job_api, videos_api, delete_api):
            self.assertIn("kidasniger/RENDRAX", source)
            self.assertNotIn("kidasniger/Kidas", source)
        self.assertNotIn("kidasniger/Kidas", server + render_api)

    def test_favicon_uses_root_icon_pack_and_existing_repository_logos(self):
        page = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        for filename in ("favicon.ico", "favicon-32x32.png", "favicon-16x16.png", "apple-touch-icon.png"):
            self.assertTrue((ROOT / "docs" / filename).is_file(), filename)
        for link in (
            'href="/favicon.ico?v=20261025-rendrax4" sizes="any"',
            'href="/favicon-32x32.png?v=20261025-rendrax4"',
            'href="/favicon-16x16.png?v=20261025-rendrax4"',
            'href="/apple-touch-icon.png?v=20261025-rendrax4"',
        ):
            self.assertIn(link, page)
        self.assertEqual(
            (ROOT / "docs" / "assets" / "rendrax-logo.svg").read_bytes(),
            (ROOT / "logo" / "rendrax_x5f_horizontal_x5f_dark.svg").read_bytes()
        )
        self.assertEqual(
            (ROOT / "docs" / "assets" / "rendrax-logo-dark.svg").read_bytes(),
            (ROOT / "logo" / "rendrax_x5f_horizontal_x5f_light.svg").read_bytes()
        )
        self.assertIn('src="/favicon-32x32.png?v=20261025-rendrax4"', page)
        self.assertIn('src="/_vercel/insights/script.js"', page)

    def test_animated_watermark_defaults_and_filter(self):
        from h2m.watermark import _overlay_filter, _make_apng, validate_watermark
        self.assertEqual(validate_watermark(), ("RENDRAX", "pulse", "right-center", 0.45, 0.07))
        filt = _overlay_filter("right-center", "pulse", 320, 180)
        self.assertIn("W-w-W*0.025", filt)
        self.assertIn("H*0.55-h/2", filt)
        self.assertIn("[1:v]format=rgba", filt)
        self.assertIn("overlay=", filt)
        with tempfile.TemporaryDirectory() as td:
            apng = Path(td) / "watermark.apng"
            _make_apng(apng, 320, 180, "RENDRAX", "pulse", 0.45, 0.07)
            from PIL import Image
            with Image.open(apng) as anim:
                with Image.open(ROOT / "logo" / "rendrax-watermark.gif") as source_gif:
                    self.assertEqual(anim.n_frames, source_gif.n_frames)
                self.assertGreater(anim.size[0], 0)
                self.assertGreater(anim.size[1], 0)
                self.assertLess(anim.size[1], 320)
                anim.seek(0)
                self.assertGreater(anim.convert("RGBA").getchannel("A").getextrema()[1], 0)

    def test_watermark_integrates_real_mp4_and_keeps_audio(self):
        ffmpeg = shutil.which("ffmpeg")
        ffprobe = shutil.which("ffprobe")
        if not ffmpeg or not ffprobe:
            self.skipTest("FFmpeg/ffprobe not installed")
        from h2m.watermark import apply_watermark
        from PIL import Image, ImageChops
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "source.mp4"
            original = root / "original.mp4"
            destination = root / "watermarked.mp4"
            subprocess.run([
                ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=20:d=2",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "aac", str(source),
            ], check=True, timeout=60)
            shutil.copy2(source, original)
            apply_watermark(source, destination, text="RENDRAX", animation="pulse",
                            position="right-center", opacity=0.45, size=0.07)
            self.assertTrue(source.is_file())
            self.assertFalse(destination.exists())
            probe = subprocess.run([
                ffprobe, "-v", "error", "-show_entries", "stream=codec_type,duration",
                "-of", "json", str(source),
            ], capture_output=True, text=True, check=True, timeout=30)
            streams = __import__("json").loads(probe.stdout)["streams"]
            self.assertTrue(any(s["codec_type"] == "video" for s in streams))
            self.assertTrue(any(s["codec_type"] == "audio" for s in streams))
            durations = [float(s["duration"]) for s in streams if s.get("duration")]
            self.assertLessEqual(max(durations) - min(durations), 0.08)
            before, after = root / "before.png", root / "after.png"
            for video, image in ((original, before), (source, after)):
                subprocess.run([
                    ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-ss", "0.5",
                    "-i", str(video), "-frames:v", "1", str(image),
                ], check=True, timeout=30)
            with Image.open(before) as first, Image.open(after) as second:
                self.assertIsNotNone(ImageChops.difference(first.convert("RGB"), second.convert("RGB")).getbbox())

    def test_watermark_rejects_invalid_settings(self):
        from h2m.watermark import validate_watermark
        cases = [
            {"text": ""}, {"text": "x" * 81}, {"animation": "explode"},
            {"position": "outside"}, {"opacity": 0.05}, {"opacity": 1.1},
            {"size": 0.01}, {"size": 0.2},
        ]
        for kwargs in cases:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                validate_watermark(**kwargs)

    def test_precise_profiles_come_from_table(self):
        self.assertIn("kidas", renderer.PRECISE_PROFILES)
        self.assertNotIn("generic", renderer.PRECISE_PROFILES)

    def test_audio_verdict(self):
        from h2m.report import audio_verdict
        self.assertEqual(audio_verdict({"audio_tracks": []})[0], "none")
        self.assertEqual(audio_verdict({"audio_tracks": ["a"], "peak_db": -80})[0], "warn")
        self.assertEqual(audio_verdict({"audio_tracks": ["a"], "peak_db": -12})[0], "ok")




if __name__ == "__main__":
    unittest.main()
