"""Détection des profils de fichiers, correctifs HTML et extraction audio."""
import base64
import re

from h2m.scripts_js import GENERIC_AUDIO_CAPTURE


def _is_kidas(text):
    return (
        text.count("const [t,setT]=useState(0),") == 1
        and bool(re.search(r"[.#]stage\s*\{", text))
        and bool(re.search(r"\bAUD\s*=\s*'data:audio/", text))
        and bool(re.search(r"\bD\s*=\s*\d", text))
    )


def _is_editpro(text):
    return (
        "function render(t)" in text
        and text.count("(function loop(){let t=") == 1
        and "const IM=" in text
        and bool(re.search(r'"voice"\s*:\s*"[A-Za-z0-9+/=]{1000,}"', text))
    )


def _is_musicpro(text):
    # Canvas + render(t) piloté par ac.currentTime, voix base64 décodée par Web Audio
    # et musique synthétisée hors-ligne (OfflineAudioContext).
    return (
        "function render(t)" in text
        and bool(re.search(r"atob\(\s*VOICE\s*\)", text))
        and bool(re.search(r"function\s+music\s*\(", text))
        and bool(re.search(r"function\s+go\s*\(", text))
        and bool(re.search(r"\(function\s+lp\s*\(\)\s*\{", text))
        and bool(re.search(r"\bconst\s+D\s*=\s*\d", text))
        and bool(re.search(r"\bvP\s*=", text))
        and bool(re.search(r"\bmP\s*=", text))
    )


def _is_voicevideo(text):
    # Pages « vidéo React » : piste <audio> intégrée + API window.__video (seek/duration)
    # qui pilotent l'animation depuis l'horloge de l'audio.
    return (
        "window.__video" in text
        and bool(re.search(r"\bseek\s*\(", text))
        and bool(re.search(r"<audio\b[^>]*\ssrc=[\"']data:audio/", text, re.I))
        and bool(re.search(r"\bDUR\s*=", text))
    )


def _is_gsapvideo(text):
    # GSAP timelines synchronized to a base64 audio track. These must be rendered frame-by-frame.
    return (
        bool(re.search(r"<audio\b[^>]*\bsrc=[\"']data:audio/[a-z0-9.+-]+;base64,", text, re.I))
        # Les variantes peuvent déclarer les timings dans T=[...] ou une durée D=...
        # et appeler tl.time(t,false) ou tl.time(Math.min(t,D),false).
        and bool(re.search(r"\b(?:const\s+T\s*=\s*\[\s*\d|const\s+D\s*=\s*\d)", text))
        and bool(re.search(r"\bSUB\s*=", text))
        and bool(re.search(r"\btl\s*=\s*gsap\.timeline\(\s*\{\s*paused\s*:\s*true\s*\}\s*\)", text))
        and bool(re.search(r"\btl\.time\([^;]*?,\s*false\s*\)", text))
        and bool(re.search(r"\bstarted\s*\?\s*a\.currentTime", text))
        and bool(re.search(r"requestAnimationFrame\s*\(\s*lp\s*\)", text))
        and bool(re.search(r"[.#]st\s*\{[^}]*?width:\s*\d+px;\s*height:\s*\d+px", text))
    )


def _is_lottie(text):
    """Reconnaît les initialisations Lottie Web et dotLottie courantes."""
    aliases = {"lottie", "bodymovin"}
    module_import = re.compile(
        r"\bimport\s+([A-Za-z_$][\w$]*)\s+from\s*(['\"])[^'\"]*lottie-web[^'\"]*\2",
        re.I
    )
    for match in module_import.finditer(text):
        aliases.add(match.group(1))
    named_import = re.compile(
        r"\bimport\s*\{([^}]+)\}\s*from\s*(['\"])[^'\"]*lottie-web[^'\"]*\2",
        re.I
    )
    for match in named_import.finditer(text):
        for item in match.group(1).split(","):
            parts = re.split(r"\s+as\s+", item.strip(), flags=re.I)
            if parts and parts[0].strip().lower() in ("lottie", "bodymovin"):
                aliases.add(parts[-1].strip())

    lottie_web = any(
        re.search(r"\b" + re.escape(alias) + r"\s*\.\s*loadAnimation\s*\(", text, re.I)
        for alias in aliases if alias
    ) or bool(re.search(
        r"\bwindow\s*\.\s*(?:lottie|bodymovin)\s*\.\s*loadAnimation\s*\(", text, re.I
    ))

    constructors = {"DotLottie", "dotLottie"}
    dotlottie_import = re.compile(
        r"\bimport\s*\{([^}]+)\}\s*from\s*(['\"])[^'\"]*@lottiefiles/dotlottie[^'\"]*\2",
        re.I
    )
    for match in dotlottie_import.finditer(text):
        for item in match.group(1).split(","):
            parts = re.split(r"\s+as\s+", item.strip(), flags=re.I)
            if parts and parts[0].strip().lower() == "dotlottie":
                constructors.add(parts[-1].strip())
    dotlottie = any(
        re.search(r"\bnew\s+(?:(?:window\s*\.\s*)?)" + re.escape(name) + r"\s*\(", text)
        for name in constructors if name
    )
    return lottie_web or dotlottie


