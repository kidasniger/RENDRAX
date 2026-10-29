"""Rendu image par image d'un fichier HTML."""
import base64
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from h2m.browser import CDP, launch_chrome, page_ws_url, stop_chrome
from h2m.deps import IS_TERMUX, find_chrome
from h2m.encode import (QUALITY, check_audio_level, output_path, start_encoder, unique_path, verify_sync,
                        write_wav, write_wav_payload)
from h2m.profiles import (PRECISE_PROFILES, choose_frame_size, detect_profile, editpro_duration, extract_audio,
                          inject_base_url, inject_generic_audio_capture, patch_html)
from h2m.report import print_report
from h2m.scripts_js import JS_HELPERS
from h2m.ui import die, fmt_time, good, info, warn


def select_fps(profile, requested="auto"):
    """Use 60 fps for seekable/synchronized profiles and 30 for generic HTML."""
    if requested is None or str(requested).lower() == "auto":
        return 60 if profile in PRECISE_PROFILES else 30
    fps = int(requested)
    if not 1 <= fps <= 120:
        raise ValueError("La fréquence d’images doit être comprise entre 1 et 120 i/s.")
    return fps


def select_quality(requested="auto", scale=1.0, test=0, preview=False):
    """Use faster encoding for previews/reduced exports and standard otherwise."""
    if requested and requested != "auto":
        return requested
    if preview or float(test or 0) > 0 or float(scale or 1.0) < 1.0:
        return "fast"
    return "standard"



FORMAT_SIZES = {
    "portrait": (1080, 1920),
    "landscape": (1920, 1080),
    "square": (1080, 1080),
}
FORMAT_LABELS = {
    "portrait": "portrait 9:16",
    "landscape": "paysage 16:9",
    "square": "carré 1:1",
}


def resolve_scene_format(width, height):
    """Classe une scène en portrait, carré ou paysage à partir de son ratio."""
    try:
        width, height = float(width), float(height)
    except (TypeError, ValueError):
        return "portrait"
    if not math.isfinite(width) or not math.isfinite(height) or width <= 1 or height <= 1:
        return "portrait"
    ratio = width / height
    if ratio < 0.9:
        return "portrait"
    if ratio <= 1.1:
        return "square"
    return "landscape"


def output_dimensions(scene_width, scene_height, requested_format="auto", scale=1.0):
    """Calcule la taille du MP4 ; les dimensions sont paires pour FFmpeg/yuv420p."""
    if requested_format in FORMAT_SIZES:
        width, height = FORMAT_SIZES[requested_format]
    else:
        try:
            width, height = int(round(float(scene_width))), int(round(float(scene_height)))
        except (TypeError, ValueError):
            width, height = 1080, 1920
    try:
        scale = float(scale)
    except (TypeError, ValueError):
        scale = 1.0
    if not math.isfinite(scale) or scale <= 0:
        scale = 1.0

    def even(value):
        return max(2, int(math.floor(float(value) * scale / 2.0)) * 2)

    return even(width), even(height)


