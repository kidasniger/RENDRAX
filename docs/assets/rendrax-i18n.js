(function () {
  'use strict';
  const dictionaries = {
    fr: {
      'hero.title':'Convertir HTML en MP4','hero.subtitle':'Passe de l’animation HTML au MP4 prêt à publier.','hero.choose':'Choisir mon fichier HTML →',
      'file.tab':'Choisir un fichier','paste.tab':'Coller du code','paste.submit':'Utiliser ce code',
      'settings.title':'Réglages','render.title':'Rendu','render.generate':'Générer MP4','render.test':'Rendu test de 10 s',
      'examples.title':'Exemples HTML complets','history.title':'Historique des vidéos',
      'service.online':'ATELIER DE RENDU · EN LIGNE','service.degraded':'ATELIER DE RENDU · Service dégradé','service.offline':'ATELIER DE RENDU · Service indisponible',
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
      'legal.privacy':'Confidentialité','legal.terms':'Conditions d’utilisation'
    },
    en: {
      'hero.title':'Convert HTML to MP4','hero.subtitle':'Turn your HTML animation into a publish-ready MP4.','hero.choose':'Choose my HTML file →',
      'file.tab':'Choose a file','paste.tab':'Paste code','paste.submit':'Use this code',
      'settings.title':'Settings','render.title':'Render','render.generate':'Generate MP4','render.test':'10-second test render',
      'examples.title':'Complete HTML examples','history.title':'Video history',
      'service.online':'RENDER WORKSPACE · ONLINE','service.degraded':'RENDER WORKSPACE · Degraded service','service.offline':'RENDER WORKSPACE · Service unavailable',
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
      'legal.privacy':'Privacy','legal.terms':'Terms of use'
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