# Table des profils reconnus, testés dans l'ordre. Pour en ajouter un : écrire son test
# _is_xxx(text), l'inscrire ici, puis prévoir son correctif dans patch_html et son audio
# dans extract_audio / render.
PROFILES = (
    ("kidas", "KIDAS (React + audio intégré)", _is_kidas),
    ("editpro", "EditPro (canvas + voix intégrée)", _is_editpro),
    ("musicpro", "MusicPro (canvas + voix et musique Web Audio)", _is_musicpro),
    ("voicevideo", "Vidéo React (audio intégré + window.__video)", _is_voicevideo),
    ("gsapvideo", "Vidéo GSAP synchronisée sur la piste audio", _is_gsapvideo),
    ("lottie", "Animation Lottie / dotLottie", _is_lottie),
)
PRECISE_PROFILES = tuple(name for name, _, _ in PROFILES)


def detect_profile(text):
    """
    Vérifie le fichier avant tout rendu. Retourne (profil, libellé) ; le profil est le nom
    d'une entrée de PROFILES (rendu image par image synchronisé), ou :
      generic : autre page HTML (rendu universel en temps réel, synchro non garantie)
      invalid : ce n'est pas une page HTML exploitable
    """
    if len(text.strip()) < 20 or not re.search(r"<(?:!doctype|html|head|body|script|svg|canvas|div|style)\b", text, re.I):
        return "invalid", "Ce fichier ne ressemble pas à une page HTML."
    for name, label, matches in PROFILES:
        if matches(text):
            return name, label
    return "generic", "Page HTML générique (mode universel)"


