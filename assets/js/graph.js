/* CivLab BR — Mapa do poder: Graph + Power map (canvas, zero dependências).
   Funciona em qualquer hospedagem estática. Não publica nada sozinho. */
(function () {
  "use strict";

  var COLORS = {
    senadores: "#1e3a8a",
    deputados: "#166534",
    executivo: "#b45309",
    partido: "#7c3aed",
    uf: "#64748b",
    pessoa: "#0f766e"
  };
  var HOUSE_LABEL = {
    senadores: "Senado Federal",
    deputados: "Câmara dos Deputados",
    executivo: "Executivo federal"
  };
  var MAX_EXPAND = 60;

  var canvas = document.getElementById("g-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var hint = document.getElementById("g-hint");
  var panel = document.getElementById("g-panel");
  var searchInput = document.getElementById("g-q");
  var namesList = document.getElementById("g-names");

  var data = { senadores: [], deputados: [], executivo: [] };
  var people = [];          // {id,nome,house,partido,uf,cargo,email}
  var byId = {};
  var mode = "graph";       // 'graph' | 'power'
  var nodes = new Map();    // id -> node {id,label,kind,color,r,x,y,vx,vy,ref,expanded}
  var edges = [];           // {a,b,w}
  var view = { cx: 0, cy: 0, scale: 1 };
  var hover = null, selected = null;
  var dragNode = null, panning = false, moved = 0, lastPX = 0, lastPY = 0;

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function slugify(s) {
    return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function housesOn() {
    return {
      senadores: document.getElementById("g-sen").checked,
      deputados: document.getElementById("g-dep").checked,
      executivo: document.getElementById("g-exe").checked
    };
  }

  async function load() {
    try {
      var r = await Promise.all([
        fetch("data/senadores.json").then(function (x) { return x.json(); }),
        fetch("data/deputados.json").then(function (x) { return x.json(); }),
        fetch("data/executivo.json").then(function (x) { return x.json(); })
      ]);
      data = { senadores: r[0], deputados: r[1], executivo: r[2] };
    } catch (e) {
      hint.textContent = "Erro ao carregar data/*.json";
      return;
    }
    indexPeople();
    fillNames();
    buildGraph();
    bindUI();
    resize();
    requestAnimationFrame(tick);
  }

  function indexPeople() {
    people = []; byId = {};
    data.senadores.forEach(function (s) {
      addPerson("sen:" + s.codigo, s.nome, "senadores", s.partido, s.uf, "Senador(a)", s.email || "");
    });
    data.deputados.forEach(function (d) {
      addPerson("dep:" + d.id, d.nome, "deputados", d.partido, d.uf, "Deputado(a) Federal", d.email || "");
    });
    data.executivo.forEach(function (e) {
      addPerson("exe:" + slugify(e.nome), e.nome, "executivo", e.partido, "", e.cargo + " · " + e.orgao, e.email || "");
    });
  }
  function addPerson(id, nome, house, partido, uf, cargo, email) {
    var p = { id: id, nome: nome, house: house, partido: partido || "—", uf: uf || "", cargo: cargo || "", email: email || "" };
    people.push(p); byId[id] = p;
  }
  function fillNames() {
    namesList.innerHTML = "";
    var frag = document.createDocumentFragment();
    people.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.nome;
      frag.appendChild(o);
    });
    namesList.appendChild(frag);
  }

  // ---------- graph construction ----------
  function mkNode(id, label, kind, color, r, ref) {
    if (nodes.has(id)) return nodes.get(id);
    var a = Math.random() * Math.PI * 2, rad = 140 + Math.random() * 160;
    var n = { id: id, label: label, kind: kind, color: color, r: r, ref: ref || null, expanded: false,
              x: Math.cos(a) * rad, y: Math.sin(a) * rad, vx: 0, vy: 0 };
    nodes.set(id, n);
    return n;
  }
  function link(a, b, w) {
    edges.push({ a: a, b: b, w: w || 1 });
  }
  function partyMembers(house, party, on) {
    return people.filter(function (p) {
      return on[p.house] && (house ? p.house === house : true) && p.partido === party;
    }).sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
  }
  function ufMembers(house, uf, on) {
    return people.filter(function (p) {
      return on[p.house] && (house ? p.house === house : true) && p.uf === uf;
    }).sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
  }

  function buildGraph() {
    nodes.clear(); edges = []; selected = null; hover = null;
    var on = housesOn();
    var hubs = {};
    Object.keys(HOUSE_LABEL).forEach(function (h) {
      if (!on[h]) return;
      hubs[h] = mkNode("hub:" + h, HOUSE_LABEL[h], "hub", COLORS[h], 26, { house: h });
      hubs[h].x = 0; hubs[h].y = 0;
    });
    // party nodes (across checked houses)
    var counts = {};
    people.forEach(function (p) {
      if (!on[p.house] || !p.partido || p.partido === "—") return;
      counts[p.partido] = (counts[p.partido] || 0) + 1;
    });
    Object.keys(counts).sort().forEach(function (party) {
      var n = mkNode("party:" + party, party, "partido", COLORS.partido, 8 + Math.sqrt(counts[party]) * 2.4, { party: party, count: counts[party] });
      Object.keys(hubs).forEach(function (h) {
        var c = partyMembers(h, party, on).length;
        if (c > 0) link(hubs[h].id, n.id, Math.sqrt(c));
      });
    });
    // UF nodes (legislative only)
    var ufs = {};
    people.forEach(function (p) {
      if (!on[p.house] || !p.uf || p.house === "executivo") return;
      ufs[p.uf] = (ufs[p.uf] || 0) + 1;
    });
    Object.keys(ufs).sort().forEach(function (uf) {
      var n = mkNode("uf:" + uf, uf, "uf", COLORS.uf, 9, { uf: uf, count: ufs[uf] });
      ["senadores", "deputados"].forEach(function (h) {
        if (!hubs[h]) return;
        var c = ufMembers(h, uf, on).length;
        if (c > 0) link(hubs[h].id, n.id, Math.sqrt(c));
      });
    });
    view.cx = 0; view.cy = 0; view.scale = 1;
    panel.hidden = true;
    hint.textContent = nodes.size + " nós · clique num partido ou UF para expandir os membros";
  }

  function expandGroup(node) {
    var on = housesOn();
    var members, gid = node.id;
    if (node.kind === "partido") members = partyMembers(null, node.ref.party, on);
    else if (node.kind === "uf") members = ufMembers(null, node.ref.uf, on);
    else return;
    if (node.expanded) {
      // collapse: remove member nodes attached only here
      var keep = new Set();
      nodes.forEach(function (n) {
        if (n.kind === "pessoa" && n.ref.gid === gid) keep.add(n.id);
      });
      keep.forEach(function (id) { nodes.delete(id); });
      edges = edges.filter(function (e) { return !keep.has(e.a) && !keep.has(e.b); });
      node.expanded = false;
      hint.textContent = "grupo recolhido";
      return;
    }
    var shown = members.slice(0, MAX_EXPAND);
    shown.forEach(function (p) {
      var id = "p:" + gid + ":" + p.id;
      if (nodes.has(id)) return;
      var n = mkNode(id, p.nome, "pessoa", COLORS[p.house] || COLORS.pessoa, 7, { person: p, gid: gid });
      n.x = node.x + (Math.random() - 0.5) * 120;
      n.y = node.y + (Math.random() - 0.5) * 120;
      link(gid, id, 1);
    });
    node.expanded = true;
    hint.textContent = shown.length + " de " + members.length + " membros de " + node.label +
      (members.length > MAX_EXPAND ? " (limite de " + MAX_EXPAND + " por vez)" : "") + " · clique de novo para recolher";
  }

  // ---------- power map (ego network) ----------
  function findPerson(q) {
    var nq = norm(q);
    if (!nq) return null;
    var exact = people.filter(function (p) { return norm(p.nome) === nq; });
    if (exact.length) return exact[0];
    var starts = people.filter(function (p) { return norm(p.nome).indexOf(nq) === 0; });
    if (starts.length) return starts[0];
    var has = people.filter(function (p) { return norm(p.nome).indexOf(nq) !== -1; });
    return has[0] || null;
  }

  function buildPowerMap(center) {
    nodes.clear(); edges = []; selected = null; hover = null;
    if (!center) {
      // default: President
      center = people.filter(function (p) { return p.house === "executivo" && /president/i.test(p.cargo); })[0] || people[0];
    }
    var on = housesOn();
    var c = mkNode("ego:" + center.id, center.nome, "pessoa", COLORS[center.house], 20, { person: center });
    c.x = 0; c.y = 0;
    // attribute ring
    function attr(id, label, color, r, ref) {
      var n = mkNode(id, label, "attr", color, r, ref);
      link(c.id, id, 2);
      return n;
    }
    var hubN = attr("ego:hub", HOUSE_LABEL[center.house], COLORS[center.house], 16, { house: center.house });
    var partyN = center.partido && center.partido !== "—"
      ? attr("ego:party", center.partido, COLORS.partido, 14, { party: center.partido }) : null;
    var ufN = center.uf ? attr("ego:uf", center.uf, COLORS.uf, 12, { uf: center.uf }) : null;
    var orgm = center.house === "executivo" && center.cargo
      ? attr("ego:org", center.cargo.split("·")[0].trim(), COLORS.executivo, 12, {}) : null;
    // colleagues
    function addColleagues(list, parentId, cap, tag) {
      var shown = list.filter(function (p) { return p.id !== center.id && on[p.house]; }).slice(0, cap);
      shown.forEach(function (p) {
        var n = mkNode("ego:c:" + parentId + ":" + p.id, p.nome, "pessoa", COLORS[p.house], 7, { person: p });
        n.x = (Math.random() - 0.5) * 300; n.y = (Math.random() - 0.5) * 300;
        link(parentId, n.id, 1);
      });
      return { shown: shown.length, total: list.filter(function (p) { return p.id !== center.id; }).length };
    }
    var stats = [];
    if (partyN) {
      var sameParty = people.filter(function (p) { return p.house === center.house && p.partido === center.partido; });
      var s = addColleagues(sameParty, partyN.id, 10);
      stats.push(s.shown + "/" + s.total + " do " + center.partido);
    }
    if (ufN) {
      var sameUF = people.filter(function (p) { return p.house === center.house && p.uf === center.uf; });
      var s2 = addColleagues(sameUF, ufN.id, 6);
      stats.push(s2.shown + "/" + s2.total + " de " + center.uf);
    }
    if (orgm && center.house === "executivo") {
      var org = center.cargo.split("·")[1] ? center.cargo.split("·")[1].trim() : "";
      var sameOrg = people.filter(function (p) { return p.house === "executivo" && p.cargo.indexOf(org) !== -1 && org; });
      var s3 = addColleagues(sameOrg.length ? sameOrg : [center], orgm.id, 8);
      if (s3.total > 1) stats.push(s3.shown + "/" + s3.total + " do órgão");
    }
    // cross-house same party
    if (partyN && center.house !== "executivo") {
      var other = center.house === "senadores" ? "deputados" : "senadores";
      var cross = people.filter(function (p) { return p.house === other && p.partido === center.partido && on[other]; });
      if (cross.length) {
        var s4 = addColleagues(cross, partyN.id, 6);
        stats.push(s4.shown + "/" + s4.total + " do " + center.partido + " na " + (other === "senadores" ? "outra Casa" : "outra Casa"));
      }
    }
    view.cx = 0; view.cy = 0; view.scale = 1;
    showPersonPanel(center, stats);
    hint.textContent = "Power map de " + center.nome + " · clique numa pessoa para recentralizar";
  }

  // ---------- side panel + modal bridge ----------
  function modalItem(p) {
    if (p.house === "senadores") {
      var s = data.senadores.filter(function (x) { return "sen:" + x.codigo === p.id; })[0] || {};
      return { kind: "Senado Federal", nome: p.nome, sub: p.partido + " · " + p.uf,
        foto: s.foto_local || "", fotoFallback: s.foto_remote || "",
        detail: { Cargo: "Senador(a) da República", Partido: p.partido, UF: p.uf, Email: p.email || "—" },
        links: (p.email ? [["E-mail", "mailto:" + p.email]] : []).concat(s.pagina ? [["Página no Senado", s.pagina]] : []) };
    }
    if (p.house === "deputados") {
      var d = data.deputados.filter(function (x) { return "dep:" + x.id === p.id; })[0] || {};
      return { kind: "Câmara dos Deputados", nome: p.nome, sub: p.partido + " · " + p.uf,
        foto: d.foto_local || "", fotoFallback: d.foto_remote || "",
        detail: { Cargo: "Deputado(a) Federal", Partido: p.partido, UF: p.uf, Email: p.email || "—" },
        links: (p.email ? [["E-mail", "mailto:" + p.email]] : []).concat(d.id ? [["Página na Câmara", "https://www.camara.leg.br/deputados/" + d.id]] : []) };
    }
    var e = data.executivo.filter(function (x) { return "exe:" + slugify(x.nome) === p.id; })[0] || {};
    return { kind: "Poder Executivo Federal", nome: p.nome, sub: p.cargo,
      foto: e.foto_local || "", fotoFallback: "",
      detail: { Cargo: e.cargo || p.cargo, Órgão: e.orgao || "—", Partido: p.partido, Email: p.email || "—" },
      links: (p.email ? [["E-mail", "mailto:" + p.email]] : []).concat([["gov.br / Planalto", "https://www.gov.br/planalto/pt-br/conheca-a-presidencia"]]) };
  }

  function showPersonPanel(p, stats) {
    panel.hidden = false;
    panel.innerHTML = "";
    var h = document.createElement("h3"); h.textContent = p.nome; panel.appendChild(h);
    var k = document.createElement("p"); k.className = "small muted"; k.style.margin = "0";
    k.textContent = HOUSE_LABEL[p.house]; panel.appendChild(k);
    var pill = document.createElement("span"); pill.className = "pill";
    pill.textContent = (p.house === "executivo" ? p.cargo : p.partido + " · " + (p.uf || "—"));
    panel.appendChild(pill);
    if (p.email) {
      var em = document.createElement("p"); em.className = "small";
      em.textContent = "✉ " + p.email; panel.appendChild(em);
    }
    if (stats && stats.length) {
      var ul = document.createElement("ul");
      stats.forEach(function (s) { var li = document.createElement("li"); li.textContent = s; ul.appendChild(li); });
      panel.appendChild(ul);
    }
    var b = document.createElement("button"); b.className = "btn small primary"; b.type = "button";
    b.textContent = "Abrir perfil completo";
    b.addEventListener("click", function () {
      if (window.CivLab && typeof window.CivLab.openPerson === "function") window.CivLab.openPerson(modalItem(p));
    });
    panel.appendChild(b);
    var c = document.createElement("button"); c.className = "btn small"; c.type = "button";
    c.textContent = "Fechar"; c.style.marginLeft = "6px";
    c.addEventListener("click", function () { panel.hidden = true; });
    panel.appendChild(c);
  }

  function showGroupPanel(node) {
    panel.hidden = false;
    panel.innerHTML = "";
    var h = document.createElement("h3"); h.textContent = node.label; panel.appendChild(h);
    var p = document.createElement("p"); p.className = "small muted"; p.style.margin = "0";
    p.textContent = node.kind === "partido" ? "Partido · " + (node.ref.count || 0) + " membros no filtro atual"
      : node.kind === "uf" ? "UF · " + (node.ref.count || 0) + " parlamentares"
      : (HOUSE_LABEL[node.ref.house] || "");
    panel.appendChild(p);
    var b = document.createElement("button"); b.className = "btn small primary"; b.type = "button";
    b.textContent = node.expanded ? "Recolher membros" : "Expandir membros";
    b.addEventListener("click", function () { expandGroup(node); });
    panel.appendChild(b);
  }

  // ---------- physics + render ----------
  function tick() {
    step();
    draw();
    requestAnimationFrame(tick);
  }
  function step() {
    var arr = Array.from(nodes.values());
    var i, j, a, b, dx, dy, d2, d, f;
    for (i = 0; i < arr.length; i++) {
      a = arr[i];
      for (j = i + 1; j < arr.length; j++) {
        b = arr[j];
        dx = a.x - b.x; dy = a.y - b.y;
        d2 = dx * dx + dy * dy + 40;
        d = Math.sqrt(d2);
        f = Math.min(9000 / d2, 6) / d;
        a.vx += dx * f; a.vy += dy * f;
        b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    edges.forEach(function (e) {
      a = nodes.get(e.a); b = nodes.get(e.b);
      if (!a || !b) return;
      dx = b.x - a.x; dy = b.y - a.y;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      var rest = 70 + 26 * (e.w || 1);
      if (a.kind === "hub" || b.kind === "hub") rest += 40;
      f = (d - rest) * 0.012 * (e.w || 1);
      dx /= d; dy /= d;
      a.vx += dx * f; a.vy += dy * f;
      b.vx -= dx * f; b.vy -= dy * f;
    });
    arr.forEach(function (n) {
      if (n === dragNode) return;
      n.vx += -n.x * 0.004; n.vy += -n.y * 0.004;
      n.vx *= 0.86; n.vy *= 0.86;
      n.x += n.vx; n.y += n.vy;
    });
  }
  function toScreen(x, y) {
    var r = canvas.getBoundingClientRect();
    return [(x - view.cx) * view.scale + r.width / 2, (y - view.cy) * view.scale + r.height / 2];
  }
  function draw() {
    var dpr = window.devicePixelRatio || 1;
    var r = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    var nb = hover || selected;
    var nbSet = null;
    if (nb) {
      nbSet = new Set([nb.id]);
      edges.forEach(function (e) {
        if (e.a === nb.id) nbSet.add(e.b);
        if (e.b === nb.id) nbSet.add(e.a);
      });
    }
    edges.forEach(function (e) {
      var a = nodes.get(e.a), b = nodes.get(e.b);
      if (!a || !b) return;
      var pa = toScreen(a.x, a.y), pb = toScreen(b.x, b.y);
      var hot = nbSet && (nbSet.has(e.a) && nbSet.has(e.b));
      ctx.strokeStyle = hot ? "rgba(15,118,110,.7)" : "rgba(100,116,139,.28)";
      ctx.lineWidth = hot ? 2 : 1 + Math.min(2, (e.w || 1) * 0.5);
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    });
    nodes.forEach(function (n) {
      var p = toScreen(n.x, n.y);
      var rad = n.r * (n.kind === "hub" ? 1 : (0.7 + 0.3 * view.scale));
      if (p[0] < -50 || p[1] < -50 || p[0] > r.width + 50 || p[1] > r.height + 50) return;
      var dim = nbSet && !nbSet.has(n.id);
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, Math.PI * 2); ctx.fill();
      if (n === hover || n === selected) {
        ctx.strokeStyle = "#111827"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p[0], p[1], rad + 3, 0, Math.PI * 2); ctx.stroke();
      }
      var showLabel = n.kind !== "pessoa" || view.scale > 0.75 || n === hover || n === selected || nodes.size < 90;
      if (showLabel) {
        ctx.fillStyle = n.kind === "hub" ? "#111827" : "#334155";
        ctx.font = (n.kind === "hub" ? "bold 12px" : "11px") + " system-ui,sans-serif";
        ctx.textAlign = "center";
        var lines = splitLabel(n.label);
        lines.forEach(function (ln, k) { ctx.fillText(ln, p[0], p[1] + rad + 13 + k * 13); });
      }
      ctx.globalAlpha = 1;
    });
  }
  function splitLabel(s) {
    if (s.length <= 18) return [s];
    var words = s.split(" "), lines = [""];
    words.forEach(function (w) {
      var last = lines[lines.length - 1];
      if ((last + " " + w).trim().length > 18) lines.push(w);
      else lines[lines.length - 1] = (last + " " + w).trim();
    });
    return lines.slice(0, 2);
  }

  // ---------- interaction ----------
  function nodeAt(mx, my) {
    var r = canvas.getBoundingClientRect();
    var best = null, bestD = 1e9;
    nodes.forEach(function (n) {
      var p = toScreen(n.x, n.y);
      var d = Math.hypot(p[0] - mx, p[1] - my);
      if (d < n.r + 8 && d < bestD) { best = n; bestD = d; }
    });
    return best;
  }
  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  canvas.addEventListener("pointerdown", function (e) {
    canvas.setPointerCapture(e.pointerId);
    var m = canvasPos(e);
    lastPX = m[0]; lastPY = m[1]; moved = 0;
    dragNode = nodeAt(m[0], m[1]);
    panning = !dragNode;
  });
  canvas.addEventListener("pointermove", function (e) {
    var m = canvasPos(e);
    var dx = m[0] - lastPX, dy = m[1] - lastPY;
    lastPX = m[0]; lastPY = m[1];
    moved += Math.abs(dx) + Math.abs(dy);
    if (dragNode) {
      dragNode.x += dx / view.scale; dragNode.y += dy / view.scale;
      dragNode.vx = 0; dragNode.vy = 0;
    } else if (panning) {
      view.cx -= dx / view.scale; view.cy -= dy / view.scale;
    } else {
      var n = nodeAt(m[0], m[1]);
      if (n !== hover) {
        hover = n;
        canvas.style.cursor = n ? "pointer" : "grab";
        if (n) {
          var extra = n.kind === "pessoa" && n.ref.person
            ? " — " + n.ref.person.partido + (n.ref.person.uf ? " · " + n.ref.person.uf : "")
            : n.kind === "partido" ? " — clique para expandir" : n.kind === "uf" ? " — clique para expandir" : "";
          hint.textContent = n.label + extra;
        }
      }
    }
  });
  canvas.addEventListener("pointerup", function (e) {
    var wasDrag = moved > 5;
    var n = dragNode;
    dragNode = null; panning = false;
    if (!wasDrag && n) onNodeClick(n);
  });
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var f = e.deltaY < 0 ? 1.12 : 0.89;
    view.scale = Math.min(3.2, Math.max(0.3, view.scale * f));
  }, { passive: false });

  function onNodeClick(n) {
    selected = n;
    if (mode === "power" && n.kind === "pessoa" && n.ref.person) {
      buildPowerMap(n.ref.person);
      return;
    }
    if (n.kind === "pessoa" && n.ref.person) showPersonPanel(n.ref.person, null);
    else if (n.kind === "partido" || n.kind === "uf") { expandGroup(n); showGroupPanel(n); }
    else if (n.kind === "hub") showGroupPanel(n);
    else if (n.ref && n.ref.person) showPersonPanel(n.ref.person, null);
  }

  // ---------- UI wiring ----------
  function bindUI() {
    document.querySelectorAll("[data-gtab]").forEach(function (b) {
      b.addEventListener("click", function () {
        mode = b.getAttribute("data-gtab");
        document.querySelectorAll("[data-gtab]").forEach(function (x) {
          x.setAttribute("aria-selected", String(x === b));
        });
        searchInput.value = "";
        if (mode === "graph") buildGraph();
        else buildPowerMap(null);
      });
    });
    ["g-sen", "g-dep", "g-exe"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        if (mode === "graph") buildGraph();
        else {
          var q = searchInput.value.trim();
          buildPowerMap(q ? findPerson(q) : null);
        }
      });
    });
    document.getElementById("g-reset").addEventListener("click", function () {
      if (mode === "graph") buildGraph();
      else buildPowerMap(searchInput.value.trim() ? findPerson(searchInput.value.trim()) : null);
    });
    var lb = document.getElementById("g-legend-btn"), lg = document.getElementById("g-legend");
    lb.addEventListener("click", function () {
      var open = lg.hidden;
      lg.hidden = !open;
      lb.setAttribute("aria-expanded", String(open));
      lb.textContent = open ? "Legenda ▴" : "Legenda ▾";
    });
    var deb = null;
    searchInput.addEventListener("input", function () {
      clearTimeout(deb);
      deb = setTimeout(function () {
        var q = searchInput.value.trim();
        if (!q) return;
        var p = findPerson(q);
        if (!p) { hint.textContent = "Ninguém encontrado para \u201C" + q + "\u201D"; return; }
        if (mode === "power") buildPowerMap(p);
        else revealPerson(p);
      }, 350);
    });
    window.addEventListener("resize", resize);
  }

  function revealPerson(p) {
    // ensure their group is expanded, then center
    var on = housesOn();
    var gid = null;
    nodes.forEach(function (n) {
      if ((n.kind === "partido" && n.ref.party === p.partido) ||
          (n.kind === "uf" && p.uf && n.ref.uf === p.uf)) {
        if (!gid) gid = n.id;
      }
    });
    if (gid) {
      var g = nodes.get(gid);
      if (g && !g.expanded && partyMembers(null, p.partido, on).length + ufMembers(null, p.uf, on).length > 0) expandGroup(g);
    }
    var target = null;
    nodes.forEach(function (n) {
      if (n.kind === "pessoa" && n.ref.person && n.ref.person.id === p.id) target = n;
    });
    if (!target && gid) {
      // person beyond the 60-node expansion cap: pin them directly
      var g2 = nodes.get(gid);
      var pid = "p:" + gid + ":" + p.id;
      target = mkNode(pid, p.nome, "pessoa", COLORS[p.house] || COLORS.pessoa, 7, { person: p, gid: gid });
      target.x = g2.x + 50; target.y = g2.y + 50;
      link(gid, pid, 1);
    }
    if (target) {
      view.cx = target.x; view.cy = target.y; view.scale = Math.max(view.scale, 1.2);
      selected = target;
      showPersonPanel(p, null);
      hint.textContent = p.nome + " localizado no grafo";
    } else {
      hint.textContent = p.nome + " está fora do filtro atual (veja as caixas Senado/Câmara/Executivo)";
    }
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  load();
})();
