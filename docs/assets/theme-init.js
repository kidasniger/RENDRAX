(function(){
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function applyTheme(){
    const dark = !!(media && media.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.themeMode = 'auto';
    const lightMeta = document.querySelector('meta[name="theme-color"][media*="light"]');
    const darkMeta = document.querySelector('meta[name="theme-color"][media*="dark"]');
    if (lightMeta) lightMeta.content = '#f3f6ff';
    if (darkMeta) darkMeta.content = '#080b18';
  }

  if (media) {
    if (media.addEventListener) media.addEventListener('change', applyTheme);
    else if (media.addListener) media.addListener(applyTheme);
  }
  applyTheme();
})();
