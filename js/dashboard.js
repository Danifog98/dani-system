/* =========================================================
   DANI SYSTEM — dashboard (Estado)
   Construye la pantalla principal: cabecera de sistema, player
   status, power, métricas vivas, matriz de atributos, arco,
   misión activa y actividad reciente.
   Todos los datos vienen del motor; aquí no se calcula nada.
   ========================================================= */

(function (global) {
  "use strict";

  var C = global.DS.config;
  var store = global.DS.store;
  var E = global.DS.engine;
  var Q = global.DS.quests;
  var B = global.DS.bosses;
  var R = global.DS.recommend;

  /* Utilidades compartidas con ui.js (se resuelven al ejecutar). */
  function H() {
    return global.DS.ui.h;
  }

  var clockTimer = null;

  /* =========================================================
     Cabecera del sistema
     Solo indicadores con significado real: la app está abierta,
     el almacenamiento responde y cuánto hace del último registro.
     ========================================================= */
  function systemHeader(snap) {
    var h = H();
    var box = h.el("div", "sys");

    var chips = h.el("div", "sys__chips");

    var online = h.el("div", "sys__chip sys__chip--live");
    online.appendChild(h.el("i", "sys__dot"));
    online.appendChild(h.el("span", null, "System online"));
    chips.appendChild(online);

    var last = E.lastActivity();
    var ago;
    if (last === null) ago = "sin registros";
    else {
      var mins = Math.floor((Date.now() - last) / 60000);
      ago =
        mins < 60
          ? "último registro " + mins + " min"
          : mins < 1440
          ? "último registro " + Math.floor(mins / 60) + " h"
          : "último registro " + Math.floor(mins / 1440) + " d";
    }
    var stream = h.el("div", "sys__chip");
    stream.appendChild(h.el("span", null, ago));
    chips.appendChild(stream);

    var data = h.el("div", "sys__chip");
    data.appendChild(h.el("span", null, h.num(snap.entries) + " registros"));
    chips.appendChild(data);

    box.appendChild(chips);

    /* Reloj real, se refresca cada minuto mientras la vista está abierta. */
    var clock = h.el("div", "sys__clock");
    var time = h.el("p", "sys__time num");
    var date = h.el("p", "sys__date");
    clock.appendChild(time);
    clock.appendChild(date);
    box.appendChild(clock);

    function tick() {
      var d = new Date();
      time.textContent =
        String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      date.textContent = h.fullDate(d.getTime());
    }
    tick();
    if (clockTimer) global.clearInterval(clockTimer);
    clockTimer = global.setInterval(function () {
      if (document.body.contains(time)) tick();
      else global.clearInterval(clockTimer);
    }, 30000);

    return box;
  }

  /* =========================================================
     Player status: nombre, nivel, rank y XP
     ========================================================= */
  function playerStatus(snap) {
    var h = H();
    var card = h.el("div", "ps");

    /* Esquinas de HUD. */
    ["tl", "tr", "bl", "br"].forEach(function (pos) {
      card.appendChild(h.el("i", "ps__corner ps__corner--" + pos));
    });

    var head = h.el("div", "ps__head");
    head.appendChild(h.el("p", "kicker", "Player status"));
    head.appendChild(h.el("p", "micro", "ID · DANI-01"));
    card.appendChild(head);

    var main = h.el("div", "ps__main");

    var idBox = h.el("div", "ps__id");
    idBox.appendChild(h.el("h1", "ps__name", store.get().user.name || "DANI"));

    var lv = h.el("div", "ps__lv");
    var lvv = h.el("p", "ps__lv-v num", String(snap.level.level).padStart(2, "0"));
    lv.appendChild(lvv);
    var lvl = h.el("div");
    lvl.appendChild(h.el("p", "kicker", "Level"));
    lvl.appendChild(
      h.el(
        "p",
        "micro",
        snap.level.max ? "nivel máximo" : h.num(snap.level.xpToNext) + " XP al siguiente"
      )
    );
    lv.appendChild(lvl);
    idBox.appendChild(lv);
    main.appendChild(idBox);

    /* Módulo de rank: hexágono con la letra y el avance dentro del rango. */
    var rank = h.el("div", "rankmod");
    rank.setAttribute("data-rank", snap.rank);
    var hex = h.el("div", "rankmod__hex");
    hex.appendChild(h.el("span", "rankmod__v", snap.rank));
    rank.appendChild(hex);
    rank.appendChild(h.el("p", "kicker", "Rank"));
    var rbar = h.el("div", "bar bar--thin rankmod__bar");
    var rfill = h.el("i");
    rfill.style.width = snap.rankPct + "%";
    rbar.appendChild(rfill);
    rank.appendChild(rbar);
    rank.appendChild(
      h.el(
        "p",
        "micro",
        snap.nextRank ? "→ " + snap.nextRank.id + " · " + Math.round(snap.rankPct) + "%" : "máximo"
      )
    );
    main.appendChild(rank);

    card.appendChild(main);

    /* XP */
    var xp = h.el("div", "ps__xp");
    var line = h.el("div", "ps__xp-line");
    var left = h.el("p", "ps__xp-v num");
    left.appendChild(h.el("span", "ps__xp-cur", h.num(snap.level.xpInto)));
    left.appendChild(
      h.el("span", "ps__xp-max", snap.level.max ? " XP" : " / " + h.num(snap.level.xpNeeded) + " XP")
    );
    line.appendChild(left);
    line.appendChild(h.el("p", "kicker", "Experiencia"));
    xp.appendChild(line);

    var bar = h.el("div", "bar bar--xp");
    var fill = h.el("i");
    fill.style.width = snap.level.pct + "%";
    fill.appendChild(h.el("b", "bar__sweep"));
    bar.appendChild(fill);
    xp.appendChild(bar);

    var foot = h.el("div", "ps__xp-foot");
    foot.appendChild(h.el("p", "micro", h.num(snap.totalXP) + " XP acumulados"));
    foot.appendChild(
      h.el("p", "micro", snap.level.max ? "" : Math.round(snap.level.pct) + "% del nivel")
    );
    xp.appendChild(foot);

    /* Ancla para el "+X XP" flotante. */
    xp.appendChild(h.el("div", "xpfloat", "")).setAttribute("data-xpfloat", "");
    card.appendChild(xp);

    return card;
  }

  /* =========================================================
     Total power con anillo
     ========================================================= */
  function powerModule(snap) {
    var h = H();
    var card = h.el("div", "pw");

    var ring = h.el("div", "pw__ring");
    /* El relleno del anillo es el avance dentro del rank actual. */
    ring.style.setProperty("--pct", Math.max(2, snap.rankPct) + "%");
    ring.appendChild(h.el("i", "pw__ring-track"));
    ring.appendChild(h.el("i", "pw__ring-fill"));
    ring.appendChild(h.el("i", "pw__ring-spin"));

    var core = h.el("div", "pw__core");
    core.appendChild(h.el("p", "pw__v num", h.num(snap.power)));
    core.appendChild(h.el("p", "kicker", "Power"));
    ring.appendChild(core);
    card.appendChild(ring);

    var side = h.el("div", "pw__side");
    side.appendChild(h.el("p", "kicker", "Power index"));
    side.appendChild(
      h.el(
        "p",
        "micro",
        "Σ(peso · dominio) + nivel · " + C.POWER.perLevel
      )
    );
    side.appendChild(
      h.el(
        "p",
        "pw__note",
        snap.nextRank
          ? "Rank " + snap.nextRank.id + " a " + h.num(snap.nextRank.min) + " power"
          : "Rank máximo alcanzado"
      )
    );
    card.appendChild(side);

    return card;
  }

  /* =========================================================
     Métricas vivas
     ========================================================= */
  function liveMetrics(snap) {
    var h = H();
    var a7 = E.getAnalytics("7d");
    var qs = Q.questStats();
    var bs = B.bossStats();
    var streak = E.streak(null);

    var grid = h.el("div", "metrics");

    function metric(k, v, sub, accent) {
      var box = h.el("div", "metric" + (accent ? " metric--accent" : ""));
      box.appendChild(h.el("p", "metric__k", k));
      box.appendChild(h.el("p", "metric__v num", v));
      box.appendChild(h.el("p", "metric__s", sub));
      return box;
    }

    grid.appendChild(metric("Hoy", h.signed(snap.today), "XP", true));
    grid.appendChild(metric("7 días", h.signed(a7.xp), "XP"));
    grid.appendChild(
      metric(
        "Misiones",
        qs.completedToday + "/" + (qs.completedToday + qs.activeToday),
        "completadas hoy"
      )
    );
    grid.appendChild(metric("Bosses", String(bs.active), bs.active === 1 ? "activo" : "activos"));
    grid.appendChild(metric("Racha", streak.current + "d", "máx " + streak.best + "d"));
    grid.appendChild(metric("Semana", h.signed(snap.week), "XP natural"));

    return grid;
  }

  /* =========================================================
     Matriz de atributos
     ========================================================= */
  function attributeMatrix(snap) {
    var h = H();
    var grid = h.el("div", "matrix");

    snap.stats.forEach(function (st) {
      var card = h.el("div", "attr");
      card.style.setProperty("--h", st.hue);
      card.setAttribute("tabindex", "0");

      var top = h.el("div", "attr__top");
      top.appendChild(h.el("p", "attr__n", st.stat));
      top.appendChild(h.el("p", "attr__lv num", "LV " + String(st.level).padStart(2, "0")));
      card.appendChild(top);

      var mid = h.el("div", "attr__mid");
      var xp = h.el("p", "attr__xp num");
      xp.appendChild(document.createTextNode(h.num(st.levelInto)));
      xp.appendChild(
        h.el("span", null, st.levelNeeded ? " / " + h.num(st.levelNeeded) : " XP")
      );
      mid.appendChild(xp);

      /* Mini gráfica de los últimos 7 días, solo si hubo actividad. */
      var series = E.xpSeries(7, st.id);
      var max = series.reduce(function (m, d) {
        return Math.max(m, d.xp);
      }, 0);
      if (max > 0) {
        var spark = h.el("div", "spark");
        series.forEach(function (d) {
          var b = h.el("i");
          b.style.height = Math.max(8, (d.xp / max) * 100) + "%";
          if (!d.xp) b.setAttribute("data-zero", "1");
          spark.appendChild(b);
        });
        mid.appendChild(spark);
      }
      card.appendChild(mid);

      var bar = h.el("div", "bar bar--thin bar--hue");
      var fill = h.el("i");
      fill.style.width = (st.xp > 0 ? Math.max(2, st.levelPct) : 0) + "%";
      bar.appendChild(fill);
      card.appendChild(bar);

      var foot = h.el("div", "attr__foot");
      foot.appendChild(h.el("span", null, h.num(st.xp) + " XP"));
      if (st.xp === 0) foot.appendChild(h.el("span", "delta--flat", "sin iniciar"));
      else if (st.neglected)
        foot.appendChild(h.el("span", "delta--idle", st.daysIdle + "d inactivo"));
      else if (st.growth > 0)
        foot.appendChild(h.el("span", "delta--up", "▲ " + h.pct1(st.growth) + "% / 7D"));
      else foot.appendChild(h.el("span", "delta--flat", "— 0% / 7D"));
      card.appendChild(foot);

      grid.appendChild(card);
    });

    return grid;
  }

  /* =========================================================
     Current arc (el boss principal)
     ========================================================= */
  function currentArcBoss() {
    var actives = B.all().filter(function (b) {
      return b.status !== B.STATUS.DEFEATED;
    });
    if (!actives.length) return null;

    var pinned = store.get().settings.arcId;
    for (var i = 0; i < actives.length; i++) {
      if (actives[i].id === pinned) return actives[i];
    }
    return actives.slice().sort(function (a, b) {
      return B.progress(b) - B.progress(a);
    })[0];
  }

  function arcModule() {
    var h = H();
    var boss = currentArcBoss();
    var wrap = h.el("div");

    if (!boss) {
      h.emptyState(
        wrap,
        "Sin arco activo",
        "Convierte tu objetivo grande en un boss con objetivos medibles.",
        "Crear boss",
        function () {
          global.DS.ui.go("bosses");
        }
      );
      return wrap;
    }

    var pct = B.progress(boss);
    var done = boss.tasks.filter(function (t) {
      return t.done;
    }).length;
    var pending = boss.tasks.filter(function (t) {
      return !t.done;
    });

    var card = h.el("div", "arc");
    card.style.setProperty("--h", (C.category(boss.category) || { hue: 195 }).hue);

    var top = h.el("div", "arc__top");
    var left = h.el("div");
    left.appendChild(
      h.el("p", "kicker", C.categoryName(boss.category) + " · " + boss.difficulty)
    );
    left.appendChild(h.el("p", "arc__name", boss.name));
    top.appendChild(left);
    var right = h.el("div", "arc__pctbox");
    right.appendChild(h.el("p", "arc__pct num", Math.round(pct) + "%"));
    right.appendChild(
      h.el("p", "micro", boss.tasks.length ? done + " / " + boss.tasks.length + " objetivos" : "")
    );
    top.appendChild(right);
    card.appendChild(top);

    var bar = h.el("div", "bar bar--hue");
    var fill = h.el("i");
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    card.appendChild(bar);

    if (pending.length) {
      var next = h.el("div", "arc__next");
      next.appendChild(h.el("p", "kicker", "Siguiente objetivo"));
      next.appendChild(h.el("p", "arc__nextv", pending[0].title));
      card.appendChild(next);
    }

    var foot = h.el("div", "arc__foot");
    var reward = h.el("div");
    reward.appendChild(h.el("p", "kicker", "Recompensa"));
    reward.appendChild(h.el("p", "arc__reward num", h.signed(boss.xp) + " XP"));
    foot.appendChild(reward);
    var open = h.el("button", "btn btn--ghost btn--sm btn--auto", "Ver boss");
    open.type = "button";
    open.addEventListener("click", function () {
      global.DS.ui.go("bosses");
    });
    foot.appendChild(open);
    card.appendChild(foot);

    wrap.appendChild(card);
    return wrap;
  }

  /* =========================================================
     Misión activa
     ========================================================= */
  function activeMission() {
    var h = H();
    var wrap = h.el("div");
    var actives = Q.daily().filter(function (q) {
      return q.status === Q.STATUS.ACTIVE;
    });

    if (!actives.length) {
      h.emptyState(wrap, "Sin misiones activas", "Crea la primera del día.", "Crear misión", function () {
        global.DS.ui.go("quests");
      });
      return wrap;
    }

    var q = actives[0];
    var card = h.el("div", "amission");
    card.style.setProperty("--h", (C.category(q.category) || { hue: 195 }).hue);

    var top = h.el("div", "amission__top");
    var left = h.el("div");
    left.appendChild(h.el("p", "kicker", "Active quest"));
    left.appendChild(h.el("p", "amission__t", q.title));
    left.appendChild(
      h.el(
        "p",
        "amission__m",
        [C.categoryName(q.category), q.difficulty, q.recurring ? "recurrente" : null]
          .filter(Boolean)
          .join(" · ")
      )
    );
    top.appendChild(left);
    top.appendChild(h.el("p", "amission__xp num", h.signed(q.xp) + " XP"));
    card.appendChild(top);

    if (q.target > 1) {
      var prog = h.el("div", "amission__prog");
      var bar = h.el("div", "bar bar--thin");
      var fill = h.el("i");
      fill.style.width = Math.min(100, (q.progress / q.target) * 100) + "%";
      bar.appendChild(fill);
      prog.appendChild(bar);
      prog.appendChild(h.el("span", "micro num", q.progress + "/" + q.target));
      card.appendChild(prog);
    }

    var actions = h.el("div", "actions");
    var comp = h.el("button", "btn", "Completar");
    comp.type = "button";
    comp.addEventListener("click", function () {
      Q.completeQuest(q.id);
    });
    actions.appendChild(comp);

    var more = h.el("button", "btn btn--ghost btn--sm btn--auto", "Ver todas");
    more.type = "button";
    more.addEventListener("click", function () {
      global.DS.ui.go("quests");
    });
    actions.appendChild(more);
    card.appendChild(actions);

    wrap.appendChild(card);
    return wrap;
  }

  /* =========================================================
     Avisos del sistema (recomendaciones)
     ========================================================= */
  function alerts() {
    var h = H();
    var wrap = h.el("div");
    var recs = R.visibleRecommendations();
    if (!recs.length) return wrap;

    recs.forEach(function (rec) {
      var card = h.el("div", "alert");
      card.style.setProperty("--h", (C.category(rec.category) || { hue: 195 }).hue);
      card.appendChild(h.el("p", "alert__kicker", "System alert · " + rec.kicker));
      card.appendChild(h.el("p", "alert__detail", rec.detail));
      card.appendChild(h.el("p", "alert__title", rec.title));
      card.appendChild(
        h.el("p", "alert__xp num", h.signed(rec.xp) + " XP · " + C.categoryName(rec.category))
      );

      var actions = h.el("div", "actions");
      var ok = h.el("button", "btn btn--sm", "Aceptar");
      ok.type = "button";
      ok.addEventListener("click", function () {
        var res = R.acceptRecommendation(rec);
        global.DS.ui.toast(
          "System",
          res.ok
            ? "Misión creada · " + rec.title
            : res.reason === "limit"
            ? "Máximo " + C.LIMITS.dailyQuests + " misiones diarias activas"
            : "No se pudo crear la misión"
        );
      });
      actions.appendChild(ok);

      var no = h.el("button", "btn btn--ghost btn--sm", "Descartar");
      no.type = "button";
      no.addEventListener("click", function () {
        R.dismiss(rec.id);
      });
      actions.appendChild(no);
      card.appendChild(actions);
      wrap.appendChild(card);
    });

    return wrap;
  }

  /* =========================================================
     Actividad reciente
     ========================================================= */
  function recentActivity() {
    var h = H();
    var wrap = h.el("div");
    var days = E.activityLog({ limitDays: 3 });

    if (!days.length) {
      h.emptyState(wrap, "Sin actividad", "Registra tu primera acción del día.", "Registrar", function () {
        global.DS.ui.go("log");
      });
      return wrap;
    }

    var list = h.el("div", "list");
    var shown = 0;
    days.forEach(function (d) {
      d.items.forEach(function (t) {
        if (shown >= 6) return;
        shown++;
        list.appendChild(h.entryRow(t, { compact: true }));
      });
    });
    wrap.appendChild(list);
    return wrap;
  }

  /* =========================================================
     Composición
     ========================================================= */
  function section(title, note, node, extraClass) {
    var h = H();
    var block = h.el("div", "block" + (extraClass ? " " + extraClass : ""));
    if (title) {
      var head = h.el("div", "sec sec--tight");
      head.appendChild(h.el("p", "kicker", title));
      if (note) head.appendChild(note.nodeType ? note : h.el("p", "micro", note));
      block.appendChild(head);
    }
    block.appendChild(node);
    return block;
  }

  function render(host) {
    var h = H();
    var snap = E.snapshot();
    host.textContent = "";

    var dash = h.el("div", "dash");

    dash.appendChild(section(null, null, systemHeader(snap), "block--sys"));
    dash.appendChild(section(null, null, playerStatus(snap), "block--ps"));
    dash.appendChild(section("Total power", null, powerModule(snap), "block--pw"));
    dash.appendChild(section("Live metrics", "datos reales", liveMetrics(snap), "block--metrics"));
    dash.appendChild(section("Current arc", null, arcModule(), "block--arc"));
    dash.appendChild(section("Misión activa", null, activeMission(), "block--mission"));

    var al = alerts();
    if (al.childNodes.length) dash.appendChild(section(null, null, al, "block--alerts"));

    dash.appendChild(
      section("Attribute matrix", "9 atributos", attributeMatrix(snap), "block--matrix")
    );

    var seeAll = h.el("button", "link", "Ver historial");
    seeAll.type = "button";
    seeAll.addEventListener("click", function () {
      global.DS.ui.go("history");
    });
    dash.appendChild(section("Actividad reciente", seeAll, recentActivity(), "block--recent"));

    host.appendChild(dash);
  }

  /* "+X XP" flotante junto al contador de experiencia. */
  function floatXP(amount) {
    var host = document.querySelector("[data-xpfloat]");
    if (!host) return;
    var node = document.createElement("span");
    node.className = "xpfloat__v";
    node.textContent = (amount >= 0 ? "+" : "") + Math.round(amount) + " XP";
    if (amount < 0) node.setAttribute("data-neg", "1");
    host.appendChild(node);
    global.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 1400);
  }

  global.DS.dashboard = { render: render, floatXP: floatXP, currentArc: currentArcBoss };
})(window);