LOTTIE_CAPTURE_SCRIPT = r"""<script>
(() => {
  window.__manual = true;
  const players = window.__h2mLottiePlayers = window.__h2mLottiePlayers || [];

  window.__h2mTrackLottie = player => {
    if (!player || (typeof player.goToAndStop !== 'function' && typeof player.setFrame !== 'function')) return player;
    if (!players.includes(player)) players.push(player);
    try { if (typeof player.pause === 'function') player.pause(); } catch (_) {}
    try { if (typeof player.setUseFrameInterpolation === 'function') player.setUseFrameInterpolation(false); } catch (_) {}
    return player;
  };

  window.__h2mCallLottieLoad = (api, ...args) => {
    const target = api && typeof api.loadAnimation === 'function' ? api :
      (api && api.default && typeof api.default.loadAnimation === 'function' ? api.default : null);
    if (!target) throw new Error('API Lottie introuvable.');
    return window.__h2mTrackLottie(target.loadAnimation.apply(target, args));
  };

  window.__h2mTrackLottieClass = Constructor => {
    if (typeof Constructor !== 'function') throw new Error('Constructeur dotLottie introuvable.');
    return new Proxy(Constructor, {
      construct(target, args, newTarget) {
        const player = Reflect.construct(target, args, newTarget);
        return window.__h2mTrackLottie(player);
      }
    });
  };

  window.__h2mLottieList = () => {
    const result = players.slice();
    for (const api of [window.lottie, window.bodymovin]) {
      try {
        if (api && typeof api.getRegisteredAnimations === 'function') {
          for (const player of api.getRegisteredAnimations()) {
            if (player && !result.includes(player)) result.push(player);
          }
        }
      } catch (_) {}
    }
    return result;
  };

  const readNumber = (object, key) => {
    try {
      if (!object) return NaN;
      const value = object[key];
      return Number(typeof value === 'function' ? value.call(object) : value);
    } catch (_) { return NaN; }
  };

  window.__h2mLottiePlayerDuration = player => {
    let seconds = NaN;
    try {
      if (typeof player.getDuration === 'function') seconds = Number(player.getDuration(false));
    } catch (_) {}
    if (!(Number.isFinite(seconds) && seconds > 0)) {
      seconds = readNumber(player, 'duration');
    }
    if (!(Number.isFinite(seconds) && seconds > 0)) {
      const frames = readNumber(player, 'totalFrames') ||
        Number(player.animationData && player.animationData.op);
      const rate = readNumber(player, 'frameRate') ||
        Number(player.animationData && (player.animationData.fr || player.animationData.frameRate));
      if (frames > 0 && rate > 0) seconds = frames / rate;
    }
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  };

  window.__h2mLottieDuration = () => {
    const durations = window.__h2mLottieList().map(window.__h2mLottiePlayerDuration);
    return durations.length ? Math.max(...durations) : 0;
  };

  window.__h2mLottieReady = () => {
    const list = window.__h2mLottieList();
    return list.length > 0 && list.every(player => {
      if (!(window.__h2mLottiePlayerDuration(player) > 0)) return false;
      if (typeof player.goToAndStop !== 'function' && typeof player.setFrame !== 'function') return false;
      const loaded = typeof player.isLoaded === 'function' ? player.isLoaded() : player.isLoaded;
      const ready = typeof player.isReady === 'function' ? player.isReady() : player.isReady;
      if (typeof loaded === 'boolean' && !loaded) return false;
      if (typeof ready === 'boolean' && !ready) return false;
      const element = player.wrapper || player.container || player.canvas ||
        (player.renderer && player.renderer.svgElement && player.renderer.svgElement.parentElement) ||
        (player.renderer && player.renderer.canvasContext && player.renderer.canvasContext.canvas) ||
        document.querySelector('canvas, .lottie, [data-animation-path], svg');
      if (!element || typeof element.getBoundingClientRect !== 'function') return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  };

  window.__h2mLottieStage = () => {
    const list = window.__h2mLottieList();
    const candidates = [];
    for (const player of list) {
      candidates.push(
        player.wrapper,
        player.container,
        player.canvas,
        player.renderer && player.renderer.svgElement && player.renderer.svgElement.parentElement,
        player.renderer && player.renderer.canvasContext && player.renderer.canvasContext.canvas
      );
    }
    candidates.push(document.querySelector('.stage, #stage, #st, .lottie, [data-animation-path], canvas, svg'));
    for (const element of candidates) {
      if (!element || typeof element.getBoundingClientRect !== 'function') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return [rect.x, rect.y, rect.width, rect.height];
    }
    return null;
  };
})();
</script>"""


