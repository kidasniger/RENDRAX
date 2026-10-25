"""Ajout d'un filigrane RENDRAX animé au MP4 final, sans modifier le HTML."""
import json
import math
import shutil
import subprocess
from pathlib import Path

from PIL import Image

ANIMATIONS = {"pulse", "fade", "float", "fixed"}
POSITIONS = {"right-center", "bottom-right", "bottom-left", "top-right", "top-left", "center"}
FPS = 20
DURATION_MS = 2000


def validate_watermark(text="RENDRAX", animation="pulse", position="right-center",
                       opacity=0.45, size=0.07):
    if not isinstance(text, str) or not text.strip() or len(text) > 80:
        raise ValueError("Le texte du filigrane doit contenir de 1 à 80 caractères.")
    if animation not in ANIMATIONS:
        raise ValueError("Animation de filigrane non prise en charge.")
    if position not in POSITIONS:
        raise ValueError("Position du filigrane non prise en charge.")
    try:
        opacity, size = float(opacity), float(size)
    except (TypeError, ValueError) as exc:
        raise ValueError("L’opacité et la taille doivent être numériques.") from exc
    if not math.isfinite(opacity) or not 0.1 <= opacity <= 1.0:
        raise ValueError("L’opacité doit être comprise entre 10 % et 100 %.")
    if not math.isfinite(size) or not 0.02 <= size <= 0.12:
        raise ValueError("La taille doit être comprise entre 2 % et 12 %.")
    return text.strip(), animation, position, opacity, size


def _font(size, bold=False):
    paths = (
        ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"]
        if bold else
        ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"]
    )
    for name in paths:
        if Path(name).is_file():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def _make_apng(path, frame_width, frame_height, text, animation, opacity, size):
    """Convert the supplied animated RENDRAX GIF into a transparent APNG watermark."""
    gif_path = Path(__file__).resolve().parents[1] / "logo" / "rendrax-watermark.gif"
    if not gif_path.is_file():
        raise RuntimeError("Le fichier du logo animé RENDRAX est absent.")

    # Read frames first so each original delay and the total animation duration are preserved.
    raw_frames = []
    with Image.open(gif_path) as source:
        for index in range(getattr(source, "n_frames", 1)):
            source.seek(index)
            raw_frames.append((
                source.convert("RGBA").copy(),
                max(20, int(source.info.get("duration", 100))),
            ))
    if not raw_frames:
        raise RuntimeError("Le logo animé RENDRAX ne contient aucune image.")

    total_duration = sum(delay for _, delay in raw_frames)
    # Keep the logo legible but discreet on portrait, landscape and square videos.
    target_height = max(20, round(min(frame_height * size, frame_width * 0.083)))
    frames, durations = [], []
    cumulative_ms = 0
    for frame, delay_ms in raw_frames:
        scale = target_height / max(1, frame.height)
        target_width = max(1, round(frame.width * scale))
        frame = frame.resize((target_width, target_height), Image.Resampling.LANCZOS)
        phase = (cumulative_ms + delay_ms / 2) / max(1, total_duration)
        wave = (math.sin(2 * math.pi * phase) + 1) / 2
        if animation == "pulse":
            factor = 0.70 + 0.30 * wave
        elif animation == "fade":
            factor = 0.15 + 0.85 * wave
        else:
            factor = 1.0
        alpha_factor = max(0.0, min(1.0, opacity * factor))
        alpha = frame.getchannel("A").point(lambda value, f=alpha_factor: round(value * f))
        frame.putalpha(alpha)
        frames.append(frame)
        durations.append(delay_ms)
        cumulative_ms += delay_ms

    path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        path,
        format="PNG",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=[2] * len(frames),
        blend=[0] * len(frames),
        optimize=True,
    )
    return frames[0].size

def _ffprobe_dimensions(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", str(path)],
        capture_output=True, text=True, timeout=30, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("Impossible de lire les dimensions de la vidéo source.")
    try:
        stream = json.loads(result.stdout)["streams"][0]
        width, height = int(stream["width"]), int(stream["height"])
    except (ValueError, KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("La vidéo source n’a pas de dimensions valides.") from exc
    if width < 2 or height < 2:
        raise RuntimeError("Les dimensions de la vidéo source sont invalides.")
    return width, height


def _overlay_filter(position, animation, frame_width, frame_height):
    margin_x, margin_y = f"W*0.025", f"H*0.025"
    if position == "right-center":
        x, y = f"W-w-{margin_x}", "H*0.55-h/2"
    elif position == "bottom-right":
        x, y = f"W-w-{margin_x}", f"H-h-{margin_y}"
    elif position == "bottom-left":
        x, y = margin_x, f"H-h-{margin_y}"
    elif position == "top-right":
        x, y = f"W-w-{margin_x}", margin_y
    elif position == "top-left":
        x, y = margin_x, margin_y
    else:
        x, y = "(W-w)/2", "(H-h)/2"
    if animation == "float":
        y += "+sin(2*PI*t/4)*H*0.006"
    return (f"[1:v]format=rgba,setpts=PTS-STARTPTS[wm];"
            f"[0:v][wm]overlay=x='{x}':y='{y}':eval=frame:eof_action=repeat:shortest=1[v]")


def apply_watermark(source, destination, text="RENDRAX", animation="pulse",
                    position="right-center", opacity=0.45, size=0.07):
    """Overlay an animated PNG; copy audio packets unchanged to preserve sync."""
    text, animation, position, opacity, size = validate_watermark(
        text, animation, position, opacity, size
    )
    source, destination = Path(source), Path(destination)
    if not source.is_file() or source.stat().st_size == 0:
        raise ValueError("Le MP4 source est absent ou vide.")
    if source.resolve() == destination.resolve():
        raise ValueError("Le fichier temporaire du filigrane doit différer du MP4 source.")
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("FFmpeg et ffprobe sont requis pour intégrer le filigrane.")
    frame_width, frame_height = _ffprobe_dimensions(source)
    animation_file = destination.with_suffix(".apng")
    _make_apng(animation_file, frame_width, frame_height, text, animation, opacity, size)
    filter_complex = _overlay_filter(position, animation, frame_width, frame_height)
    command = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-stream_loop", "-1", "-i", str(animation_file),
        "-filter_complex", filter_complex, "-map", "[v]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart",
        str(destination),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=1800, check=False)
        if result.returncode != 0 or not destination.is_file() or destination.stat().st_size == 0:
            raise RuntimeError("Échec de l’ajout du filigrane : " +
                               (result.stderr or "sortie MP4 invalide")[-1200:])
        # Ensure the replacement stays on the same filesystem and only happens after success.
        shutil.move(str(destination), str(source))
        return source
    finally:
        animation_file.unlink(missing_ok=True)