def detect_scene_rect(cdp, default_viewport=(1080, 1920)):
    """Renvoie le rectangle de la scène visible et sa source, après chargement DOM."""
    try:
        fallback_width, fallback_height = int(default_viewport[0]), int(default_viewport[1])
    except (TypeError, ValueError, IndexError):
        fallback_width, fallback_height = 1080, 1920
    if fallback_width <= 1 or fallback_height <= 1:
        fallback_width, fallback_height = 1080, 1920

    expression = r"""(() => {
      const rectOf = (el, source, sceneWidth, sceneHeight) => {
        if (!el || typeof el.getBoundingClientRect !== 'function') return null;
        const r = el.getBoundingClientRect();
        if (!(r.width > 1 && r.height > 1)) return null;
        return {
          x: Number(r.x), y: Number(r.y),
          width: Number(r.width), height: Number(r.height),
          sceneWidth: Number(sceneWidth || r.width),
          sceneHeight: Number(sceneHeight || r.height),
          source
        };
      };
      const stage = document.querySelector('.stage, #stage, .st, #st');
      const stageRect = rectOf(stage, 'stage');
      if (stageRect) return stageRect;

      const canvases = [...document.querySelectorAll('main canvas, canvas')]
        .map((el) => {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (!(r.width > 1 && r.height > 1) || style.display === 'none' ||
              style.visibility === 'hidden') return null;
          const explicit = el.hasAttribute('width') && el.hasAttribute('height');
          return rectOf(el, 'canvas', explicit ? el.width : r.width,
            explicit ? el.height : r.height);
        })
        .filter(Boolean)
        .sort((a, b) => (b.sceneWidth * b.sceneHeight) - (a.sceneWidth * a.sceneHeight));
      const mainCanvas = canvases.find((item) => {
        const el = [...document.querySelectorAll('main canvas, canvas')].find((node) => {
          const r = node.getBoundingClientRect();
          return Math.abs(r.width - item.width) < 1 && Math.abs(r.height - item.height) < 1;
        });
        return el && el.closest('main');
      }) || canvases[0];
      if (mainCanvas) return mainCanvas;

      const lottieElement = document.querySelector(
        '.lottie, [class*="lottie" i], [id*="lottie" i], [data-animation-path], svg'
      );
      const lottieRect = rectOf(lottieElement, 'lottie');
      if (lottieRect) return lottieRect;

      const meta = document.querySelector('meta[name="viewport" i]');
      if (meta) {
        const value = meta.getAttribute('content') || '';
        const read = (key) => {
          const match = value.match(new RegExp('(?:^|[,;\\\\s])' + key +
            '\\\\s*=\\\\s*(device-[a-z]+|[0-9]+(?:\\\\.[0-9]+)?)', 'i'));
          if (!match) return null;
          return /^device-/i.test(match[1])
            ? (key === 'width' ? window.innerWidth : window.innerHeight)
            : Number(match[1]);
        };
        const width = read('width');
        const height = read('height');
        if (width && height && width > 1 && height > 1) {
          return {x: 0, y: 0, width, height, sceneWidth: width,
            sceneHeight: height, source: 'meta viewport'};
        }
        if (width && width > 1) {
          return {x: 0, y: 0, width, height: window.innerHeight,
            sceneWidth: width, sceneHeight: window.innerHeight, source: 'meta viewport'};
        }
      }

      for (const [el, name] of [[document.body, 'body'], [document.documentElement, 'html']]) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const width = r.width || el.clientWidth || el.offsetWidth;
        const height = r.height || el.clientHeight || el.offsetHeight;
        if (width > 1 && height > 1) {
          return {x: Math.max(0, r.x), y: Math.max(0, r.y), width, height,
            sceneWidth: width, sceneHeight: height, source: name};
        }
      }
      return {x: 0, y: 0, width: window.innerWidth || 1080,
        height: window.innerHeight || 1920, sceneWidth: window.innerWidth || 1080,
        sceneHeight: window.innerHeight || 1920, source: 'viewport par défaut'};
    })()"""
    try:
        measured = cdp.ev(expression, await_promise=False)
        if isinstance(measured, dict):
            values = {
                "x": float(measured.get("x", 0)),
                "y": float(measured.get("y", 0)),
                "width": float(measured.get("width", 0)),
                "height": float(measured.get("height", 0)),
                "scene_width": float(measured.get("sceneWidth", measured.get("width", 0))),
                "scene_height": float(measured.get("sceneHeight", measured.get("height", 0))),
                "source": str(measured.get("source", "viewport par défaut")),
            }
            if values["width"] > 1 and values["height"] > 1:
                return values
        elif isinstance(measured, (list, tuple)) and len(measured) >= 4:
            x, y, width, height = (float(measured[i]) for i in range(4))
            if width > 1 and height > 1:
                return {"x": x, "y": y, "width": width, "height": height,
                        "scene_width": width, "scene_height": height, "source": "DOM"}
    except (RuntimeError, TypeError, ValueError, OverflowError):
        pass
    return {"x": 0.0, "y": 0.0, "width": float(fallback_width), "height": float(fallback_height),
            "scene_width": float(fallback_width), "scene_height": float(fallback_height),
            "source": "viewport par défaut"}