def patch_html(text):
    """
    Rend le rendu déterministe selon le profil détecté. Retourne (texte, profil) ;
    profil vaut "" si aucun mode image par image n'est possible.
    """
    profile, _ = detect_profile(text)
    if profile == "kidas":
        # setT devient inactif en mode manuel : la boucle audio de la page ne l'écrase plus.
        a = "const [t,setT]=useState(0),"
        text = text.replace(a, "const [t,__s]=useState(0),setT=v=>{window.__manual||__s(v)},__hk=(window.__setT=__s),", 1)
        return text, "kidas"
    if profile == "editpro":
        a = "(function loop(){let t="
        text = text.replace(a, "(function loop(){if(window.__manual)return;let t=", 1)
        return text, "editpro"
    if profile == "voicevideo":
        # La boucle de la page ne doit plus relire l'horloge de l'audio, et l'audio ne doit pas démarrer seul.
        text = text.replace("const loop = () => { if (!au.paused)", "const loop = () => { if (!window.__manual && !au.paused)", 1)
        text = text.replace("function go() { if (!au.paused) return;", "function go() { if (window.__manual || !au.paused) return;", 1)
        return text, "voicevideo"
    if profile == "musicpro":
        # Le mode manuel est activé avant tout script : la page ne lance ni son horloge audio
        # (go) ni sa boucle temps réel (lp), et render(t) est appelé image par image.
        text = re.sub(r"function\s+go\s*\(\)\s*\{", lambda m: m.group(0) + "if(window.__manual)return;", text, count=1)
        text = re.sub(r"\(function\s+lp\s*\(\)\s*\{", lambda m: m.group(0) + "if(window.__manual)return;", text, count=1)
        manual = "<script>window.__manual=true</script>"
        m = re.search(r"<head\b[^>]*>", text, flags=re.I)
        text = text[:m.end()] + manual + text[m.end():] if m else manual + text
        return text, "musicpro"
    if profile == "gsapvideo":
        # Stop the audio-driven real-time loop and let the renderer seek the GSAP timeline directly.
        text = re.sub(r"\(function\s+lp\s*\(\)\s*\{", lambda m: m.group(0) + "if(window.__manual)return;", text, count=1)
        manual = "<script>window.__manual=true</script>"
        m = re.search(r"<head\b[^>]*>", text, flags=re.I)
        text = text[:m.end()] + manual + text[m.end():] if m else manual + text
        return text, "gsapvideo"
    if profile == "lottie":
        # Enregistre les instances Lottie pour les arrêter et les piloter par temps virtuel.
        api_names = {"lottie", "bodymovin", "Lottie", "Bodymovin"}
        for match in re.finditer(
            r"\bimport\s+([A-Za-z_$][\w$]*)\s+from\s*(['\"])[^'\"]*lottie-web[^'\"]*\2",
            text, re.I
        ):
            api_names.add(match.group(1))
        for match in re.finditer(
            r"\bimport\s*\{([^}]+)\}\s*from\s*(['\"])[^'\"]*lottie-web[^'\"]*\2",
            text, re.I
        ):
            for entry in match.group(1).split(","):
                parts = re.split(r"\s+as\s+", entry.strip(), flags=re.I)
                if parts and parts[0].strip().lower() in ("lottie", "bodymovin"):
                    api_names.add(parts[-1].strip())
        for api_name in sorted(api_names, key=len, reverse=True):
            text = re.sub(
                r"\b((?:window\s*\.\s*)?)" + re.escape(api_name) + r"\s*\.\s*loadAnimation\s*\(",
                lambda m, name=api_name: "window.__h2mCallLottieLoad(" + m.group(1) + name + ", ",
                text
            )
        constructors = {"DotLottie", "dotLottie"}
        for match in re.finditer(
            r"\bimport\s*\{([^}]+)\}\s*from\s*(['\"])[^'\"]*dotlottie[^'\"]*\2",
            text, re.I
        ):
            for entry in match.group(1).split(","):
                parts = re.split(r"\s+as\s+", entry.strip(), flags=re.I)
                if parts and parts[0].strip().lower() == "dotlottie":
                    constructors.add(parts[-1].strip())
        for constructor in sorted(constructors, key=len, reverse=True):
            text = re.sub(
                r"\bnew\s+((?:window\s*\.\s*)?)" + re.escape(constructor) + r"\s*\(",
                lambda m, name=constructor: "new (window.__h2mTrackLottieClass(" + m.group(1) + name + "))(",
                text
            )
        manual = LOTTIE_CAPTURE_SCRIPT
        m = re.search(r"<head\b[^>]*>", text, flags=re.I)
        text = text[:m.end()] + manual + text[m.end():] if m else manual + text
        return text, "lottie"
    return text, ""


def editpro_duration(text):
    m = re.search(r"if\(t>=(\d+(?:\.\d+)?)\)\{t=", text)
    return float(m.group(1)) if m else 60.0


MIME_EXT = {"mpeg": "mp3", "mp3": "mp3", "wav": "wav", "x-wav": "wav", "ogg": "ogg", "mp4": "m4a", "aac": "aac", "webm": "webm"}


