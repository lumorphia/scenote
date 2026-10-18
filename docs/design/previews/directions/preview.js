/* 比較用の静的な試作。投稿情報と地図のピンは仮データ。 */
(() => {
  const design = document.body.dataset.design;
  const page = document.body.dataset.page;
  const names = { a: "旅の手帳", b: "冒険の野帳", c: "日常の写真帳" };
  const photos = [
    {
      id: 1,
      title: "花の色をした午後",
      place: "イル・メグ",
      date: "2026.10.12",
      tag: "旅",
      text: "用事を忘れて、しばらく空を見上げていた。",
    },
    {
      id: 2,
      title: "小さな家を見つけた",
      place: "イル・メグ",
      date: "2026.10.12",
      tag: "旅",
      text: "道を外れて歩いていたら、花の中に小さな明かり。",
    },
    {
      id: 3,
      title: "今日はどこまで行こう",
      place: "撮影場所未登録",
      date: "2026.10.10",
      tag: "旅",
      text: "空と海の境目まで、ふたりで。",
    },
    {
      id: 4,
      title: "帰り道にもう一枚",
      place: "撮影場所未登録",
      date: "2026.10.08",
      tag: "日常",
      text: "いつもの道も、今日は少し違って見えた。",
    },
    {
      id: 5,
      title: "みんなで海へ",
      place: "撮影場所未登録",
      date: "2026.10.06",
      tag: "旅",
      text: "待ち合わせには、ちょっと遅れた。",
    },
    {
      id: 6,
      title: "雨がやむのを待って",
      place: "撮影場所未登録",
      date: "2026.10.04",
      tag: "日常",
      text: "急ぐ理由もなかったので、ここでひと休み。",
    },
    {
      id: 7,
      title: "今夜は寄り道",
      place: "撮影場所未登録",
      date: "2026.10.02",
      tag: "日常",
      text: "いつもより少しだけ、長い夜。",
    },
    {
      id: 8,
      title: "同じポーズで",
      place: "撮影場所未登録",
      date: "2026.09.28",
      tag: "日常",
      text: "きれいに揃うまで、何度も撮り直した。",
    },
  ];
  const params = new URLSearchParams(location.search);
  const initialId = Number(params.get("photo"));
  const photo = photos.find((p) => p.id === initialId) || photos[0];
  const home = `${design}-home.html`;
  const post = (id = 1) => `${design}-post.html?photo=${id}`;
  const photoImg = (p, cls = "", lazy = true) =>
    `<img class="${cls}" src="assets/photo-${p.id}.webp" alt="${p.title}" width="1600" height="900" ${lazy ? 'loading="lazy"' : ""}>`;
  const arrow = '<span aria-hidden="true">↗</span>';
  const card = (p) =>
    `<article class="photo-card" data-place="${p.place}" data-tag="${p.tag}"><a class="photo-link" href="${post(p.id)}">${photoImg(p)}<div class="caption"><div class="card-meta"><span>${p.place}</span><time>${p.date}</time></div><h3>${p.title}</h3>${design === "c" ? `<p>${p.text}</p>` : ""}<span class="byline">冒険者の記録</span></div></a></article>`;
  const previewBar = `<aside class="preview-bar" aria-label="デザイン比較"><a href="index.html">比較一覧</a><div class="variants">${Object.entries(
    names,
  )
    .map(
      ([id, name]) =>
        `<a href="${id}-${page}.html" ${id === design ? 'aria-current="page"' : ""}>${id.toUpperCase()} <span>${name}</span></a>`,
    )
    .join(
      "",
    )}</div><div class="preview-pages"><a href="${home}" ${page === "home" ? 'aria-current="page"' : ""}>トップ</a><a href="${post()}" ${page === "post" ? 'aria-current="page"' : ""}>投稿詳細</a><button id="theme-toggle" aria-label="ダークテーマに切り替える">◐</button></div></aside>`;
  const header = `<header class="site-header"><a class="brand" href="${home}">Scenote<span>${design === "b" ? "ADVENTURER’S FIELD NOTES" : design === "c" ? "our days in Eorzea" : "A JOURNAL OF EORZEA"}</span></a><nav aria-label="メイン"><a href="${home}#photos">写真を見る</a><a href="${home}#map">地図から探す</a><button class="edit-link" data-demo="写真の編集は本体のScenoteで利用できます。">写真を編集する ${arrow}</button></nav></header>`;
  const sectionTitle = (eyebrow, title, extra = "") =>
    `<div class="section-heading"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></div>${extra}</div>`;
  const mapPanel = (detail = false, p = photos[0]) => {
    if (detail && p.place === "撮影場所未登録")
      return `<section id="map" class="map-section missing-place">${sectionTitle("LOCATION", "撮影場所")}<p>この写真には撮影場所が登録されていません。</p><a class="text-link" href="${home}#map">地図からほかの写真を探す ${arrow}</a></section>`;
    return `<section id="map" class="map-section">${sectionTitle(detail ? "LOCATION" : "PLACES & MEMORIES", detail ? "この写真の撮影場所" : "地図から写真を探す", '<span class="small-label">ノルヴラント / イル・メグ</span>')}<div class="map-layout"><div class="map-stage"><div class="map-viewport"><img class="map-image" src="assets/map-ilmheg.webp" alt="FFXIV イル・メグのエリアマップ" width="1100" height="1100"><button class="map-pin pin-1" data-photo="1" aria-label="花の色をした午後を地図で選ぶ" aria-pressed="${p.id !== 2}"><span>1</span></button><button class="map-pin pin-2" data-photo="2" aria-label="小さな家を見つけたを地図で選ぶ" aria-pressed="${p.id === 2}"><span>2</span></button></div><span class="map-north" aria-hidden="true">N<br>↑</span><div class="map-controls"><button data-zoom="in" aria-label="地図を拡大する">+</button><button data-zoom="out" aria-label="地図を縮小する">−</button><button data-zoom="reset" aria-label="地図の倍率を戻す">↺</button></div><span class="map-copyright">© SQUARE ENIX</span></div><div class="map-note"><span class="eyebrow">IL MHEG</span><h3>イル・メグ</h3><p class="map-intro">あの景色のそばに、<br>誰かの記録が残っている。</p><div class="selected-photo" aria-live="polite"></div><p class="map-disclaimer">ピンは表示例です。実際の撮影座標を示すものではありません。</p></div></div></section>`;
  };
  const feed = () =>
    `<section id="photos" class="feed-section">${sectionTitle("RECENT ENTRIES", "新着の写真", '<span class="feed-count" aria-live="polite">8件の投稿</span>')}<div class="filter-row" role="group" aria-label="写真の絞り込み">${["すべて", "イル・メグ", "旅", "日常"].map((label, i) => `<button data-filter="${label}" aria-pressed="${i === 0}">${label}</button>`).join("")}<span class="filter-note">撮影日と場所を添えて</span></div><div class="photo-grid">${photos.map(card).join("")}</div></section>`;
  const albumHero = `<section class="album-intro"><span class="eyebrow">DAYS TO REMEMBER</span><h1>何でもない日も、<br>いい思い出になる。</h1><p>FINAL FANTASY XIVで撮った写真を、あなたの記録に。</p><div class="album-spread">${[photos[2], photos[0], photos[4]].map((p) => `<a class="album-print" href="${post(p.id)}">${photoImg(p, "", false)}<span>${p.title}</span><time>${p.date}</time></a>`).join("")}</div><button class="primary-button" data-demo="写真の編集は本体のScenoteで利用できます。">写真を編集する ${arrow}</button></section>`;
  const homeContent = () => {
    if (design === "b")
      return `<main class="container"><section class="field-intro"><div><span class="eyebrow">SCENOTE / FIELD JOURNAL</span><h1>歩いた先に、<br>残したい景色がある。</h1></div><div><p>FINAL FANTASY XIVの旅と日常を記録する写真日誌。</p><a class="text-link" href="#photos">新着の写真を見る ${arrow}</a></div></section>${mapPanel()}${feed()}<section class="closing-note"><h2>次の旅も、この一冊に。</h2><p>写真を整えて、撮影場所やひとことと一緒に投稿できます。</p><button class="primary-button" data-demo="写真の編集は本体のScenoteで利用できます。">写真を編集する ${arrow}</button></section></main>`;
    if (design === "c") return `<main class="container">${albumHero}${feed()}${mapPanel()}</main>`;
    return `<main class="container">${albumHero}<div class="journal-rule"><span>SCENES, SMALL DAYS & JOURNEYS</span><span>冒険者の写真日誌</span></div>${feed()}${mapPanel()}<section class="closing-note"><span class="eyebrow">MAKE A NOTE OF TODAY</span><h2>次に開いたとき、思い出せるように。</h2><p>写真に、場所と日付とひとことを添えて。</p><button class="primary-button" data-demo="写真の編集は本体のScenoteで利用できます。">写真を編集する ${arrow}</button></section></main>`;
  };
  const entryText = `<div class="entry-text"><span class="eyebrow">${photo.place === "イル・メグ" ? "NORVRANDT / IL MHEG" : "A DAY IN EORZEA"}</span>${design === "b" ? "" : `<h1>${photo.title}</h1>`}<div class="entry-author"><span class="avatar" aria-hidden="true">S</span><div>冒険者の記録<span>@sample-adventurer</span></div></div><dl class="entry-facts"><div><dt>撮影日</dt><dd><time>${photo.date}</time></dd></div><div><dt>撮影場所</dt><dd>${photo.place === "イル・メグ" ? '<a href="#map">イル・メグ ↗</a>' : "未登録"}</dd></div></dl><div class="entry-body"><p>${photo.text}</p><p>${photo.id === 1 ? "木の下で待ち合わせ。次の目的地を相談していたはずが、気がついたら写真ばかり撮っていた。" : "旅の途中で撮った一枚。次にここへ来るときも、この日のことを思い出せたらいい。"}</p><p>また、ゆっくり来よう。</p></div><div class="entry-tags"><span>#${photo.tag}</span><span>#風景</span></div><div class="entry-actions"><button class="outline-button" id="share">URLをコピー</button><button class="text-button" data-demo="通報は本体のScenoteで受け付けています。">通報する</button></div><p class="published">投稿日 2026.10.13 · 公開</p></div>`;
  const detailImage = `<figure class="entry-photo"><button class="expand-photo" aria-label="写真を拡大する">${photoImg(photo, "", false)}<span class="expand-label">写真を拡大 ↗</span></button><figcaption>${photo.place} <span>${photo.date}</span></figcaption></figure>`;
  const detailContent = () =>
    `<main class="container detail-container"><a class="back-link" href="${home}#photos">← 写真一覧へ</a><article class="entry ${design === "c" ? "album-entry" : ""}">${design === "b" ? `<div class="field-entry-title"><span class="eyebrow">FIELD NOTE / ${String(photo.id).padStart(3, "0")}</span><h1>${photo.title}</h1><span>${photo.date} / ${photo.place}</span></div><div class="field-entry-grid">${detailImage}${mapPanel(true, photo)}</div><div class="field-entry-body">${entryText}</div>` : `${detailImage}${entryText}`}</article>${design !== "b" ? mapPanel(true, photo) : ""}<section class="related-section">${sectionTitle("MORE ENTRIES", "ほかの写真")}<div class="related-grid">${photos
      .filter((p) => p.id !== photo.id)
      .slice(0, 3)
      .map(card)
      .join("")}</div></section></main>`;
  const footer = `<footer class="site-footer"><a class="brand" href="${home}">Scenote</a><p>FINAL FANTASY XIVの風景と日常を残す写真日誌。</p><div><span>利用規約</span><span>プライバシーポリシー</span><span>お問い合わせ</span></div><small>© SQUARE ENIX · Screenshots by the site owner.</small></footer><p class="prototype-note">デザイン試作 · 投稿情報と地図のピンは仮データ · 地図機能は将来構想の提案</p><div class="toast" role="status" hidden></div><dialog class="photo-dialog"><button class="close-dialog" aria-label="拡大写真を閉じる">×</button>${photoImg(photo, "", false)}</dialog>`;
  document.getElementById("app").innerHTML =
    previewBar + header + (page === "home" ? homeContent() : detailContent()) + footer;
  const themeButton = document.getElementById("theme-toggle");
  const setTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    themeButton.setAttribute(
      "aria-label",
      `${theme === "dark" ? "ライト" : "ダーク"}テーマに切り替える`,
    );
  };
  try {
    setTheme(localStorage.getItem("scenote-design-theme") || "light");
  } catch {
    setTheme("light");
  }
  themeButton.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(theme);
    try {
      localStorage.setItem("scenote-design-theme", theme);
    } catch {
      /* file URLでも動く */
    }
  });
  let toastTimer;
  const toast = (text) => {
    const el = document.querySelector(".toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 3500);
  };
  document
    .querySelectorAll("[data-demo]")
    .forEach((button) => button.addEventListener("click", () => toast(button.dataset.demo)));
  document.querySelectorAll("[data-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      document
        .querySelectorAll("[data-filter]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      const selected = button.dataset.filter;
      let count = 0;
      document.querySelectorAll(".photo-grid .photo-card").forEach((el) => {
        const show =
          selected === "すべて" || el.dataset.place === selected || el.dataset.tag === selected;
        el.hidden = !show;
        if (show) count++;
      });
      document.querySelector(".feed-count").textContent = `${count}件の投稿`;
    }),
  );
  const selectMapPhoto = (id) => {
    const selected = photos.find((p) => p.id === id) || photos[0];
    const target = document.querySelector(".selected-photo");
    if (!target) return;
    target.innerHTML = `<a href="${post(id)}">${photoImg(selected)}<span class="small-label">${selected.date}</span><strong>${selected.title} ${arrow}</strong></a>`;
    document
      .querySelectorAll("[data-photo]")
      .forEach((button) =>
        button.setAttribute("aria-pressed", String(Number(button.dataset.photo) === id)),
      );
  };
  selectMapPhoto(photo.id === 2 ? 2 : 1);
  document
    .querySelectorAll("[data-photo]")
    .forEach((button) =>
      button.addEventListener("click", () => selectMapPhoto(Number(button.dataset.photo))),
    );
  let zoom = 1;
  document.querySelectorAll("[data-zoom]").forEach((button) =>
    button.addEventListener("click", () => {
      zoom =
        button.dataset.zoom === "reset"
          ? 1
          : Math.min(2, Math.max(1, zoom + (button.dataset.zoom === "in" ? 0.25 : -0.25)));
      document.querySelector(".map-viewport").style.transform = `scale(${zoom})`;
    }),
  );
  const dialog = document.querySelector(".photo-dialog");
  document.querySelector(".expand-photo")?.addEventListener("click", () => dialog.showModal());
  document.querySelector(".close-dialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.getElementById("share")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("URLをコピーしました。");
    } catch {
      toast("この環境ではコピーできません。アドレスバーからURLをコピーしてください。");
    }
  });
})();