def detect_scene_size(cdp, default_viewport=(1080, 1920)):
    """Retourne (largeur, hauteur) en lisant la scène réelle dans Chromium."""
    rect = detect_scene_rect(cdp, default_viewport)
    return int(round(rect["scene_width"])), int(round(rect["scene_height"]))


def format_description(scene_format):
    return FORMAT_LABELS.get(scene_format, "format inconnu")


def centered_crop_clip(scene_rect, output_width, output_height):
    """Centre un recadrage de même ratio que la sortie, sans étirement ni bandes."""
    x = float(scene_rect.get("x", 0))
    y = float(scene_rect.get("y", 0))
    width = max(2.0, float(scene_rect.get("width", output_width)))
    height = max(2.0, float(scene_rect.get("height", output_height)))
    target_ratio = max(2, int(output_width)) / max(2, int(output_height))
    source_ratio = width / height

    if source_ratio > target_ratio:
        crop_width, crop_height = height * target_ratio, height
    else:
        crop_width, crop_height = width, width / target_ratio
    x += (width - crop_width) / 2.0
    y += (height - crop_height) / 2.0
    # Page.captureScreenshot multiplie le rectangle par « scale » : le JPEG arrive
    # donc directement à la résolution de sortie calculée, sans redimensionnement anisotrope.
    factor = int(output_width) / crop_width
    return {
        "x": round(max(0.0, x), 3),
        "y": round(max(0.0, y), 3),
        "width": round(crop_width, 3),
        "height": round(crop_height, 3),
        "scale": factor,
    }