def extract_audio(text, tmp, profile="kidas"):
    """Retourne {'voice': Path|None, 'music': Path|None, 'music_volume': float}."""
    out = {"voice": None, "music": None, "music_volume": 0.2}
    if profile == "musicpro":
        return out  # pistes décodées par le navigateur : voir window.__wavOf
    if profile == "editpro":
        m = re.search(r'"voice"\s*:\s*"([A-Za-z0-9+/=]+)"', text)
        if m:
            p = tmp / "voice.mp3"
            p.write_bytes(base64.b64decode(m.group(1)))
            out["voice"] = p
        return out
    if profile in ("voicevideo", "gsapvideo", "lottie"):
        tags = re.findall(r"<audio\b[^>]*\ssrc=[\"']data:audio/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)[\"']", text, re.I)
        for key, (mime, b64) in zip(("voice", "music"), tags):
            p = tmp / f"{key}.{MIME_EXT.get(mime.lower(), 'mp3')}"
            p.write_bytes(base64.b64decode(b64))
            out[key] = p
        return out
    for key, var in (("voice", "AUD"), ("music", "MUS")):
        m = re.search(var + r"='data:audio/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)'", text)
        if not m:
            continue
        ext = MIME_EXT.get(m.group(1), "mp3")
        p = tmp / f"{key}.{ext}"
        p.write_bytes(base64.b64decode(m.group(2)))
        out[key] = p
    v = re.search(r"\.current\.volume\s*=\s*(\d*\.?\d+)", text)
    if v:
        out["music_volume"] = min(1.0, float(v.group(1)))
    return out


def detect_stage_size(text):
    m = re.search(r"[.#](?:stage|st)\s*\{[^}]*?width:\s*(\d+)px;\s*height:\s*(\d+)px", text)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"\bW\s*=\s*(\d{3,4})\s*,\s*H\s*=\s*(\d{3,4})\b", text)  # const W = 1080, H = 1920
    return (int(m.group(1)), int(m.group(2))) if m else (1080, 1920)


def inject_base_url(text, base_url):
    """Conserve les chemins relatifs des images, scripts et médias du HTML original."""
    if re.search(r"<base\b", text, flags=re.I):
        return text
    tag = f'<base href="{base_url}">'
    m = re.search(r"<head\b[^>]*>", text, flags=re.I)
    if m:
        return text[:m.end()] + tag + text[m.end():]
    return tag + text


def inject_generic_audio_capture(text):
    """Installe l'enregistrement Web Audio avant les scripts de la page."""
    if re.search(r"__h2mCaptureInstalled", text):
        return text
    m = re.search(r"<head\b[^>]*>", text, flags=re.I)
    if m:
        return text[:m.end()] + GENERIC_AUDIO_CAPTURE + text[m.end():]
    return GENERIC_AUDIO_CAPTURE + text


def detect_lottie_stage_size(text):
    """Détecte la taille des conteneurs Lottie usuels sans changer les autres profils."""
    for rule in re.finditer(r"([^{}]+)\{([^{}]*)\}", text):
        selectors, declarations = rule.group(1), rule.group(2)
        if not re.search(
            r"(?:^|[\s>+~,])(?:[.#](?:lottie[a-z_-]*|animation[a-z_-]*|anim[a-z_-]*container)|\[data-animation-path\])(?=$|[\s,:>+~])",
            selectors, re.I
        ):
            continue
        width = re.search(r"\bwidth\s*:\s*(\d+)px", declarations, re.I)
        height = re.search(r"\bheight\s*:\s*(\d+)px", declarations, re.I)
        if width and height:
            return int(width.group(1)), int(height.group(1))

    for tag in re.finditer(r"<(?:div|section|canvas)\b[^>]*>", text, re.I):
        markup = tag.group(0)
        if not re.search(r"\b(?:class|id)\s*=\s*['\"][^'\"]*(?:lottie|animation)[^'\"]*['\"]", markup, re.I) and not re.search(r"\bdata-animation-path\b", markup, re.I):
            continue
        inline = re.search(r"\bstyle\s*=\s*(['\"])(.*?)\1", markup, re.I)
        if inline:
            width = re.search(r"\bwidth\s*:\s*(\d+)px", inline.group(2), re.I)
            height = re.search(r"\bheight\s*:\s*(\d+)px", inline.group(2), re.I)
            if width and height:
                return int(width.group(1)), int(height.group(1))
        if tag.group(0).lower().startswith("<canvas"):
            width = re.search(r"\bwidth\s*=\s*['\"]?(\d+)", markup, re.I)
            height = re.search(r"\bheight\s*=\s*['\"]?(\d+)", markup, re.I)
            if width and height:
                return int(width.group(1)), int(height.group(1))
    return detect_stage_size(text)


def choose_frame_size(text, fmt, profile=""):
    sizes = {"portrait": (1080, 1920), "landscape": (1920, 1080), "square": (1080, 1080)}
    if fmt in sizes:
        return sizes[fmt]
    if profile == "lottie":
        return detect_lottie_stage_size(text)
    return detect_stage_size(text)
