/* CivLab BR Gov — static, no build. Works on any Apache/nginx static host. */
(function () {
  "use strict";

  var state = {
    tab: "senadores",
    data: { senadores: [], deputados: [], executivo: [] },
    meta: null,
    filters: { uf: "", party: "", q: "", sort: "nome" },
    globalQ: ""
  };

  function $(s) { return document.querySelector(s); }
  var grid = $("#grid"), resultInfo = $("#result-info");
  var fUf = $("#f-uf"), fParty = $("#f-party"), fQ = $("#f-q"), fSort = $("#f-sort");

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  // Force https to avoid mixed-content blocking when the site is served over https.
  function fixFoto(u) {
    if (typeof u === "string" && u.indexOf("http://") === 0) return "https://" + u.slice(7);
    return u || "";
  }

  function initials(nome) {
    var parts = (nome || "?").trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  async function load() {
    try {
      var base = "";
      var results = await Promise.all([
        fetch(base + "data/senadores.json").then(function (r) { if (!r.ok) throw new Error("senadores " + r.status); return r.json(); }),
        fetch(base + "data/deputados.json").then(function (r) { if (!r.ok) throw new Error("deputados " + r.status); return r.json(); }),
        fetch(base + "data/executivo.json").then(function (r) { if (!r.ok) throw new Error("executivo " + r.status); return r.json(); }),
        fetch(base + "data/meta.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      ]);
      state.data = { senadores: results[0], deputados: results[1], executivo: results[2] };
      state.meta = results[3];
    } catch (e) {
      resultInfo.textContent = "Erro ao carregar data/*.json — no Apache, suba a pasta inteira (index.html + assets/ + data/) preservando a estrutura. Detalhe: " + e.message;
      return;
    }
    var sen = state.data.senadores, dep = state.data.deputados, exe = state.data.executivo;
    $("#count-sen").textContent = sen.length;
    $("#count-dep").textContent = dep.length;
    $("#count-exe").textContent = exe.length;
    $("#stat-sen").textContent = sen.length;
    $("#stat-dep").textContent = dep.length;
    $("#stat-exe").textContent = exe.length;
    if (state.meta && state.meta.atualizado_em) {
      var d = new Date(state.meta.atualizado_em);
      $("#updated-badge").textContent = "atualizado em " + d.toLocaleDateString("pt-BR");
      $("#foot-date").textContent = "dados de " + d.toLocaleDateString("pt-BR");
    } else {
      $("#updated-badge").textContent = sen.length + " senadores · " + dep.length + " deputados";
    }
    buildFilterOptions();
    render();
  }

  function unified(tab) {
    if (tab === "senadores") return state.data.senadores.map(function (s) {
      return {
        kind: "Senado Federal", nome: s.nome, partido: s.partido, uf: s.uf,
        foto: s.foto_local || fixFoto(s.foto), fotoFallback: s.foto_local ? fixFoto(s.foto_remote || s.foto) : "",
        email: s.email || "",
        sub: (s.partido || "—") + " · " + (s.uf || "—"),
        detail: { Cargo: "Senador(a) da República", NomeCompleto: s.nome_completo, Partido: s.partido, UF: s.uf, Bloco: s.bloco || "—", Email: s.email || "—", Titularidade: s.titularidade || "—" },
        links: [[s.pagina && "Página no Senado", fixFoto(s.pagina)], s.email && ["E-mail", "mailto:" + s.email]].filter(Boolean).map(function (x) { return Array.isArray(x) ? x : x; })
      };
    });
    if (tab === "deputados") return state.data.deputados.map(function (d) {
      return {
        kind: "Câmara dos Deputados", nome: d.nome, partido: d.partido, uf: d.uf,
        foto: d.foto_local || fixFoto(d.foto), fotoFallback: d.foto_local ? fixFoto(d.foto_remote || d.foto) : "",
        email: d.email || "",
        sub: (d.partido || "—") + " · " + (d.uf || "—"),
        detail: { Cargo: "Deputado(a) Federal", Partido: d.partido, UF: d.uf, Email: d.email || "—", Legislatura: String(d.legislatura || 57) },
        links: [["Página na Câmara", "https://www.camara.leg.br/deputados/" + d.id]].concat(d.email ? [["E-mail", "mailto:" + d.email]] : [])
      };
    });
    return state.data.executivo.map(function (e) {
      return {
        kind: "Poder Executivo Federal", nome: e.nome, partido: e.partido, uf: "",
        cargo: e.cargo, foto: e.foto_local || fixFoto(e.foto), fotoFallback: "",
        email: e.email || "", emailTipo: e.email_tipo || "",
        sub: e.cargo,
        detail: { Cargo: e.cargo, Órgão: e.orgao, Partido: e.partido, Desde: e.desde, Email: e.email ? e.email + (e.email_tipo ? " (" + e.email_tipo + ")" : "") : "—" },
        links: (e.email ? [["E-mail", "mailto:" + e.email]] : []).concat([["gov.br / Planalto", "https://www.gov.br/planalto/pt-br/conheca-a-presidencia"]])
      };
    });
  }

  function buildFilterOptions() {
    var items = unified(state.tab);
    var ufs = Array.from(new Set(items.map(function (i) { return i.uf; }).filter(Boolean))).sort();
    var parties = Array.from(new Set(items.map(function (i) { return i.partido; }).filter(Boolean))).sort();
    fUf.innerHTML = '<option value="">Todas</option>' + ufs.map(function (u) { return "<option>" + escapeHtml(u) + "</option>"; }).join("");
    fParty.innerHTML = '<option value="">Todos</option>' + parties.map(function (p) { return "<option>" + escapeHtml(p) + "</option>"; }).join("");
    fUf.value = state.filters.uf; fParty.value = state.filters.party;
  }

  function applyFilters(items) {
    var uf = state.filters.uf, party = state.filters.party, q = state.filters.q;
    var gq = norm(state.globalQ), lq = norm(q);
    var out = items.filter(function (i) {
      if (uf && i.uf !== uf) return false;
      if (party && i.partido !== party) return false;
      var hay = norm(i.nome + " " + (i.partido || "") + " " + (i.uf || "") + " " + (i.cargo || "") + " " + (i.sub || "") + " " + (i.email || ""));
      if (lq && hay.indexOf(lq) === -1) return false;
      if (gq && hay.indexOf(gq) === -1) return false;
      return true;
    });
    var s = state.filters.sort;
    out.sort(function (a, b) {
      var ka = norm(s === "partido" ? a.partido || "" : s === "uf" ? a.uf || "" : a.nome);
      var kb = norm(s === "partido" ? b.partido || "" : s === "uf" ? b.uf || "" : b.nome);
      return ka.localeCompare(kb, "pt-BR");
    });
    return out;
  }

  // Photo chain: local file -> official remote URL -> initials fallback.
  // No inline onerror attributes (they break HTML parsing with data-URIs).
  function attachPhoto(img, it) {
    img.loading = "lazy";
    img.alt = "Foto de " + it.nome;
    img.referrerPolicy = "no-referrer";
    var triedRemote = false;
    img.addEventListener("error", function h() {
      if (!triedRemote && it.fotoFallback) {
        triedRemote = true;
        img.src = it.fotoFallback;
        return;
      }
      img.removeEventListener("error", h);
      img.remove(); // reveal initials behind
    });
    img.src = it.foto;
  }
  function makeCard(it) {
    var b = document.createElement("button");
    b.className = "card";
    b.type = "button";

    var media = document.createElement("span");
    media.className = "card-media";

    var fb = document.createElement("span");
    fb.className = "card-fallback";
    fb.textContent = initials(it.nome);
    fb.setAttribute("aria-hidden", "true");
    media.appendChild(fb);

    if (it.foto) {
      var img = document.createElement("img");
      attachPhoto(img, it);
      media.appendChild(img);
    }

    var body = document.createElement("span");
    body.className = "card-body";
    var strong = document.createElement("strong");
    strong.textContent = it.nome;
    var pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = (it.partido || "—") + " · " + (it.uf || it.kind);
    var sub = document.createElement("span");
    sub.className = "small muted";
    sub.textContent = it.sub || "";
    body.appendChild(strong); body.appendChild(pill); body.appendChild(sub);
    if (it.email) {
      var em = document.createElement("span");
      em.className = "card-email";
      em.textContent = "\u2709\uFE0E " + it.email;
      em.title = it.email + (it.emailTipo ? " (" + it.emailTipo + ")" : "");
      body.appendChild(em);
    }

    b.appendChild(media); b.appendChild(body);
    b.addEventListener("click", function () { openModal(it); });
    return b;
  }

  var GROUP_LABELS = { senadores: "Senadores", deputados: "Deputados federais", executivo: "Poder Executivo federal" };

  function emptyState(query) {
    var d = document.createElement("div");
    d.className = "empty";
    var p = document.createElement("p");
    p.textContent = query
      ? "Nenhum resultado para \u201C" + query + "\u201D. Tente outro nome, partido, UF ou cargo."
      : "Nenhum resultado com estes filtros.";
    var b = document.createElement("button");
    b.className = "btn small"; b.type = "button"; b.textContent = "Limpar busca e filtros";
    b.addEventListener("click", function () { clearAll(); });
    d.appendChild(p); d.appendChild(b);
    return d;
  }

  function clearAll() {
    state.filters = { uf: "", party: "", q: "", sort: "nome" }; state.globalQ = "";
    globalSearch.value = "";
    fUf.value = ""; fParty.value = ""; fQ.value = ""; fSort.value = "nome";
    buildFilterOptions(); render();
  }

  function render() {
    document.querySelectorAll("[role=tab]").forEach(function (el) {
      el.setAttribute("aria-selected", String(el.dataset.tab === state.tab));
    });
    grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    // Global (top) search spans ALL powers, grouped. Tab-scoped view otherwise.
    if (norm(state.globalQ)) {
      var total = 0;
      ["senadores", "deputados", "executivo"].forEach(function (t) {
        var items = applyFilters(unified(t));
        if (!items.length) return;
        total += items.length;
        var h = document.createElement("h3");
        h.className = "group-title";
        h.textContent = GROUP_LABELS[t] + " (" + items.length + ")";
        frag.appendChild(h);
        items.slice(0, 60).forEach(function (it) { frag.appendChild(makeCard(it)); });
        if (items.length > 60) {
          var more = document.createElement("p");
          more.className = "small muted group-more";
          more.textContent = "Mostrando 60 de " + items.length + " em " + GROUP_LABELS[t] + " — refine a busca ou use os filtros de UF/partido.";
          frag.appendChild(more);
        }
      });
      resultInfo.textContent = total
        ? total + " resultado(s) para \u201C" + state.globalQ + "\u201D em todos os poderes"
        : "Nenhum resultado para \u201C" + state.globalQ + "\u201D";
      if (!total) frag.appendChild(emptyState(state.globalQ));
      grid.appendChild(frag);
      return;
    }
    var items = applyFilters(unified(state.tab));
    resultInfo.textContent = items.length + " resultado(s) em " + state.tab + " · use UF/partido/busca para refinar";
    if (!items.length) frag.appendChild(emptyState(""));
    items.slice(0, 600).forEach(function (it) { frag.appendChild(makeCard(it)); });
    grid.appendChild(frag);
    if (items.length > 600) {
      var p = document.createElement("p");
      p.className = "small muted"; p.textContent = "Mostrando 600 de " + items.length + " — refine a busca.";
      grid.appendChild(p);
    }
  }

  var modal = $("#modal");
  function openModal(it) {
    $("#m-kicker").textContent = it.kind;
    $("#m-title").textContent = it.nome;
    $("#m-sub").textContent = it.sub || "";
    var wrap = $("#m-photo-wrap");
    wrap.innerHTML = "";
    var fb = document.createElement("span");
    fb.className = "card-fallback large";
    fb.textContent = initials(it.nome);
    wrap.appendChild(fb);
    if (it.foto) {
      var img = document.createElement("img");
      attachPhoto(img, it);
      wrap.appendChild(img);
    }
    var kv = $("#m-kv");
    kv.innerHTML = "";
    Object.keys(it.detail).forEach(function (k) {
      var dt = document.createElement("dt"); dt.textContent = k;
      var dd = document.createElement("dd"); dd.textContent = String(it.detail[k]);
      kv.appendChild(dt); kv.appendChild(dd);
    });
    var links = $("#m-links");
    links.innerHTML = "";
    it.links.forEach(function (pair) {
      var a = document.createElement("a");
      a.href = pair[1]; a.target = "_blank"; a.rel = "noopener";
      a.textContent = pair[0] + " ↗";
      links.appendChild(a);
    });
    if (typeof modal.showModal === "function") modal.showModal();
  }
  $("#modal-close").addEventListener("click", function () { modal.close(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.close(); });

  // Bridge for graph.js (Mapa do poder): reuse the profile modal.
  window.CivLab = window.CivLab || {};
  window.CivLab.openPerson = openModal;

  function setTab(t) {
    state.tab = t;
    state.filters.uf = ""; state.filters.party = ""; state.filters.q = ""; fQ.value = "";
    buildFilterOptions(); render();
    document.getElementById("explorar").scrollIntoView({ behavior: "smooth" });
  }
  document.querySelectorAll("[role=tab]").forEach(function (b) {
    b.addEventListener("click", function () { state.tab = b.dataset.tab; buildFilterOptions(); render(); });
  });
  document.querySelectorAll("[data-goto-tab]").forEach(function (b) {
    b.addEventListener("click", function (e) { e.preventDefault(); setTab(b.getAttribute("data-goto-tab")); });
  });
  fUf.addEventListener("change", function () { state.filters.uf = fUf.value; render(); });
  fParty.addEventListener("change", function () { state.filters.party = fParty.value; render(); });
  fQ.addEventListener("input", function () { state.filters.q = fQ.value; render(); });
  fSort.addEventListener("change", function () { state.filters.sort = fSort.value; render(); });
  $("#f-clear").addEventListener("click", function () { clearAll(); });
  // Top search: filter results AND scroll down to the Explorar filters,
  // so the user sees the results without manual scrolling. Scroll happens
  // once per focus (first keystroke) plus on Enter, not on every keystroke.
  var globalSearch = $("#global-search");
  var exploreFilters = document.querySelector("#explorar .filters");
  var scrollOnType = false;
  function scrollToResults() {
    var target = exploreFilters || document.getElementById("explorar");
    // slight delay so the first filtered results paint before scrolling
    setTimeout(function () {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }
  globalSearch.addEventListener("focus", function () { scrollOnType = true; });
  globalSearch.addEventListener("input", function (e) {
    state.globalQ = e.target.value; render();
    if (scrollOnType) { scrollOnType = false; scrollToResults(); }
  });
  globalSearch.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); scrollOnType = false; scrollToResults(); }
  });

  load();
})();
