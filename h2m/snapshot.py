"""Rendu d'une page HTML en image fixe (PNG, JPEG ou WebP) avec Chromium.

Même moteur que la vidéo, sans FFmpeg :
  - pages à profil synchronisé (KIDAS, EditPro, GSAP…) : la timeline est placée à l'instant --at,
    puis la scène est capturée au pixel près ;
  - autres pages : capture de la page telle qu'elle s'affiche (option --at pour laisser l'animation
    avancer, option --full-page pour toute la hauteur du contenu).
"""
import base64
import json
import math
import shutil
import tempfile
import time
from pathlib import Path

from h2m.browser import CDP, launch_chrome, page_ws_url, stop_chrome
from h2m.deps import find_chrome
from h2m.encode import image_output_path, unique_path
from h2m.profiles import (PRECISE_PROFILES, choose_frame_size, detect_profile, find_stage_size, inject_base_url,
                          patch_html, profile_duration, ready_check)
from h2m.scripts_js import FIND_START_TARGET, JS_HELPERS
from h2m.ui import die, good, human_size, info, warn

IMAGE_FORMATS = {"png": ".png", "jpeg": ".jpg", "webp": ".webp"}
MIN_SCALE, MAX_SCALE = 0.25, 4.0
MAX_SIDE = 16384            # limite de texture de Chromium
MAX_PIXELS = 80_000_000     # garde-fou mémoire (≈ 320 Mo en RGBA)
MAX_WAIT = 300.0            # attente maximale (s) avant la capture d'une page générique
AUTO_VIEWPORT_HEIGHT = 800  # hauteur de départ quand la page ne déclare pas de taille (puis page entière)


def check_image_options(args):
    """Valide et normalise les réglages ; retourne (format, instant, échelle, qualité) ou lève ValueError."""
    fmt = str(getattr(args, "to", "png")).lower()
    if fmt == "jpg":
        fmt = "jpeg"
    if fmt not in IMAGE_FORMATS:
        raise ValueError("Format d'image non pris en charge : utilise png, jpeg ou webp.")
    try:
        at = float(getattr(args, "at", 0) or 0)
        scale = float(getattr(args, "scale", 1.0) or 1.0)
        quality = int(getattr(args, "image_quality", 92))
    except (TypeError, ValueError) as exc:
        raise ValueError("L'instant, l'échelle et la qualité doivent être numériques.") from exc
    if not math.isfinite(at) or at < 0:
        raise ValueError("L'instant de capture doit être un nombre de secondes positif ou nul.")
    if not math.isfinite(scale) or not MIN_SCALE <= scale <= MAX_SCALE:
        raise ValueError(f"L'échelle d'une image doit être comprise entre {MIN_SCALE:g} et {MAX_SCALE:g}.")
    if not 1 <= quality <= 100:
        raise ValueError("La qualité de l'image doit être comprise entre 1 et 100.")
    for name in ("width", "height"):
        value = int(getattr(args, name, 0) or 0)
        if value < 0 or value > MAX_SIDE:
            raise ValueError(f"--{name} doit être compris entre 1 et {MAX_SIDE} pixels (0 = automatique).")
    return fmt, at, scale, quality


def plan_viewport(text, profile, args):
    """Retourne (largeur, hauteur, page_entière) en pixels CSS pour la capture."""
    width, height = int(getattr(args, "width", 0) or 0), int(getattr(args, "height", 0) or 0)
    full_page = bool(getattr(args, "full_page", False))
    if profile in PRECISE_PROFILES:
        if width or height:
            warn("--width et --height sont ignorés : cette animation impose la taille de sa scène.")
        w, h = choose_frame_size(text, "auto")
        return w, h, False
    fmt = getattr(args, "format", "auto")
    if fmt == "auto":
        declared = find_stage_size(text)
        if declared:
            w, h = declared
        else:
            # Page sans taille déclarée (affiche, maquette, page de site) : 1080 px de large, hauteur du contenu.
            w, h, full_page = 1080, AUTO_VIEWPORT_HEIGHT, True
    else:
        w, h = choose_frame_size(text, fmt)
    return (width or w), (height or h), full_page


def _wait_document(cdp):
    t0 = time.time()
    while time.time() - t0 < 90:
        try:
            state = cdp.ev("(()=>({body:!!document.body,state:document.readyState}))()", await_promise=False) or {}
            if state.get("body") and state.get("state") == "complete":
                return
            if state.get("body") and time.time() - t0 > 15:
                warn("La page n'a pas fini de charger toutes ses ressources ; capture avec le contenu disponible.")
                return
        except RuntimeError:
            pass
        time.sleep(0.25)
    die("Chromium n'a pas réussi à créer le document HTML.")


