(function () {
  'use strict';
  const dictionaries = {
    fr: {
      'hero.title':'Convertir HTML en MP4','hero.subtitle':'Passe de l’animation HTML au MP4 prêt à publier.','hero.choose':'Choisir mon fichier HTML →',
      'file.tab':'Choisir un fichier','paste.tab':'Coller du code','paste.submit':'Utiliser ce code',
      'settings.title':'Réglages','render.title':'Rendu','render.generate':'Générer MP4','render.test':'Rendu test de 10 s',
      'examples.title':'Exemples HTML complets','history.title':'Historique des vidéos',
      'service.online':'ATELIER DE RENDU · EN LIGNE','service.degraded':'ATELIER DE RENDU · Service dégradé','service.offline':'ATELIER DE RENDU · Service indisponible',
      'error.cancelled':'Rendu annulé.','error.network':'Connexion interrompue. Vérifie le réseau puis réessaie.',
      'error.timeout':'Le délai de réponse est dépassé. Le serveur ou le transfert a probablement été interrompu.',
      'error.fileSize':'Fichier trop volumineux (limite : 50 Mo). Réduis les ressources intégrées ou utilise un ZIP optimisé.',
      'error.rateLimit':'Trop de demandes ont été envoyées. Attends quelques instants avant de réessayer.',
      'error.gateway':'La passerelle a reçu une réponse invalide du service de rendu. Le service est peut-être temporairement indisponible.',
      'error.unavailable':'Le service de rendu est momentanément indisponible ou en maintenance.',
      'error.security':'La vérification de sécurité a échoué. Recharge la page puis relance la vérification.',
      'file.title':'Choisir un fichier',
      'faq.title':'Questions fréquentes',
      'faq.formats.q':'Quels formats puis-je importer ?',
      'faq.formats.a':'Un fichier HTML, HTM ou une archive ZIP contenant ta page et ses ressources. La taille du fichier importé est limitée à 50 Mo.',
      'faq.audio.q':'Le son est-il conservé ?',
      'faq.audio.a':'Oui, si la piste audio est accessible et lisible pendant le rendu. Vérifie les chemins des fichiers audio et teste d’abord un rendu de 10 secondes.',
      'faq.duration.q':'Quelle durée puis-je produire ?',
      'faq.duration.a':'Tu peux choisir Automatique ou une limite allant jusqu’à 5 minutes dans les réglages avancés. Le mode Aperçu est limité à 10 secondes.',
      'faq.external.q':'Les ressources externes sont-elles acceptées ?',
      'faq.external.a':'Les polices, scripts, images et bibliothèques distants peuvent nécessiter une connexion et autoriser leur chargement depuis l’environnement de rendu. Intègre les ressources essentielles dans ton projet lorsque c’est possible.',
      'faq.retention.q':'Combien de temps mes fichiers sont-ils conservés ?',
      'faq.retention.a':'Les vidéos générées sont disponibles pendant 30 jours au maximum. Tu peux les supprimer depuis le résultat ou l’historique. Les fichiers sources temporaires sont nettoyés séparément.',
      'guide.compatLink':'Préparer mon HTML avant le rendu →','guide.link':'Lire le guide pour préparer ton HTML →',
      'footer.privacy':'Confidentialité','footer.terms':'Conditions','footer.status':'État du service','footer.contact':'Contact',
      'feedback.button':'Signaler un problème',
      'guide.title':'Préparer son HTML','guide.intro':'Quelques vérifications pour obtenir un rendu fidèle.',
      'guide.download':'Télécharger un exemple HTML complet','guide.checklist':'Checklist avant import',
      'legal.privacy':'Confidentialité','legal.terms':'Conditions d’utilisation',
      'guide.s1':'1. Structure de la page','guide.s2':'2. Durée et animation','guide.s3':'3. Audio','guide.s4':'4. GSAP, Canvas et ressources distantes',
      'guide.s1a':'Utilise une page HTML complète avec ses styles et scripts correctement chargés.',
      'guide.s1b':'Place les éléments à animer dans le document dès le départ et évite les dépendances à des interactions manuelles.',
      'guide.s1c':'Définis explicitement la taille de la scène et vérifie le cadrage dans l’aperçu RENDRAX.',
      'guide.s1d':'Pour un projet avec plusieurs fichiers, regroupe la page principale et ses ressources dans un ZIP. Sélectionne le HTML principal si plusieurs pages sont présentes.',
      'guide.s2a':'Choisis une durée maîtrisée et teste d’abord le mode Aperçu de 10 secondes.',
      'guide.s2b':'Évite les animations qui dépendent uniquement du temps réel, d’une interaction ou d’un événement aléatoire.',
      'guide.s2c':'Pour GSAP, vérifie que les timelines démarrent correctement et que tous les éléments sont initialisés avant leur animation.',
      'guide.s2d':'Pour Canvas, assure-toi que le dessin est effectivement mis à jour pendant toute la séquence et que les dimensions du canvas correspondent au cadrage attendu.',
      'guide.s3a':'Utilise des formats audio lisibles par Chromium et vérifie que les fichiers référencés sont présents.',
      'guide.s3b':'Les ressources audio externes peuvent dépendre du réseau, des autorisations CORS et de la disponibilité du serveur distant.',
      'guide.s3c':'Vérifie le démarrage, la durée et la synchronisation de la piste ; ajuste le décalage audio dans les réglages si nécessaire.',
      'guide.s4a':'Les exemples existants du dépôt montrent notamment des pages avec GSAP, React, Canvas et audio intégré.',
      'guide.s4b':'Les images, polices, scripts et bibliothèques chargés depuis un autre domaine peuvent échouer si le serveur distant bloque leur accès.',
      'guide.s4c':'Quand c’est possible, intègre les ressources indispensables dans ton ZIP pour limiter les dépendances réseau.',
      'guide.s4d':'Le rendu s’effectue dans un environnement Chromium : teste les API et effets spécifiques au navigateur avant de lancer un rendu long.',
      'guide.check1':'La page s’ouvre sans erreur dans Chromium.','guide.check2':'Les polices, images, scripts et fichiers audio sont accessibles.',
      'guide.check3':'La scène respecte le format portrait, paysage ou carré choisi.','guide.check4':'La durée de l’animation est connue et le mode test a été vérifié.',
      'guide.check5':'Le ZIP contient le bon fichier HTML principal et toutes les ressources utiles.','guide.check6':'Le fichier importé ne dépasse pas 50 Mo.',
      'guide.note':'Il s’agit d’un exemple réel déjà présent dans le dépôt RENDRAX, pas d’un modèle fictif.',
      'legal.p1':'Cette page décrit les informations utiles au fonctionnement de RENDRAX. Elle ne remplace pas un avis juridique et doit être complétée si l’exploitant publie des coordonnées ou des obligations locales spécifiques.',
      'legal.source1':'Les fichiers HTML et ZIP sont transférés vers un stockage objet privé afin de permettre le rendu.',
      'legal.source2':'Les fichiers sources temporaires sont soumis à un nettoyage automatique distinct ; le mécanisme de nettoyage des imports anciens cible les fichiers de plus de deux heures.',
      'legal.source3':'Les vidéos générées et leurs métadonnées sont prévues pour expirer au bout de 30 jours. Tu peux aussi demander leur suppression depuis le résultat ou l’historique.',
      'legal.source4':'La suppression d’une vidéo retire également les ressources associées connues du service, dont la miniature et le fichier source lié.',
      'legal.tech':'Le service traite les paramètres nécessaires au rendu, les identifiants de tâche et des informations techniques de fonctionnement. Le bouton « Signaler un problème » prépare un rapport contenant l’identifiant de tâche disponible, le navigateur et la qualité choisie. Il n’ajoute pas ton fichier HTML, ton ZIP ni son contenu.',
      'legal.external':'Le fonctionnement peut faire appel à l’hébergement Vercel, au stockage Backblaze, à la vérification anti-robot Cloudflare et aux ressources externes référencées par ton HTML. Ces services appliquent leurs propres conditions et politiques de confidentialité.',
      'legal.rights':'Tu dois disposer des droits nécessaires sur les pages HTML, scripts, images, polices, musiques et autres ressources que tu importes.',
      'legal.responsible':'Tu restes responsable du contenu que tu fournis et des usages de la vidéo générée.',
      'legal.sensitive':'N’importe pas de données personnelles ou confidentielles dont le traitement par les services techniques utilisés n’est pas autorisé.',
      'legal.compat':'Le rendu dépend de la compatibilité du contenu avec Chromium, de la disponibilité des ressources distantes et de l’état des services tiers. Un résultat identique à tous les navigateurs ou à toutes les exécutions ne peut pas être garanti.',
      'legal.expiry':'Les vidéos peuvent expirer après 30 jours ou être supprimées plus tôt par leur propriétaire.',
      'legal.service':'Le service peut évoluer, être temporairement indisponible ou limiter certaines opérations pour protéger son infrastructure.',
      'legal.accept':'En utilisant RENDRAX, tu acceptes ces règles d’utilisation. Les présentes informations sont générales ; elles ne prétendent pas définir une juridiction ou des mentions légales d’entreprise qui n’ont pas été fournies.'
    },
    en: {
      'hero.title':'Convert HTML to MP4','hero.subtitle':'Turn your HTML animation into a publish-ready MP4.','hero.choose':'Choose my HTML file →',
      'file.tab':'Choose a file','paste.tab':'Paste code','paste.submit':'Use this code',
      'settings.title':'Settings','render.title':'Render','render.generate':'Generate MP4','render.test':'10-second test render',
      'examples.title':'Complete HTML examples','history.title':'Video history',
      'service.online':'RENDER WORKSPACE · ONLINE','service.degraded':'RENDER WORKSPACE · Degraded service','service.offline':'RENDER WORKSPACE · Service unavailable',
      'error.cancelled':'Render cancelled.','error.network':'Connection interrupted. Check your network and try again.',
      'error.timeout':'The response timed out. The server or transfer may have been interrupted.',
      'error.fileSize':'File too large (50 MB limit). Reduce embedded resources or use an optimized ZIP.',
      'error.rateLimit':'Too many requests. Wait a moment before trying again.',
      'error.gateway':'The rendering service returned an invalid gateway response. It may be temporarily unavailable.',
      'error.unavailable':'The rendering service is temporarily unavailable or under maintenance.',
      'error.security':'Security verification failed. Reload the page and try verification again.',
      'file.title':'Choose a file',
      'faq.title':'Frequently asked questions',
      'faq.formats.q':'Which formats can I import?',
      'faq.formats.a':'An HTML or HTM file, or a ZIP archive containing your page and its resources. Imported files are limited to 50 MB.',
      'faq.audio.q':'Will the audio be preserved?',
      'faq.audio.a':'Yes, when the audio track is accessible and playable during rendering. Check audio file paths and run a 10-second test first.',
      'faq.duration.q':'How long can my video be?',
      'faq.duration.a':'Choose Automatic or set a limit of up to 5 minutes in advanced settings. Preview mode is limited to 10 seconds.',
      'faq.external.q':'Can I use external resources?',
      'faq.external.a':'Remote fonts, scripts, images and libraries may require an internet connection and permission to load in the rendering environment. Bundle essential resources when possible.',
      'faq.retention.q':'How long are my files kept?',
      'faq.retention.a':'Generated videos are available for up to 30 days. You can delete them from the result view or history. Temporary source files are cleaned up separately.',
      'guide.compatLink':'Prepare my HTML before rendering →','guide.link':'Read the HTML preparation guide →',
      'footer.privacy':'Privacy','footer.terms':'Terms','footer.status':'Service status','footer.contact':'Contact',
      'feedback.button':'Report a problem',
      'guide.title':'Prepare your HTML','guide.intro':'A few checks to get a reliable render.',
      'guide.download':'Download a complete HTML example','guide.checklist':'Pre-upload checklist',
      'legal.privacy':'Privacy','legal.terms':'Terms of use',
      'guide.s1':'1. Page structure','guide.s2':'2. Timing and animation','guide.s3':'3. Audio','guide.s4':'4. GSAP, Canvas and remote resources',
      'guide.s1a':'Use a complete HTML page with its stylesheets and scripts loading correctly.',
      'guide.s1b':'Put animated elements in the document from the start and avoid relying on manual interactions.',
      'guide.s1c':'Set the scene dimensions explicitly and check the framing in the RENDRAX preview.',
      'guide.s1d':'For multi-file projects, package the main page and its resources in a ZIP. Select the main HTML file when several pages are included.',
      'guide.s2a':'Choose a controlled duration and start with the 10-second Preview mode.',
      'guide.s2b':'Avoid animations that rely only on real time, user interaction or random events.',
      'guide.s2c':'For GSAP, check that timelines start correctly and all elements are initialized before animation begins.',
      'guide.s2d':'For Canvas, make sure drawing updates throughout the sequence and the canvas dimensions match the expected framing.',
      'guide.s3a':'Use audio formats readable by Chromium and make sure referenced files are present.',
      'guide.s3b':'External audio resources may depend on network access, CORS permissions and remote server availability.',
      'guide.s3c':'Check playback start, duration and synchronization; adjust the audio offset in settings if needed.',
      'guide.s4a':'Existing repository examples include pages using GSAP, React, Canvas and embedded audio.',
      'guide.s4b':'Images, fonts, scripts and libraries loaded from another domain may fail if the remote server blocks access.',
      'guide.s4c':'When possible, include essential resources in your ZIP to reduce network dependencies.',
      'guide.s4d':'Rendering runs in a Chromium environment: test browser-specific APIs and effects before starting a long render.',
      'guide.check1':'The page opens without errors in Chromium.','guide.check2':'Fonts, images, scripts and audio files are accessible.',
      'guide.check3':'The scene matches the selected portrait, landscape or square format.','guide.check4':'The animation duration is known and test mode has been checked.',
      'guide.check5':'The ZIP contains the correct main HTML file and all required resources.','guide.check6':'The imported file is no larger than 50 MB.',
      'guide.note':'This is a real example already in the RENDRAX repository, not a fabricated template.',
      'legal.p1':'This page describes information relevant to RENDRAX. It is not legal advice and should be supplemented if the operator publishes contact details or specific local legal obligations.',
      'legal.source1':'HTML and ZIP files are transferred to private object storage so they can be rendered.',
      'legal.source2':'Temporary source files have a separate automatic cleanup process; the stale-upload cleanup targets files older than two hours.',
      'legal.source3':'Generated videos and their metadata are scheduled to expire after 30 days. You can also delete them from the result view or history.',
      'legal.source4':'Deleting a video also removes associated resources known to the service, including its thumbnail and linked source file.',
      'legal.tech':'The service processes render settings, task identifiers and technical operating information. The “Report a problem” link prepares a report with the available task ID, browser and selected quality. It does not attach your HTML file, ZIP archive or its contents.',
      'legal.external':'The service may use Vercel hosting, Backblaze storage, Cloudflare bot verification and external resources referenced by your HTML. These providers apply their own terms and privacy policies.',
      'legal.rights':'You must have the necessary rights to the HTML pages, scripts, images, fonts, music and other resources you upload.',
      'legal.responsible':'You remain responsible for the content you provide and how you use the generated video.',
      'legal.sensitive':'Do not upload personal or confidential data unless its processing by the technical services used is authorized.',
      'legal.compat':'Rendering depends on Chromium compatibility, remote resource availability and third-party service status. Identical results across browsers or runs cannot be guaranteed.',
      'legal.expiry':'Videos may expire after 30 days or be deleted earlier by their owner.',
      'legal.service':'The service may change, become temporarily unavailable or limit operations to protect its infrastructure.',
      'legal.accept':'By using RENDRAX, you agree to these usage rules. This information is general and does not claim to define a jurisdiction or company legal details that have not been provided.'
    }
  };
  let language = 'fr';
  function safeGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  function apply(root) {
    const dictionary = dictionaries[language] || dictionaries.fr;
    (root || document).querySelectorAll('[data-i18n]').forEach(node => {
      const value = dictionary[node.getAttribute('data-i18n')];
      if (typeof value === 'string') node.textContent = value;
    });
    (root || document).querySelectorAll('[data-i18n-placeholder]').forEach(node => {
      const value = dictionary[node.getAttribute('data-i18n-placeholder')];
      if (typeof value === 'string') node.setAttribute('placeholder', value);
    });
    const toggle = document.getElementById('rdxLanguageToggle');
    if (toggle) {
      toggle.textContent = language === 'fr' ? 'EN' : 'FR';
      toggle.setAttribute('aria-label', language === 'fr' ? 'Switch to English' : 'Passer en français');
      toggle.setAttribute('aria-pressed', String(language === 'en'));
    }
    document.documentElement.lang = language;
  }
  function setLanguage(next) {
    language = next === 'en' ? 'en' : 'fr';
    safeSet('rendrax_language', language);
    apply(document);
    window.dispatchEvent(new CustomEvent('rendrax:languagechange', { detail: { language } }));
  }
  window.rdxT = function (key, fallback) {
    const dictionary = dictionaries[language] || dictionaries.fr;
    return dictionary[key] || fallback || key;
  };
  window.rdxSetLanguage = setLanguage;
  window.rdxGetLanguage = () => language;
  const saved = safeGet('rendrax_language');
  const requested = new URLSearchParams(location.search).get('lang');
  const browserLanguage = String(navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'fr';
  language = requested === 'en' || requested === 'fr' ? requested : (saved === 'en' || saved === 'fr' ? saved : browserLanguage);
  apply(document);
  document.addEventListener('click', event => {
    const button = event.target.closest('#rdxLanguageToggle');
    if (button) setLanguage(language === 'fr' ? 'en' : 'fr');
  });
  if ('MutationObserver' in window) {
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) {
        if (node.matches && node.matches('[data-i18n], [data-i18n-placeholder]')) apply(node.parentNode || document);
        else if (node.querySelector && node.querySelector('[data-i18n], [data-i18n-placeholder]')) apply(node);
      }
    })));
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();