def render(html_path, args):
    tmp = Path(tempfile.mkdtemp(prefix="html2mp4_"))
    chrome = proc = cdp = enc = None
    wake = IS_TERMUX and shutil.which("termux-wake-lock")
    try:
        if wake:
            subprocess.call(["termux-wake-lock"])

        text = html_path.read_text(encoding="utf-8", errors="ignore")
        profile, label = detect_profile(text)
        if profile == "invalid":
            die(label)
        selected_quality = select_quality(
            getattr(args, "quality", "auto"), getattr(args, "scale", 1.0),
            getattr(args, "test", 0), getattr(args, "preview", False)
        )
        info(f"Fichier vérifié : {label}")
        info(f"Qualité d’encodage automatique : {selected_quality}.")
        text, profile = patch_html(text)
        precise_candidate = profile in PRECISE_PROFILES
        requested_format = getattr(args, "format", "auto") or "auto"
        W, H = choose_frame_size(text, requested_format, profile=profile)
        initial_W, initial_H = W, H
        page = tmp / "page.html"
        text = inject_base_url(text, html_path.parent.resolve().as_uri().rstrip("/") + "/")
        if not precise_candidate:
            text = inject_generic_audio_capture(text)
        page.write_text(text, encoding="utf-8")
        audio = extract_audio(text, tmp, profile) if precise_candidate else {"voice": None, "music": None, "music_volume": 0.2}
        info(f"Fenêtre initiale {initial_W}×{initial_H} · mode : {'image par image (synchronisé)' if precise_candidate else 'universel (temps réel, synchro non garantie)'}")

        chrome = find_chrome()
        info("Démarrage de Chromium…")
        proc, port = launch_chrome(chrome, tmp, initial_W, initial_H)
        cdp = CDP(page_ws_url(port))
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", width=initial_W, height=initial_H, deviceScaleFactor=1, mobile=False)
        cdp.call("Page.navigate", url=page.as_uri())

        info("Chargement du document HTML…")
        t0 = time.time()
        ready = "(()=>({body:!!document.body,state:document.readyState}))()"
        last_state = {}
        while time.time() - t0 < 90:
            try:
                last_state = cdp.ev(ready, await_promise=False) or {}
                if last_state.get("body") and last_state.get("state") == "complete":
                    break
                if last_state.get("body") and time.time() - t0 > 15:
                    warn("La page n'a pas fini de charger toutes ses ressources ; essai de rendu avec le contenu disponible.")
                    break
            except RuntimeError:
                pass
            time.sleep(0.25)
        else:
            die("Chromium n'a pas réussi à créer le document HTML.")
        time.sleep(0.2)

        is_precise = False
        if precise_candidate:
            if profile == "kidas":
                check = "(()=>!!document.querySelector('.stage')&&document.querySelectorAll('audio').length>=1&&typeof D==='number'&&typeof window.__setT==='function')()"
            elif profile == "voicevideo":
                check = "(()=>!!document.querySelector('#stage')&&!!window.__video&&typeof window.__video.seek==='function'&&document.querySelectorAll('audio').length>=1)()"
            elif profile == "musicpro":
                check = "(()=>!!document.querySelector('#st')&&typeof render==='function'&&typeof D==='number'&&typeof vP!=='undefined'&&typeof mP!=='undefined')()"
            elif profile == "gsapvideo":
                check = "(()=>!!document.querySelector('#st')&&!!document.querySelector('#a')&&typeof gsap!=='undefined'&&typeof tl!=='undefined'&&typeof SUB!=='undefined')()"
            elif profile == "lottie":
                check = "(()=>!!window.__h2mLottieReady&&window.__h2mLottieReady())()"
            else:
                check = "(()=>!!document.querySelector('#stage')&&typeof render==='function'&&typeof IM==='object')()"
            t1 = time.time()
            while time.time() - t1 < 30 and not is_precise:
                try:
                    is_precise = bool(cdp.ev(check, await_promise=False))
                except RuntimeError:
                    is_precise = False
                if not is_precise:
                    time.sleep(0.5)
            if not is_precise:
                die(f"Fichier reconnu ({label}) mais la page ne s'est pas initialisée : "
                    "Internet est-il disponible pour charger React et les polices ?")

        # Mesure après chargement du DOM, afin de couvrir aussi les scènes créées en JavaScript.
        scene_rect = detect_scene_rect(cdp, (initial_W, initial_H))
        scene_width = max(2, int(round(scene_rect["scene_width"])))
        scene_height = max(2, int(round(scene_rect["scene_height"])))
        if requested_format == "auto" and scene_rect["source"] == "canvas":
            # Un canvas a souvent des dimensions intrinsèques qui doivent guider le viewport.
            viewport_width, viewport_height = scene_width, scene_height
        else:
            viewport_width = max(initial_W, W, int(math.ceil(scene_rect["x"] + scene_rect["width"])),
                                 scene_width)
            viewport_height = max(initial_H, H, int(math.ceil(scene_rect["y"] + scene_rect["height"])),
                                  scene_height)
        if viewport_width != initial_W or viewport_height != initial_H:
            cdp.call("Emulation.setDeviceMetricsOverride", width=viewport_width, height=viewport_height,
                     deviceScaleFactor=1, mobile=False)
            time.sleep(0.15)
            scene_rect = detect_scene_rect(cdp, (viewport_width, viewport_height))
            scene_width = max(2, int(round(scene_rect["scene_width"])))
            scene_height = max(2, int(round(scene_rect["scene_height"])))

        if requested_format == "auto":
            detected_format = resolve_scene_format(scene_width, scene_height)
            base_width, base_height = scene_width, scene_height
        else:
            detected_format = requested_format
            base_width, base_height = choose_frame_size(text, requested_format, profile=profile)
        W, H = output_dimensions(base_width, base_height, requested_format, getattr(args, "scale", 1.0))
        description = format_description(detected_format)
        if requested_format == "auto":
            info(f"Format détecté : {description} · scène {scene_width}×{scene_height} · sortie {W}×{H}")
        else:
            info(f"Format imposé : {description} · scène {scene_width}×{scene_height} · sortie {W}×{H}")

        if is_precise:
            cdp.ev(f"window.__profile = {json.dumps(profile)}; 0", await_promise=False)
            cdp.ev(JS_HELPERS, await_promise=False)
            cdp.ev("window.__prep()")
            if profile in ("kidas", "musicpro"):
                total = float(cdp.ev("D"))
            elif profile == "voicevideo":
                total = float(cdp.ev("window.__video.duration"))
            elif profile == "gsapvideo":
                # The embedded narration is the master clock for the original GSAP timeline.
                total = float(cdp.ev("document.querySelector('#a').duration"))
            elif profile == "lottie":
                total = float(cdp.ev("window.__h2mLottieDuration()"))
            else:
                total = editpro_duration(text)
            dur = min(total, args.duration) if args.duration > 0 else total
            if args.test > 0:
                dur = min(dur, args.test)
            # Native browser animations run around 60 Hz; preserve that cadence for GSAP timeline videos.
            fps = select_fps(profile, getattr(args, "fps", "auto"))
            n_frames = max(1, int(round(dur * fps)))
            info(f"Mode synchronisé · {label} · durée {dur:.2f} s · {fps} i/s")

            audio_inputs = []
            if audio["voice"]:
                audio_inputs.append((audio["voice"], 1.0))
            if audio["music"]:
                audio_inputs.append((audio["music"], audio["music_volume"]))
            if profile == "kidas":
                try:
                    b64 = cdp.ev("window.__sfx()")
                    if b64:
                        info("Effets sonores recréés.")
                        sfx = tmp / "sfx.wav"
                        write_wav(sfx, base64.b64decode(b64))
                        audio_inputs.append((sfx, 1.0))
                except Exception as e:  # noqa: BLE001
                    warn(f"Effets sonores ignorés : {e}")
            if profile == "musicpro":
                # Voix et musique sont lues telles que le navigateur les a décodées/synthétisées :
                # aucun format audio à deviner, et la musique inclut déjà son ducking.
                for key, label_fr in (("voice", "voix"), ("music", "musique")):
                    try:
                        payload = cdp.ev(f"window.__wavOf('{key}')")
                    except Exception as e:  # noqa: BLE001
                        warn(f"Piste {label_fr} ignorée : {e}")
                        continue
                    if payload:
                        p = tmp / f"{key}.wav"
                        write_wav_payload(p, payload)
                        audio_inputs.append((p, 1.0))
                        info(f"Piste {label_fr} récupérée depuis le navigateur.")
                    else:
                        warn(f"Piste {label_fr} introuvable ou non décodée par le navigateur.")
            if not audio_inputs and profile != "lottie":
                die("Aucune piste audio valide n’a été récupérée pour ce profil synchronisé. Le MP4 muet a été bloqué.")
            if not audio_inputs and profile == "lottie":
                warn("Aucune piste audio intégrée détectée : le rendu Lottie sera exporté sans son.")

            cdp.ev("window.__seek(0)")
            if profile == "lottie":
                r = cdp.ev("window.__h2mLottieStage()")
                if not r or len(r) < 4:
                    die("Impossible de déterminer la scène de l’animation Lottie.")
                scene_rect = {"x": float(r[0]), "y": float(r[1]), "width": float(r[2]),
                              "height": float(r[3]), "scene_width": float(r[2]),
                              "scene_height": float(r[3]), "source": "lottie"}
            else:
                scene_rect = detect_scene_rect(cdp, (viewport_width, viewport_height))
            clip = centered_crop_clip(scene_rect, W, H)
            mode = "synchronisé"
        else:
            # Mode générique : la page n'a besoin ni de .stage, ni de D, ni d'AUD/MUS.
            if args.duration > 0:
                dur = args.duration
            else:
                try:
                    media_dur = cdp.ev("(()=>Math.max(0,...[...document.querySelectorAll('audio,video')].map(x=>x.duration).filter(x=>Number.isFinite(x)&&x>0)))()", await_promise=False)
                except RuntimeError:
                    media_dur = 0
                if not media_dur:
                    # Pas de <audio>/<video> : on cherche une durée déclarée par la page (const D = 48.59…).
                    try:
                        media_dur = cdp.ev(
                            "(()=>{for(const n of ['D','DUR','DURATION','TOTAL','TOTAL_DURATION','VIDEO_DURATION']){"
                            "try{const v=(0,eval)(n);if(typeof v==='number'&&isFinite(v)&&v>=2&&v<=900)return v}catch(e){}}return 0})()",
                            await_promise=False)
                    except RuntimeError:
                        media_dur = 0
                    if media_dur:
                        info(f"Durée déclarée par la page : {float(media_dur):.2f} s.")
                    else:
                        warn("Durée de la page non détectée : 60 s par défaut. Utilise --duration N pour la fixer.")
                dur = float(media_dur or 60.0)
            if args.test > 0:
                dur = min(dur, args.test)
            fps = select_fps(profile, getattr(args, "fps", "auto"))
            n_frames = max(1, int(round(dur * fps)))
            info(f"Mode universel · durée {dur:.2f} s · {fps} i/s · capture de la scène")
            clip = centered_crop_clip(scene_rect, W, H)
            audio_inputs = []
            mode = "universel"

            # Certaines animations (dont EditPro – Vidéo 60 s) restent immobiles
            # tant que leur bouton de démarrage n'a pas reçu une vraie action pointeur.
            try:
                target = cdp.ev(r"""(() => {
                    const action = /(d[eé]marrer|start|lancer|commencer|commencez|lire|play|lecture|begin|▶|▷)/i;
                    const nodes = [...document.querySelectorAll('body *')];
                    const visible = nodes.map(el => {
                      const r = el.getBoundingClientRect();
                      const st = getComputedStyle(el);
                      const label = ((el.innerText || el.value || '') + ' ' +
                        (el.getAttribute('aria-label') || '') + ' ' + (el.title || '')).trim();
                      const buttonLike = el.matches('button,[role="button"],input[type=button],input[type=submit],a[role="button"]') ||
                        typeof el.onclick === 'function' || el.hasAttribute('onclick') || st.cursor === 'pointer';
                      const largeOverlay = r.width * r.height >= innerWidth * innerHeight * 0.2;
                      return {el, r, label, clickable: buttonLike || largeOverlay,
                        visible: r.width > 0 && r.height > 0 && st.display !== 'none' &&
                          st.visibility !== 'hidden' && Number(st.opacity) > 0.01};
                    }).filter(x => x.visible && x.clickable && action.test(x.label));
                    const chosen = visible.find(x => /(d[eé]marrer|start|lancer|commencer|lire avec|play|▶|▷)/i.test(x.label)) || visible[0];
                    return chosen ? {x: chosen.r.x + chosen.r.width/2,
                      y: chosen.r.y + chosen.r.height/2, label: chosen.label.slice(0, 100)} : null;
                })()""", await_promise=False)
                if target:
                    # CDP pointer events produisent une activation navigateur réelle,
                    # contrairement à HTMLElement.click() pour l'audio protégé par autoplay.
                    cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=target["x"], y=target["y"])
                    cdp.call("Input.dispatchMouseEvent", type="mousePressed", x=target["x"], y=target["y"], button="left", clickCount=1)
                    cdp.call("Input.dispatchMouseEvent", type="mouseReleased", x=target["x"], y=target["y"], button="left", clickCount=1)
                    info(f"Bouton de démarrage activé automatiquement : {target['label']}")
                    # Certains modèles décodent la narration de façon asynchrone après le clic.
                    has_known_ui = bool(cdp.ev("!!document.querySelector('#ui')", await_promise=False))
                    if has_known_ui:
                        t_click = time.monotonic()
                        while time.monotonic() - t_click < 8:
                            try:
                                started = cdp.ev(r"""(() => {
                                  const ui = document.querySelector('#ui');
                                  return !!(ui && getComputedStyle(ui).display === 'none');
                                })()""", await_promise=False)
                                if started:
                                    break
                            except RuntimeError:
                                pass
                            time.sleep(0.03)
                    else:
                        time.sleep(0.3)
                else:
                    info("Aucun bouton de démarrage évident trouvé ; capture de la page telle quelle.")

                cdp.ev("window.__h2mStart()")
                info("Capture audio du navigateur activée (médias HTML et Web Audio si disponibles).")
            except Exception as e:  # noqa: BLE001
                warn(f"Activation automatique ou capture audio indisponible : {e}")

            latest_rect = detect_scene_rect(cdp, (viewport_width, viewport_height))
            if requested_format == "auto" and scene_rect["source"] == "viewport par défaut" and latest_rect["source"] != "viewport par défaut":
                scene_rect = latest_rect
                scene_width = max(2, int(round(scene_rect["scene_width"])))
                scene_height = max(2, int(round(scene_rect["scene_height"])))
                detected_format = resolve_scene_format(scene_width, scene_height)
                W, H = output_dimensions(scene_width, scene_height, "auto", getattr(args, "scale", 1.0))
                info(f"Format détecté après démarrage : {format_description(detected_format)} · scène {scene_width}×{scene_height} · sortie {W}×{H}")
            else:
                scene_rect = latest_rect
            clip = centered_crop_clip(scene_rect, W, H)

        out_final = unique_path(output_path(html_path, args))
        out_tmp = tmp / "out.mp4"
        err_path = tmp / "ffmpeg.log"
        frame_files = []
        if is_precise:
            enc = start_encoder(out_tmp, fps, n_frames / fps, audio_inputs, err_path,
                                quality=selected_quality, loudnorm=args.loudnorm)

        if not is_precise:
            # Référence de temps commune navigateur/FFmpeg pour aligner l'audio WebAudio.
            try:
                cdp.ev("(window.__h2mMark ? window.__h2mMark() : (window.__h2mVideoStartPerf = performance.now())); true", await_promise=False)
            except Exception:  # noqa: BLE001
                pass
        info(f"Rendu en cours ({mode})…")
        start = time.monotonic()
        slow_frames = 0
        frame_ts = []  # mode universel : instant réel (s) de chaque capture
        i = -1
        while True:
            i += 1
            if is_precise:
                if i >= n_frames:
                    break
                cdp.ev(f"window.__seek({i / fps:.5f})")
            else:
                # Mode universel : on capture jusqu'à ce que le TEMPS RÉEL atteigne la durée,
                # puis on remet les images à cadence constante (voir plus bas).
                delay = start + i / fps - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                if time.monotonic() - start >= dur:
                    break
                frame_ts.append(time.monotonic() - start)
            shot = cdp.call("Page.captureScreenshot", format="jpeg", quality=QUALITY[selected_quality]["jpeg"], clip=clip)
            jpeg = base64.b64decode(shot["data"])
            if is_precise:
                try:
                    enc.stdin.write(jpeg)
                except BrokenPipeError:
                    break
            else:
                frame_path = tmp / f"frame-{i:06d}.jpg"
                frame_path.write_bytes(jpeg)
                frame_files.append(frame_path)
            if not is_precise and time.monotonic() > start + (i + 1) / fps:
                slow_frames += 1
            if i % max(1, fps // 2) == 0 or i == n_frames - 1:
                elapsed = time.monotonic() - start
                if is_precise:
                    eta = elapsed / (i + 1) * (n_frames - i - 1)
                    sys.stdout.write(f"\r  {i + 1}/{n_frames}  {100 * (i + 1) / n_frames:5.1f}%  reste ≈ {fmt_time(eta)}   ")
                else:
                    sys.stdout.write(f"\r  {min(elapsed, dur):.1f}/{dur:.1f} s  {i + 1} captures   ")
                sys.stdout.flush()
        print()

        if not is_precise:
            try:
                captures = cdp.ev("window.__h2mStop()")
                for idx, item in enumerate(captures or []):
                    p = tmp / f"browser-audio-{idx}.webm"
                    p.write_bytes(base64.b64decode(item["data"]))
                    if p.stat().st_size > 500:
                        audio_inputs.append((p, 1.0, float(item.get("offset", 0.0))))
                if audio_inputs:
                    warn("Les pistes audio génériques sont incluses ; vérifie la synchronisation et les sons spécifiques de la page.")
                else:
                    warn("Aucun son capturé : la page ne produit peut-être pas d'audio Web Audio/<audio>, ou elle attend un geste "
                         "de l'utilisateur. La vidéo sera muette.")
            except Exception as e:  # noqa: BLE001
                warn(f"Impossible de récupérer la piste audio du navigateur : {e}")
            if slow_frames:
                warn(f"{slow_frames}/{len(frame_files)} captures plus lentes que {fps} i/s : la chronologie reste exacte "
                     "(images répétées pour combler), mais l'animation sera moins fluide. "
                     "Essaie --fps 15 ou --scale 0.5. Pour une fluidité parfaite, la page doit exposer un mode image par image.")

        if not is_precise:
            info("Assemblage des images et de l'audio…")
            enc = start_encoder(out_tmp, fps, n_frames / fps, audio_inputs, err_path,
                                quality=selected_quality, loudnorm=args.loudnorm)
            # Remise à cadence constante : pour chaque instant k/fps on écrit la dernière image
            # réellement capturée avant cet instant. Image et audio restent ainsi sur la même horloge.
            j = 0
            last_data, last_idx = None, -1
            for k in range(n_frames):
                while j + 1 < len(frame_files) and frame_ts[j + 1] <= k / fps:
                    j += 1
                if frame_files:
                    if last_data is None or last_idx != j:
                        last_data, last_idx = frame_files[j].read_bytes(), j
                    try:
                        enc.stdin.write(last_data)
                    except BrokenPipeError:
                        break
                if k % max(1, fps * 5) == 0 or k == n_frames - 1:
                    sys.stdout.write(f"\r  Assemblage {k + 1}/{n_frames}")
                    sys.stdout.flush()
            print()

        try:
            enc.stdin.close()
        except Exception:
            pass
        enc.wait()
        if enc.returncode != 0 or not out_tmp.exists():
            die("FFmpeg a échoué :\n" + err_path.read_text(errors="ignore")[-1000:])

        shutil.move(str(out_tmp), str(out_final))
        if getattr(args, "watermark", True):
            from h2m.watermark import apply_watermark
            apply_watermark(
                out_final, tmp / "watermarked.mp4",
                text=getattr(args, "watermark_text", "RENDRAX"),
                animation=getattr(args, "watermark_animation", "pulse"),
                position=getattr(args, "watermark_position", "right-center"),
                opacity=float(getattr(args, "watermark_opacity", 0.45)),
                size=float(getattr(args, "watermark_size", 0.07)),
            )
        video_duration, audio_duration, gap_ms = verify_sync(out_final, fps, n_frames / fps)
        if is_precise and audio_inputs:
            if video_duration is None or audio_duration is None:
                die("Le MP4 final n’expose pas une piste audio/vidéo vérifiable.")
            if gap_ms is not None and gap_ms > max(80.0, 2500.0 / fps):
                die(f"Écart audio/vidéo trop grand ({gap_ms:.0f} ms) : MP4 non validé.")
        peak = check_audio_level(out_final, bool(audio_inputs))
        good(f"Terminé en {fmt_time(time.monotonic() - start)} → {out_final}")
        print_report({
            "source": html_path.name, "output": out_final.name, "mode": mode, "label": label,
            "width": W, "height": H, "fps": fps, "duration": n_frames / fps,
            "quality": selected_quality, "loudnorm": args.loudnorm,
            "audio_tracks": [item[0].stem for item in audio_inputs],
            "peak_db": peak, "sync_gap_ms": gap_ms,
        })
        return out_final
    finally:
        if cdp:
            cdp.close()
        if proc:
            stop_chrome(proc)
        if enc and enc.poll() is None:
            try:
                enc.kill()
            except Exception:
                pass
        if wake and shutil.which("termux-wake-unlock"):
            subprocess.call(["termux-wake-unlock"])
        shutil.rmtree(tmp, ignore_errors=True)


def _is_browser_failure(exc):
    """Vrai pour une panne de Chromium ou de sa connexion (et non une erreur de la page)."""
    try:
        from websocket import WebSocketException
    except ImportError:
        WebSocketException = ()
    if isinstance(exc, (OSError, WebSocketException)):
        return True
    return isinstance(exc, RuntimeError) and bool(
        re.search(r"closed|crash|disconnect|Target|Inspected target", str(exc), re.I))


def render_with_retry(html_path, args, attempts=2):
    """Relance le rendu une fois si Chromium plante, au lieu de perdre tout le travail."""
    for attempt in range(1, attempts + 1):
        try:
            return render(html_path, args)
        except Exception as e:  # noqa: BLE001
            if attempt == attempts or not _is_browser_failure(e):
                raise
            warn(f"Chromium s'est arrêté ({e}). Nouvelle tentative {attempt + 1}/{attempts}…")
