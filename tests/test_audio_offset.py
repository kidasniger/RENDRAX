"""Tests de calcul et d'application du décalage audio final."""
import io
import math
import re
import shutil
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path

from PIL import Image

from h2m.encode import start_encoder
from h2m.sync import calculate_audio_offset_ms


class AudioOffsetCalculationTests(unittest.TestCase):
    def test_audio_starts_late_requires_negative_correction(self):
        self.assertEqual(calculate_audio_offset_ms(0, 300), -300)

    def test_audio_starts_early_requires_positive_correction(self):
        self.assertEqual(calculate_audio_offset_ms(200, 0), 200)

    def test_equal_onsets_require_no_correction(self):
        self.assertEqual(calculate_audio_offset_ms(125, 125), 0)

    def test_correction_is_clamped_to_two_seconds(self):
        self.assertEqual(calculate_audio_offset_ms(5000, 0), 2000)
        self.assertEqual(calculate_audio_offset_ms(0, 5000), -2000)

    def test_missing_onset_returns_none(self):
        self.assertIsNone(calculate_audio_offset_ms(None, 100))
        self.assertIsNone(calculate_audio_offset_ms(100, None))

    def test_fractional_onsets_are_rounded_to_milliseconds(self):
        self.assertEqual(calculate_audio_offset_ms(250.4, 100.0), 150)

    def test_non_finite_onsets_are_rejected(self):
        with self.assertRaises(ValueError):
            calculate_audio_offset_ms(math.inf, 0)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "FFmpeg et ffprobe sont requis pour le test d'intégration.")
class AudioOffsetFfmpegTests(unittest.TestCase):
    @staticmethod
    def _make_audio(path):
        rate = 48000
        samples = [0] * int(rate * 0.1)
        samples.extend(
            int(12000 * math.sin(2 * math.pi * 440 * i / rate))
            for i in range(int(rate * 0.9))
        )
        import struct
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(struct.pack("<" + "h" * len(samples), *samples))

    @staticmethod
    def _measure_onset(path):
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
             "-af", "silencedetect=noise=-35dB:d=0.02", "-f", "null", "-"],
            capture_output=True, text=True, check=False,
        )
        match = re.search(r"silence_end:\\s*([0-9]+(?:\\.[0-9]+)?)", result.stderr)
        if not match:
            raise AssertionError("Impossible de mesurer le début audio : " + result.stderr[-1000:])
        return float(match.group(1))

    def _render(self, directory, audio_path, offset_ms):
        output = directory / f"offset-{offset_ms}.mp4"
        error_log = directory / f"ffmpeg-{offset_ms}.log"
        frame = io.BytesIO()
        Image.new("RGB", (64, 64), "black").save(frame, format="JPEG")
        encoder = start_encoder(
            output, 10, 1.0, [(audio_path, 1.0)], error_log,
            quality="fast", audio_offset_ms=offset_ms,
        )
        try:
            for _ in range(10):
                encoder.stdin.write(frame.getvalue())
            encoder.stdin.close()
            code = encoder.wait(timeout=30)
        finally:
            if encoder.poll() is None:
                encoder.kill()
                encoder.wait()
        self.assertEqual(code, 0, error_log.read_text(errors="replace"))
        self.assertTrue(output.is_file() and output.stat().st_size > 0)
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(output)],
            capture_output=True, text=True, check=True,
        )
        self.assertEqual(probe.stdout.strip(), "aac")
        return self._measure_onset(output)

    def test_zero_offset_preserves_audio_onset_and_plus_300ms_delays_it(self):
        with tempfile.TemporaryDirectory(prefix="rendrax-audio-offset-") as temp:
            directory = Path(temp)
            audio = directory / "source.wav"
            self._make_audio(audio)

            onset_zero = self._render(directory, audio, 0)
            onset_delayed = self._render(directory, audio, 300)

            self.assertAlmostEqual(onset_zero, 0.1, delta=0.04)
            self.assertAlmostEqual(onset_delayed, 0.4, delta=0.04)
            self.assertAlmostEqual(onset_delayed - onset_zero, 0.3, delta=0.04)


if __name__ == "__main__":
    unittest.main()
