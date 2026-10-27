// Progressive enhancement for the RENDRAX hero illustration; no third-party runtime.
(function () {
  const mount = document.getElementById("rdx-react-visual");
  if (!mount) return;

  const make = (tag, className, text, parent) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  };

  const scene = make("div", "rdx-motion-scene");
  scene.setAttribute("aria-hidden", "true");
  scene.dataset.phase = "0";

  const code = make("div", "rdx-code-card", null, scene);
  const bar = make("div", "rdx-windowbar", null, code);
  make("i", "", null, bar);
  make("i", "", null, bar);
  make("i", "", null, bar);
  make("b", "", "animation.html", bar);

  const lines = make("div", "rdx-code-lines", null, code);
  const row1 = make("div", "rdx-code-row", null, lines);
  make("span", "rdx-line-num", "01", row1);
  make("span", "rdx-code-token", "const", row1);
  make("span", "", "scene", row1);
  make("span", "rdx-code-punct", "=", row1);

  const row2 = make("div", "rdx-code-row", null, lines);
  make("span", "rdx-line-num", "02", row2);
  make("span", "rdx-code-token", "animate", row2);
  make("span", "rdx-code-punct", "(", row2);
  make("span", "rdx-code-string", '"motion"', row2);
  make("span", "rdx-code-punct", ")", row2);

  const row3 = make("div", "rdx-code-row", null, lines);
  make("span", "rdx-line-num", "03", row3);
  make("span", "rdx-code-string", "render(frame)", row3);

  const row4 = make("div", "rdx-code-row", null, lines);
  make("span", "rdx-line-num", "04", row4);
  make("span", "rdx-code-punct", "→", row4);
  make("span", "rdx-code-token", "MP4", row4);

  const progress = make("div", "rdx-code-progress", null, code);
  make("span", "", null, progress);

  make("div", "rdx-convert-badge", "→", scene);

  const video = make("div", "rdx-video-card", null, scene);
  const frame = make("div", "rdx-film-frame", null, video);
  make("div", "rdx-film-sun", null, frame);
  make("div", "rdx-film-hill", null, frame);
  make("div", "rdx-film-hill alt", null, frame);
  make("div", "rdx-play", "▶", frame);
  const caption = make("div", "rdx-video-caption", null, video);
  make("span", "", "RENDRAX.mp4", caption);
  make("span", "", "00:12", caption);

  const secure = make("div", "rdx-float-pill rdx-pill-secure", null, scene);
  make("span", "rdx-live-dot", null, secure);
  secure.appendChild(document.createTextNode("Rendu sécurisé"));

  const quality = make("div", "rdx-float-pill rdx-pill-quality", null, scene);
  make("span", "", "✳", quality);
  make("span", "", "Image par image", quality);

  mount.appendChild(scene);
  document.documentElement.classList.add("rdx-motion-ready");

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let phase = 0;
  window.setInterval(() => {
    phase = (phase + 1) % 4;
    scene.dataset.phase = String(phase);
  }, 2200);
})();