def render_image(html_path, args):
    fmt, at, scale, quality = check_image_options(args)
    tmp = Path(tempfile.mkdtemp(prefix="html2img_"))
    proc = cdp = None
    try:
        text = html_path.read_text(encoding="utf-8", errors="ignore")
        profile, label = detect_profile(text)
        if profile == "invalid":
            die(label)
        info(f"Fichier vérifié : {label}")
        text, profile = patch_html(text)
        precise = profile in PRECISE_PROFILES
        W, H, full_page = plan_viewport(text, profile, args)

        transparent = bool(getattr(args, "transparent", False))
        if transparent and fmt == "jpeg":
            warn("Le JPEG ne gère pas la transparence : fond opaque.")
            transparent = False

        page = tmp / "page.html"
        page.write_text(inject_base_url(text, html_path.parent.resolve().as_uri().rstrip("/") + "/"), encoding="utf-8")

        chrome = find_chrome()
        viewport_h = H + 300 if precise else H
        info(f"Fenêtre {W}×{H} · échelle ×{scale:g} · format {fmt.upper()}"
             + (" · page entière" if full_page else ""))
        info("Démarrage de Chromium…")
        proc, port = launch_chrome(chrome, tmp, W, viewport_h)
        cdp = CDP(page_ws_url(port))
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", width=W, height=viewport_h, deviceScaleFactor=scale, mobile=False)
        if transparent:
            cdp.call("Emulation.setDefaultBackgroundColorOverride", color={"r": 0, "g": 0, "b": 0, "a": 0})
        cdp.call("Page.navigate", url=page.as_uri())
        info("Chargement du document HTML…")
        _wait_document(cdp)
        time.sleep(0.2)
        cdp.ev(JS_HELPERS, await_promise=False)

        if precise:
            ok, t1 = False, time.time()
            while time.time() - t1 < 30 and not ok:
                try:
                    ok = bool(cdp.ev(ready_check(profile), await_promise=False))
                except RuntimeError:
                    ok = False
                if not ok:
                    time.sleep(0.5)
            if not ok:
                die(f"Fichier reconnu ({label}) mais la page ne s'est pas initialisée : "
                    "Internet est-il disponible pour charger React et les polices ?")
            cdp.ev(f"window.__profile = {json.dumps(profile)}; 0", await_promise=False)
            cdp.ev("window.__prep()")
            total = profile_duration(cdp.ev, profile, text)
            if at > total:
                warn(f"Instant {at:g} s au-delà de la durée ({total:.2f} s) : capture de la dernière image.")
                at = max(0.0, total - 1 / 60)
            info(f"Mode synchronisé · scène placée à {at:.2f} s sur {total:.2f} s")
            cdp.ev(f"window.__seek({at:.5f})")
            r = cdp.ev("(()=>{const r=document.querySelector('.stage,#stage,#st').getBoundingClientRect();"
                       "return [r.x,r.y,r.width,r.height]})()")
            clip = {"x": round(r[0]), "y": round(r[1]), "width": W, "height": H, "scale": 1}
        else:
            href = cdp.ev("location.href", await_promise=False)
            target = cdp.ev(FIND_START_TARGET, await_promise=False)
            if at > 0:
                if target:
                    # Un vrai clic pointeur (comme pour la vidéo) : certaines pages l'exigent pour démarrer.
                    for kind in ("mouseMoved", "mousePressed", "mouseReleased"):
                        cdp.call("Input.dispatchMouseEvent", type=kind, x=target["x"], y=target["y"],
                                 button="left" if kind != "mouseMoved" else "none", clickCount=0 if kind == "mouseMoved" else 1)
                    info(f"Bouton de démarrage activé automatiquement : {target['label']}")
                wait = min(at, MAX_WAIT)
                if at > MAX_WAIT:
                    warn(f"Attente limitée à {MAX_WAIT:g} s.")
                info(f"Animation laissée en route pendant {wait:g} s…")
                time.sleep(wait)
                if cdp.ev("location.href", await_promise=False) != href:
                    die("Le clic de démarrage a fait quitter la page : capture annulée. Utilise --at 0 pour la page telle quelle.")
            elif target:
                info(f"Un bouton de démarrage est visible (« {target['label'][:40]} ») : la page est capturée telle quelle ; "
                     "utilise --at N pour la lancer N secondes avant la capture.")
            clip = {"x": 0, "y": 0, "width": W, "height": H, "scale": 1}

        cdp.ev("window.__finish()")
        time.sleep(0.15)

        beyond = False
        if full_page and not precise:
            content_h = int(cdp.ev("Math.ceil(Math.max(document.documentElement.scrollHeight,"
                                   "document.body?document.body.scrollHeight:0))", await_promise=False) or H)
            cap = int(MAX_SIDE / scale)
            if content_h > cap:
                warn(f"Page plus haute que la limite de Chromium : capture tronquée à {cap} px (×{scale:g}).")
            clip["height"] = max(1, min(content_h, cap))
            beyond = True
            info(f"Hauteur du contenu : {clip['height']} px")

        out_w, out_h = round(clip["width"] * scale), round(clip["height"] * scale)
        if out_w > MAX_SIDE or out_h > MAX_SIDE or out_w * out_h > MAX_PIXELS:
            die(f"Image trop grande ({out_w}×{out_h} px). Réduis l'échelle ou la taille de la page.")

        params = {"format": fmt, "clip": clip, "captureBeyondViewport": beyond}
        if fmt in ("jpeg", "webp"):
            params["quality"] = quality
        info("Capture de l'image…")
        shot = cdp.call("Page.captureScreenshot", **params)
        data = base64.b64decode(shot["data"])
        if not data:
            die("Chromium n'a renvoyé aucune image.")

        out = unique_path(image_output_path(html_path, args, IMAGE_FORMATS[fmt]))
        out.write_bytes(data)
        good(f"Image enregistrée : {out} ({out_w}×{out_h} px, {human_size(len(data))})")
        return out
    finally:
        if cdp:
            cdp.close()
        if proc:
            stop_chrome(proc)
        shutil.rmtree(tmp, ignore_errors=True)
