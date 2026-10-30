"""Mesures de début audio/visuel pour proposer une correction de synchronisation."""
import io
import re
import shutil
import subprocess

from PIL import Image, ImageChops, ImageStat


def visual_change(reference, current, mean_threshold=5.0, changed_ratio=0.015):
    """Détecte un changement d'image significatif en ignorant les petites variations JPEG."""
    if not reference or not current:
        return False
    try:
        with Image.open(io.BytesIO(reference)) as first, Image.open(io.BytesIO(current)) as second:
            first = first.convert("L").resize((64, 64))
            second = second.convert("L").resize((64, 64))
            diff = ImageChops.difference(first, second)
            mean = ImageStat.Stat(diff).mean[0]
            histogram = diff.histogram()
            changed = sum(histogram[25:]) / (64 * 64)
            return mean >= mean_threshold and changed >= changed_ratio
    except (OSError, ValueError):
        return False


def first_audio_onset(audio_inputs, threshold_db=-45.0):
    """Retourne le premier instant audible en secondes, en tenant compte des offsets internes."""
    if not audio_inputs or not shutil.which("ffmpeg"):
        return None
    onsets = []
    for item in audio_inputs:
        path = item[0]
        internal_offset = float(item[2]) if len(item) > 2 else 0.0
        cmd = [
            "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
            "-af", f"silencedetect=noise={threshold_db}dB:d=0.02",
            "-f", "null", "-"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        log = result.stderr or ""
        if result.returncode not in (0, 255) and "silence_" not in log:
            continue
        match = re.search(r"silence_end:\s*([0-9]+(?:\.[0-9]+)?)", log)
        silence_at_start = re.search(r"silence_start:\s*0(?:\.0+)?", log)
        if match:
            onset = float(match.group(1))
        elif silence_at_start:
            # La piste reste sous le seuil jusqu'à la fin : elle ne fournit pas de début audible.
            continue
        else:
            onset = 0.0
        # L'offset interne positif avance le contenu ; négatif le retarde.
        onset = max(0.0, onset - internal_offset)
        onsets.append(onset)
    return min(onsets) if onsets else None

def calculate_audio_offset_ms(visual_onset_ms, audio_onset_ms, limit_ms=2000):
    """Calcule la correction signée : visuel moins audio, bornée à ±limit_ms."""
    if visual_onset_ms is None or audio_onset_ms is None:
        return None
    visual = float(visual_onset_ms)
    audio = float(audio_onset_ms)
    limit = int(limit_ms)
    if not all(map(lambda value: value == value and abs(value) != float("inf"), (visual, audio))):
        raise ValueError("Les instants audio et visuel doivent être finis.")
    if limit < 0:
        raise ValueError("La limite doit être positive ou nulle.")
    return max(-limit, min(limit, int(round(visual - audio))))
