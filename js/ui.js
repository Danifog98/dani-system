/* =========================================================
   DANI SYSTEM — interfaz
   Solo presentación: navegación, render y feedback. Ningún
   cálculo vive aquí; todo viene de engine.js y los motores.
   ========================================================= */

(function (global) {
  "use strict";

  var C = global.DS.config;
  var store = global.DS.store;
  var E = global.DS.engine;
  var Q = global.DS.quests;
  var B = global.DS.bosses;
  var P = global.DS.progress;
  var F = global.DS.finance;
  var T = global.DS.trading;
  var R = global.DS.recommend;
  var L = global.DS.lock;

  /* =========================================================
     Utilidades de DOM y formato
     ========================================================= */
  function $(s, c) {
    return (c || document).querySelector(s);
  }
  function $$(s, c) {
    return Array.prototype.slice.call((c || document).querySelectorAll(s));
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function hue(node, catId) {
    var c = C.category(catId);
    node.style.setProperty("--h", c ? c.hue : 195);
    return node;
  }
  function num(n) {
    return Math.round(Number(n) || 0).toLocaleString("es-ES");
  }
  function signed(n) {
    return (n >= 0 ? "+" : "") + num(n);
  }
  function pct1(n) {
    return (Number(n) || 0).toFixed(1).replace(".", ",");
  }
  function statNames(list) {
    return list
      .map(function (n) {
        return n.stat;
      })
      .join(" · ");
  }

  var MONTHS = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  var DAYS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

  function dayLabel(ts) {
    var d = new Date(ts);
    var today = E.startOfDay(Date.now()).getTime();
    var that = E.startOfDay(d).getTime();
    if (that === today) return "HOY";
    if (that === today - E.DAY) return "AYER";
    return d.getDate() + " " + MONTHS[d.getMonth()];
  }
  function timeLabel(ts) {
    var d = new Date(ts);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function fullDate(ts) {
    var d = new Date(ts);
    return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
  }

  var reduced =
    global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Cifra que se anima al cambiar de valor. */
  var lastValues = {};

  function setNumber(sel, value, format) {
    var node = $(sel);
    if (!node) return;
    var fmt = format || num;
    var prev = lastValues[sel];
    lastValues[sel] = value;

    if (reduced || prev === undefined || prev === value) {
      node.textContent = fmt(value);
      return;
    }

    var start = 0;
    node.classList.remove("tick");
    void node.offsetWidth;
    node.classList.add("tick");

    function frame(ts) {
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / 420);
      var eased = 1 - Math.pow(1 - t, 3);
      node.textContent = fmt(prev + (value - prev) * eased);
      if (t < 1) global.requestAnimationFrame(frame);
      else node.textContent = fmt(value);
    }
    global.requestAnimationFrame(frame);
  }

  /* Estado vacío: título, subtítulo y una acción. Nunca datos falsos. */
  function emptyState(host, title, sub, ctaText, onClick) {
    var box = el("div", "empty");
    box.appendChild(el("p", "empty__t", title));
    if (sub) box.appendChild(el("p", "empty__s", sub));
    if (ctaText) {
      var b = el("button", "btn btn--auto", ctaText);
      b.type = "button";
      b.addEventListener("click", onClick);
      box.appendChild(b);
    }
    host.appendChild(box);
    return box;
  }

  /* =========================================================
     Feedback: toasts y overlay de hito
     ========================================================= */
  var Toast = {
    host: null,
    show: function (kicker, text) {
      if (!Toast.host) Toast.host = $("[data-toasts]");
      var t = el("div", "toast");
      t.appendChild(el("p", "toast__k", kicker || "System"));
      t.appendChild(el("p", "toast__v", text));
      Toast.host.appendChild(t);
      global.setTimeout(function () {
        t.className = "toast toast--out";
        global.setTimeout(function () {
          if (t.parentNode) t.parentNode.removeChild(t);
        }, 280);
      }, 2500);
    }
  };

  var Flash = {
    queue: [],
    busy: false,
    push: function (kicker, value, sub, variant) {
      Flash.queue.push([kicker, value, sub, variant]);
      Flash.next();
    },
    next: function () {
      if (Flash.busy || !Flash.queue.length) return;
      var item = Flash.queue.shift();
      Flash.busy = true;
      var node = $("[data-flash]");
      $("[data-flash-k]").textContent = item[0];
      $("[data-flash-v]").textContent = item[1];
      $("[data-flash-sub]").textContent = item[2] || "";
      node.className = "flash" + (item[3] ? " flash--" + item[3] : "");
      node.hidden = false;

      var close = function () {
        node.hidden = true;
        Flash.busy = false;
        node.removeEventListener("click", close);
        global.setTimeout(function () {
          Flash.next();
          if (!Flash.busy && !Flash.queue.length && current !== "dashboard") go("dashboard");
        }, 120);
      };
      node.addEventListener("click", close);
      global.setTimeout(close, 1600);
    }
  };

  /* Un único punto de escucha de los eventos del motor. */
  E.on(function (events) {
    events.forEach(function (ev) {
      if (ev.type === "xp") {
        Toast.show("System", signed(ev.amount) + " XP · " + ev.label);
      } else if (ev.type === "quest") {
        Toast.show(
          "Quest completed",
          (ev.questType === "weekly" ? "Weekly · " : "Daily · ") + ev.title
        );
      } else if (ev.type === "level") {
        Flash.push("Level up", "LV " + ev.to, "Level " + ev.from + " → " + ev.to);
      } else if (ev.type === "rank") {
        Flash.push("Rank up", ev.to, "Rank " + ev.from + " → " + ev.to);
      } else if (ev.type === "boss") {
        Flash.push("Boss defeated", ev.name, signed(ev.xp) + " XP", "boss");
      } else if (ev.type === "milestone") {
        Flash.push("Milestone", F.fmt(ev.value), "Patrimonio alcanzado");
      } else if (ev.type === "achievement") {
        Toast.show("Achievement unlocked", ev.name + " · " + ev.desc);
      } else if (ev.type === "skill") {
        Toast.show("Skill unlocked", ev.name + " · " + ev.desc);
      }
    });
  });

  /* =========================================================
     ESTADO
     ========================================================= */
  function renderDashboard() {
    var s = E.snapshot();

    $("[data-name]").textContent = store.get().user.name || "DANI";
    $("[data-level]").textContent = String(s.level.level).padStart(2, "0");
    $("[data-rank-badge]").textContent = "Rank " + s.rank;

    setNumber("[data-xp-into]", s.level.xpInto);
    $("[data-xp-needed]").textContent = s.level.max
      ? " XP · máximo"
      : " / " + num(s.level.xpNeeded) + " XP";
    $("[data-xp-next]").textContent = s.level.max
      ? ""
      : num(s.level.xpToNext) + " para LV " + (s.level.level + 1);
    $("[data-xp-bar]").style.width = s.level.pct + "%";

    setNumber("[data-power]", s.power);
    $("[data-power-note]").textContent = s.nextRank
      ? "Rank " + s.nextRank.id + " a " + num(s.nextRank.min) + " power"
      : "Rank máximo alcanzado";

    /* Hoy */
    var qs = Q.questStats();
    var streak = E.streak(null);
    $("[data-today-date]").textContent = fullDate(Date.now());
    setNumber("[data-t-today]", s.today, signed);
    setNumber("[data-t-week]", s.week, signed);
    $("[data-t-quests]").textContent =
      qs.completedToday + (qs.activeToday ? "/" + (qs.completedToday + qs.activeToday) : "");
    var st = $("[data-t-streak]");
    st.textContent = String(streak.current);
    st.appendChild(el("small", null, "D"));

    renderArc();
    renderAlerts();
    renderStats(s.stats);
    renderRecent();

    $("[data-stats-note]").textContent = "9 atributos";
  }

  /* ---------- Current arc ----------
     El arco es el boss marcado como principal; si no hay ninguno
     marcado, el activo más avanzado. Cambiarlo es fijar settings.arcId. */
  function currentArc() {
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

  function renderArc() {
    var host = $("[data-arc]");
    host.textContent = "";
    var boss = currentArc();

    if (!boss) {
      $("[data-arc-note]").textContent = "";
      emptyState(
        host,
        "Sin arco activo",
        "Convierte tu objetivo grande en un boss con objetivos medibles.",
        "Crear boss",
        function () {
          go("bosses");
          $("[data-boss-form]").hidden = false;
          $("[data-b-name]").focus();
        }
      );
      return;
    }

    var pct = B.progress(boss);
    var done = boss.tasks.filter(function (t) {
      return t.done;
    }).length;

    $("[data-arc-note]").textContent = boss.difficulty;

    var card = hue(el("div", "arc"), boss.category);
    var top = el("div", "arc__top");
    var left = el("div");
    left.appendChild(el("p", "kicker", C.categoryName(boss.category)));
    left.appendChild(el("p", "arc__name", boss.name));
    top.appendChild(left);
    top.appendChild(el("p", "arc__pct num", Math.round(pct) + "%"));
    card.appendChild(top);

    var bar = el("div", "bar bar--hue arc__bar");
    var fill = el("i");
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    card.appendChild(bar);

    var foot = el("div", "arc__foot");
    foot.appendChild(
      el(
        "p",
        "micro",
        boss.tasks.length ? done + " de " + boss.tasks.length + " objetivos" : "Sin objetivos"
      )
    );
    var go2 = el("button", "link", "Abrir →");
    go2.type = "button";
    go2.addEventListener("click", function () {
      go("bosses");
    });
    foot.appendChild(go2);
    card.appendChild(foot);

    host.appendChild(card);
  }

  /* ---------- Avisos ---------- */
  function renderAlerts() {
    var host = $("[data-alerts]");
    host.textContent = "";
    var recs = R.visibleRecommendations();
    if (!recs.length) return;

    var head = el("div", "sec");
    head.appendChild(el("p", "kicker", "System alert"));
    head.appendChild(el("p", "micro", recs.length === 1 ? "1 aviso" : recs.length + " avisos"));
    host.appendChild(head);

    recs.forEach(function (rec) {
      var card = hue(el("div", "alert"), rec.category);
      card.appendChild(el("p", "alert__kicker", rec.kicker));
      card.appendChild(el("p", "alert__detail", rec.detail));
      card.appendChild(el("p", "alert__title", rec.title));
      card.appendChild(
        el("p", "alert__xp num", signed(rec.xp) + " XP · " + C.categoryName(rec.category))
      );

      var actions = el("div", "actions");
      var ok = el("button", "btn btn--sm", "Aceptar");
      ok.type = "button";
      ok.addEventListener("click", function () {
        var res = R.acceptRecommendation(rec);
        Toast.show(
          "System",
          res.ok
            ? "Misión creada · " + rec.title
            : res.reason === "limit"
            ? "Máximo " + C.LIMITS.dailyQuests + " misiones diarias activas"
            : "No se pudo crear la misión"
        );
      });
      actions.appendChild(ok);

      var no = el("button", "btn btn--ghost btn--sm", "Descartar");
      no.type = "button";
      no.addEventListener("click", function () {
        R.dismiss(rec.id);
      });
      actions.appendChild(no);
      card.appendChild(actions);

      host.appendChild(card);
    });
  }

  /* ---------- Stats ---------- */
  function renderStats(stats) {
    var host = $("[data-stats]");
    host.textContent = "";

    stats.forEach(function (st) {
      var card = el("div", "stat");
      card.style.setProperty("--h", st.hue);

      var top = el("div", "stat__top");
      top.appendChild(el("p", "stat__name", st.stat));
      top.appendChild(el("p", "stat__lv num", "LV " + String(st.level).padStart(2, "0")));
      card.appendChild(top);

      var xp = el("p", "stat__xp num");
      xp.appendChild(document.createTextNode(num(st.levelInto)));
      xp.appendChild(
        el("span", null, st.levelNeeded ? " / " + num(st.levelNeeded) + " XP" : " XP")
      );
      card.appendChild(xp);

      var bar = el("div", "bar bar--thin bar--hue");
      var fill = el("i");
      fill.style.width = (st.xp > 0 ? Math.max(2, st.levelPct) : 0) + "%";
      bar.appendChild(fill);
      card.appendChild(bar);

      var foot = el("div", "stat__foot");
      foot.appendChild(el("span", null, num(st.xp) + " XP totales"));

      var right;
      if (st.xp === 0) {
        right = el("span", "delta--flat", "Sin iniciar");
      } else if (st.neglected) {
        right = el("span", "delta--idle", st.daysIdle + "D inactivo");
      } else if (st.growth > 0) {
        right = el("span", "delta--up", "▲ " + pct1(st.growth) + "% / 7D");
      } else {
        right = el("span", "delta--flat", "— 0% / 7D");
      }
      foot.appendChild(right);
      card.appendChild(foot);

      host.appendChild(card);
    });
  }

  /* ---------- Actividad reciente ---------- */
  function renderRecent() {
    var host = $("[data-recent]");
    host.textContent = "";
    var days = E.activityLog({ limitDays: 2 });

    if (!days.length) {
      emptyState(host, "Sin actividad", "Registra tu primera acción del día.", "Registrar", function () {
        go("log");
      });
      return;
    }

    var list = el("div", "list");
    var shown = 0;
    days.forEach(function (d) {
      d.items.forEach(function (t) {
        if (shown >= 5) return;
        shown++;
        list.appendChild(entryRow(t, { compact: true }));
      });
    });
    host.appendChild(list);
  }

  /* ---------- Rachas (vista de análisis) ---------- */
  function renderStreaks() {
    var host = $("[data-streaks]");
    if (!host) return;
    host.textContent = "";
    E.getStreaks().forEach(function (s) {
      var box = el("div", "tile" + (s.current > 0 ? " tile--accent" : ""));
      box.appendChild(el("p", "tile__k", s.label));
      var v = el("p", "tile__v num", String(s.current));
      v.appendChild(el("small", null, "D · MAX " + s.best));
      box.appendChild(v);
      host.appendChild(box);
    });
  }

  /* =========================================================
     MISIONES
     ========================================================= */
  function missionCard(q) {
    var done = q.status === Q.STATUS.COMPLETED;
    var dead = q.status === Q.STATUS.FAILED || q.status === Q.STATUS.SKIPPED;
    var card = hue(
      el("div", "mission" + (done ? " mission--done" : dead ? " mission--dead" : "")),
      q.category
    );

    var top = el("div", "mission__top");
    var left = el("div");
    left.appendChild(el("p", "mission__kicker", C.categoryName(q.category)));
    left.appendChild(el("p", "mission__title", q.title));
    top.appendChild(left);
    top.appendChild(el("p", "mission__xp num", signed(q.xp) + " XP"));
    card.appendChild(top);

    var bits = [q.difficulty];
    if (q.recurring) bits.push("Recurrente");
    if (done && q.completedAt) bits.push("Hecha " + timeLabel(q.completedAt));
    if (dead) bits.push(q.status === Q.STATUS.SKIPPED ? "Saltada" : "Fallada");
    card.appendChild(el("p", "mission__meta", bits.join(" · ")));

    if (q.description) card.appendChild(el("p", "mission__desc", q.description));

    if (q.target > 1) {
      var wrap = el("div", "mission__progress");
      var bar = el("div", "bar bar--thin");
      var fill = el("i");
      fill.style.width = Math.min(100, (q.progress / q.target) * 100) + "%";
      bar.appendChild(fill);
      wrap.appendChild(bar);
      wrap.appendChild(el("span", "mission__count num", q.progress + "/" + q.target));
      card.appendChild(wrap);
    }

    var actions = el("div", "actions");

    if (!done && !dead) {
      if (q.target > 1) {
        var plus = el("button", "btn btn--ghost btn--sm", "+1");
        plus.type = "button";
        plus.addEventListener("click", function () {
          Q.addProgress(q.id, 1);
        });
        actions.appendChild(plus);
      }

      var comp = el("button", "btn btn--sm", "Completar");
      comp.type = "button";
      comp.addEventListener("click", function () {
        Q.completeQuest(q.id);
      });
      actions.appendChild(comp);

      var skip = el("button", "btn btn--ghost btn--sm", "Saltar");
      skip.type = "button";
      skip.addEventListener("click", function () {
        Q.skipQuest(q.id);
        Toast.show("System", "Misión saltada");
      });
      actions.appendChild(skip);
    }

    var del = el("button", "icon-btn", "✕");
    del.type = "button";
    del.setAttribute("aria-label", "Eliminar misión");
    del.addEventListener("click", function () {
      if (!global.confirm("¿Eliminar la misión y su XP asociado?")) return;
      Q.deleteQuest(q.id);
      Toast.show("System", "Misión eliminada");
    });
    actions.appendChild(del);
    card.appendChild(actions);

    return card;
  }

  function renderMissionList(host, list, title, sub) {
    host.textContent = "";
    if (!list.length) {
      emptyState(host, title, sub, "Crear misión", function () {
        $("[data-new-form]").hidden = false;
        $("[data-q-title]").focus();
      });
      return;
    }
    var order = { ACTIVE: 0, COMPLETED: 1, SKIPPED: 2, FAILED: 3 };
    list
      .slice()
      .sort(function (a, b) {
        return (order[a.status] || 0) - (order[b.status] || 0);
      })
      .forEach(function (q) {
        host.appendChild(missionCard(q));
      });
  }

  function renderQuests() {
    var d = Q.daily();
    var w = Q.weekly();

    renderMissionList($("[data-daily]"), d, "No active quests", "Máximo 5 misiones diarias activas.");
    renderMissionList($("[data-weekly]"), w, "No weekly quests", "Objetivos de la semana con bonus de XP.");

    var activeD = d.filter(function (q) {
      return q.status === Q.STATUS.ACTIVE;
    }).length;
    $("[data-daily-count]").textContent = activeD + "/" + C.LIMITS.dailyQuests + " activas";
    $("[data-weekly-count]").textContent = w.length
      ? w.filter(function (q) {
          return q.status === Q.STATUS.COMPLETED;
        }).length +
        "/" +
        w.length +
        " completadas"
      : "";
  }

  var qDraft = { type: "daily" };

  function initQuestForm() {
    var cat = $("[data-q-cat]");
    C.CATEGORIES.forEach(function (c) {
      var o = el("option", null, c.stat);
      o.value = c.id;
      cat.appendChild(o);
    });

    var diff = $("[data-q-diff]");
    C.DIFFICULTIES.forEach(function (d) {
      var o = el("option", null, d);
      o.value = d;
      if (d === "NORMAL") o.selected = true;
      diff.appendChild(o);
    });

    function syncXP() {
      $("[data-q-xp]").value = Q.defaultXP(qDraft.type, diff.value);
    }
    syncXP();
    diff.addEventListener("change", syncXP);

    $$("[data-qtype]").forEach(function (b) {
      b.addEventListener("click", function () {
        qDraft.type = b.getAttribute("data-qtype");
        $$("[data-qtype]").forEach(function (x) {
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        syncXP();
      });
    });

    $("[data-new-toggle]").addEventListener("click", function () {
      var form = $("[data-new-form]");
      form.hidden = !form.hidden;
      if (!form.hidden) $("[data-q-title]").focus();
    });

    $("[data-q-save]").addEventListener("click", function () {
      var res = Q.createQuest({
        type: qDraft.type,
        title: $("[data-q-title]").value,
        description: $("[data-q-desc]").value,
        category: cat.value,
        difficulty: diff.value,
        xp: $("[data-q-xp]").value,
        target: $("[data-q-target]").value,
        recurring: $("[data-q-recurring]").checked
      });

      if (!res.ok) {
        Toast.show(
          "System",
          res.reason === "limit"
            ? "Máximo " + C.LIMITS.dailyQuests + " misiones diarias activas"
            : res.reason === "title"
            ? "Falta el título"
            : "No se pudo crear la misión"
        );
        return;
      }

      $("[data-q-title]").value = "";
      $("[data-q-desc]").value = "";
      $("[data-q-target]").value = "1";
      $("[data-q-recurring]").checked = false;
      $("[data-new-form]").hidden = true;
      Toast.show("System", "Misión creada · " + res.quest.title);
    });
  }

  /* =========================================================
     BOSSES
     ========================================================= */
  function bossCard(b) {
    var pct = B.progress(b);
    var done = b.status === B.STATUS.DEFEATED;
    var card = hue(el("div", "boss" + (done ? " boss--done" : "")), b.category);

    var top = el("div", "boss__top");
    var left = el("div");
    left.appendChild(el("p", "kicker", done ? "Boss derrotado" : "Boss"));
    left.appendChild(el("p", "boss__name", b.name));
    top.appendChild(left);
    top.appendChild(el("span", "badge", b.difficulty));
    card.appendChild(top);

    if (b.description) card.appendChild(el("p", "boss__desc", b.description));

    var hp = el("div", "boss__hp");
    var line = el("div", "boss__hp-line");
    line.appendChild(el("p", "kicker", done ? "Derrotado" : "HP restante"));
    line.appendChild(el("p", "boss__hp-v num", Math.round(done ? 0 : 100 - pct) + "%"));
    hp.appendChild(line);
    var bar = el("div", "bar bar--hue");
    var fill = el("i");
    fill.style.width = (done ? 0 : 100 - pct) + "%";
    bar.appendChild(fill);
    hp.appendChild(bar);
    card.appendChild(hp);

    if (b.tasks.length) {
      var head = el("div", "boss__hp-line");
      head.style.marginTop = "var(--s4)";
      head.appendChild(el("p", "kicker", "Objetivos"));
      head.appendChild(
        el(
          "p",
          "micro num",
          b.tasks.filter(function (t) {
            return t.done;
          }).length +
            "/" +
            b.tasks.length
        )
      );
      card.appendChild(head);

      var list = el("div", "objectives");
      b.tasks.forEach(function (t) {
        var row = el("label", "objective" + (t.done ? " objective--done" : ""));
        var cb = el("input");
        cb.type = "checkbox";
        cb.checked = t.done;
        cb.disabled = done;
        cb.addEventListener("change", function () {
          B.completeBossTask(b.id, t.id, cb.checked);
        });
        row.appendChild(cb);
        row.appendChild(el("span", "objective__t", t.title));
        if (!done) {
          var x = el("button", "objective__x", "✕");
          x.type = "button";
          x.setAttribute("aria-label", "Quitar objetivo");
          x.addEventListener("click", function (ev) {
            ev.preventDefault();
            B.removeTask(b.id, t.id);
          });
          row.appendChild(x);
        }
        list.appendChild(row);
      });
      card.appendChild(list);
    }

    var foot = el("div", "boss__foot");
    var reward = el("div");
    reward.appendChild(el("p", "kicker", "Recompensa"));
    reward.appendChild(el("p", "boss__reward num", signed(b.xp) + " XP"));
    foot.appendChild(reward);

    var actions = el("div", "boss__actions");
    if (!done) {
      var add = el("button", "btn btn--ghost btn--sm btn--auto", "+ Objetivo");
      add.type = "button";
      add.addEventListener("click", function () {
        var title = global.prompt("Nuevo objetivo");
        if (title) B.addTask(b.id, title);
      });
      actions.appendChild(add);

      var kill = el("button", "btn btn--sm btn--auto", "Derrotar");
      kill.type = "button";
      kill.addEventListener("click", function () {
        B.defeatBoss(b.id);
      });
      actions.appendChild(kill);
    }

    var del = el("button", "icon-btn", "✕");
    del.type = "button";
    del.setAttribute("aria-label", "Eliminar boss");
    del.addEventListener("click", function () {
      if (!global.confirm("¿Eliminar el boss y su XP asociado?")) return;
      B.deleteBoss(b.id);
      Toast.show("System", "Boss eliminado");
    });
    actions.appendChild(del);
    foot.appendChild(actions);
    card.appendChild(foot);

    return card;
  }

  function renderBosses() {
    var host = $("[data-boss-list]");
    host.textContent = "";
    var list = B.all();

    var openForm = function () {
      $("[data-boss-form]").hidden = false;
      $("[data-b-name]").focus();
    };

    if (!list.length) {
      emptyState(
        host,
        "No active bosses",
        "Un boss es un problema grande partido en objetivos.",
        "Crear boss",
        openForm
      );
      return;
    }

    var active = list.filter(function (b) {
      return b.status !== B.STATUS.DEFEATED;
    });
    var dead = list.filter(function (b) {
      return b.status === B.STATUS.DEFEATED;
    });

    if (active.length) {
      active.forEach(function (b) {
        host.appendChild(bossCard(b));
      });
    } else {
      emptyState(host, "No active bosses", "Todos derrotados. Define el siguiente.", "Crear boss", openForm);
    }

    if (dead.length) {
      var head = el("div", "sec");
      head.appendChild(el("p", "kicker", "Derrotados"));
      head.appendChild(el("p", "micro", dead.length + " en total"));
      host.appendChild(head);
      dead.forEach(function (b) {
        host.appendChild(bossCard(b));
      });
    }
  }

  function initBossForm() {
    var cat = $("[data-b-cat]");
    C.CATEGORIES.forEach(function (c) {
      var o = el("option", null, c.stat);
      o.value = c.id;
      cat.appendChild(o);
    });

    var diff = $("[data-b-diff]");
    C.DIFFICULTIES.forEach(function (d) {
      var o = el("option", null, d);
      o.value = d;
      if (d === "NORMAL") o.selected = true;
      diff.appendChild(o);
    });

    function syncXP() {
      $("[data-b-xp]").value = B.defaultXP(diff.value);
    }
    syncXP();
    diff.addEventListener("change", syncXP);

    $("[data-boss-toggle]").addEventListener("click", function () {
      var f = $("[data-boss-form]");
      f.hidden = !f.hidden;
      if (!f.hidden) $("[data-b-name]").focus();
    });

    $("[data-b-save]").addEventListener("click", function () {
      var res = B.createBoss({
        name: $("[data-b-name]").value,
        description: $("[data-b-desc]").value,
        category: cat.value,
        difficulty: diff.value,
        xp: $("[data-b-xp]").value,
        tasks: $("[data-b-tasks]").value.split("\n")
      });
      if (!res.ok) {
        Toast.show("System", res.reason === "name" ? "Falta el nombre" : "No se pudo crear el boss");
        return;
      }
      $("[data-b-name]").value = "";
      $("[data-b-desc]").value = "";
      $("[data-b-tasks]").value = "";
      $("[data-boss-form]").hidden = true;
      Toast.show("System", "Boss creado · " + res.boss.name);
    });
  }

  /* =========================================================
     DESBLOQUEOS
     ========================================================= */
  var segment = "skills";

  function unlockCard(u) {
    var card = el("div", "unlock" + (u.unlocked ? " unlock--on" : ""));
    var top = el("div", "unlock__top");
    top.appendChild(el("p", "unlock__n", u.name));
    top.appendChild(
      el("span", "badge " + (u.unlocked ? "badge--accent" : ""), u.unlocked ? "OK" : "Locked")
    );
    card.appendChild(top);
    card.appendChild(el("p", "unlock__d", u.desc));

    if (u.unlocked) {
      card.appendChild(
        el(
          "p",
          "unlock__m",
          [u.unlockedAt ? dayLabel(u.unlockedAt) : "", u.xp ? signed(u.xp) + " XP" : ""]
            .filter(Boolean)
            .join(" · ")
        )
      );
    } else {
      var bar = el("div", "bar bar--thin");
      var fill = el("i");
      fill.style.width = Math.round(u.progress * 100) + "%";
      bar.appendChild(fill);
      card.appendChild(bar);
      card.appendChild(el("p", "unlock__m", Math.round(u.progress * 100) + "% del requisito"));
    }
    return card;
  }

  function renderUnlocks() {
    var c = P.counts();
    var skills = $("[data-skills]");
    var achs = $("[data-achievements]");
    skills.textContent = "";
    achs.textContent = "";

    P.list("skill").forEach(function (u) {
      skills.appendChild(unlockCard(u));
    });
    P.list("achievement").forEach(function (u) {
      achs.appendChild(unlockCard(u));
    });

    $("[data-sec-skills]").hidden = segment !== "skills";
    $("[data-sec-achievements]").hidden = segment !== "achievements";
    $$("[data-seg-btn]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-seg-btn") === segment ? "true" : "false");
    });

    $("[data-unlock-count]").textContent =
      segment === "skills"
        ? c.skills.unlocked + "/" + c.skills.total + " skills"
        : c.achievements.unlocked + "/" + c.achievements.total + " logros";
  }

  function initSegments() {
    $$("[data-seg-btn]").forEach(function (b) {
      b.addEventListener("click", function () {
        segment = b.getAttribute("data-seg-btn");
        renderUnlocks();
      });
    });
  }

  /* =========================================================
     ANÁLISIS
     ========================================================= */
  var RANGES = [
    { id: "today", label: "Hoy", days: 7 },
    { id: "7d", label: "7 días", days: 7 },
    { id: "30d", label: "30 días", days: 30 },
    { id: "all", label: "Todo", days: 30 }
  ];
  var range = "7d";

  function currentRange() {
    for (var i = 0; i < RANGES.length; i++) {
      if (RANGES[i].id === range) return RANGES[i];
    }
    return RANGES[1];
  }

  function renderRanges() {
    var host = $("[data-ranges]");
    host.textContent = "";
    RANGES.forEach(function (r) {
      var b = el("button", "chip", r.label);
      b.type = "button";
      b.setAttribute("aria-pressed", range === r.id ? "true" : "false");
      b.addEventListener("click", function () {
        range = r.id;
        renderAnalytics();
      });
      host.appendChild(b);
    });
  }

  function drawChart(host, xs, series) {
    var max = series.reduce(function (m, d) {
      return Math.max(m, d.xp);
    }, 0);
    host.textContent = "";
    xs.textContent = "";
    var step = series.length > 20 ? 5 : 2;

    series.forEach(function (d, i) {
      var col = el("div", "chart__col");
      var bar = el("i", "chart__bar");
      bar.style.height = (max > 0 ? Math.max(2, (d.xp / max) * 100) : 2) + "%";
      if (!d.xp) bar.setAttribute("data-zero", "1");
      bar.title = num(d.xp) + " XP";
      col.appendChild(bar);
      host.appendChild(col);

      var day = new Date(d.ts).getDate();
      xs.appendChild(
        el("span", null, i % step === 0 || i === series.length - 1 ? String(day) : "")
      );
    });
  }

  function tile(k, v, accent) {
    var box = el("div", "tile" + (accent ? " tile--accent" : ""));
    box.appendChild(el("p", "tile__k", k));
    box.appendChild(el("p", "tile__v num", v));
    return box;
  }

  function renderAnalytics() {
    renderRanges();
    var a = E.getAnalytics(range);

    var host = $("[data-kpis]");
    host.textContent = "";
    host.appendChild(tile("XP", signed(a.xp), true));
    host.appendChild(tile("Acciones", num(a.activities)));
    host.appendChild(tile("Misiones", num(a.questsCompleted)));
    host.appendChild(tile("Bosses", num(a.bossesDefeated)));
    host.appendChild(tile("Problemas", num(a.problemsSolved)));
    host.appendChild(tile("Racha", a.streak.current + " D"));

    var series = E.xpSeries(currentRange().days);
    $("[data-series-label]").textContent = series.length + " días";
    drawChart($("[data-a-chart]"), $("[data-a-chart-x]"), series);

    /* XP por categoría */
    var bars = $("[data-cat-bars]");
    bars.textContent = "";
    var maxCat = 0;
    C.CATEGORIES.forEach(function (c) {
      maxCat = Math.max(maxCat, a.byCategory[c.id] || 0);
    });
    if (maxCat <= 0) {
      bars.appendChild(el("p", "empty__t", "Sin XP en este rango"));
    } else {
      C.CATEGORIES.slice()
        .sort(function (x, y) {
          return (a.byCategory[y.id] || 0) - (a.byCategory[x.id] || 0);
        })
        .forEach(function (c) {
          var v = a.byCategory[c.id] || 0;
          var row = el("div", "cbar");
          row.style.setProperty("--h", c.hue);
          var top = el("div", "cbar__top");
          top.appendChild(el("span", "cbar__n", c.stat));
          top.appendChild(el("span", "cbar__v num", signed(v) + " XP"));
          row.appendChild(top);
          var bar = el("div", "bar bar--thin bar--hue");
          var fill = el("i");
          fill.style.width = (v > 0 ? Math.max(2, (v / maxCat) * 100) : 0) + "%";
          bar.appendChild(fill);
          row.appendChild(bar);
          bars.appendChild(row);
        });
    }

    /* Crecimiento */
    var g = $("[data-growth]");
    g.textContent = "";
    a.snapshot.stats
      .slice()
      .sort(function (x, y) {
        return y.growth - x.growth;
      })
      .forEach(function (st) {
        var row = el("div", "entry");
        var dot = el("i", "entry__dot");
        dot.style.setProperty("--h", st.hue);
        row.appendChild(dot);
        var main = el("div", "entry__main");
        main.appendChild(el("p", "entry__t", st.stat));
        main.appendChild(
          el(
            "p",
            "entry__m",
            "LV " + st.level + " · " + num(st.xp) + " XP" +
              (st.neglected && st.xp > 0 ? " · " + st.daysIdle + "D inactivo" : "")
          )
        );
        row.appendChild(main);
        var v = el("p", "entry__v num", st.growth > 0 ? "+" + pct1(st.growth) + "%" : "—");
        if (st.growth <= 0) v.style.color = "var(--text-3)";
        row.appendChild(v);
        g.appendChild(row);
      });

    renderStreaks();
    renderAnalysis();
  }

  function renderAnalysis() {
    var a = E.getAnalytics("30d");
    var host = $("[data-analysis]");
    host.textContent = "";

    if (!a.snapshot.entries) {
      host.appendChild(el("p", "empty__t", "Sin datos · registra tu primera acción"));
      return;
    }

    var rows = [
      ["Más fuerte", a.strongest ? a.strongest.stat + " · LV " + a.strongest.level : "—"],
      ["Más débil", a.weakest ? a.weakest.stat + " · LV " + a.weakest.level : "—"],
      [
        "Mayor crecimiento",
        a.fastest && a.fastest.growth > 0
          ? a.fastest.stat + " · +" + pct1(a.fastest.growth) + "% / 7D"
          : "—"
      ],
      ["Abandonadas", a.idle.length ? statNames(a.idle) : "Ninguna"]
    ];
    if (a.untouched.length) rows.push(["Sin iniciar", statNames(a.untouched)]);

    rows.forEach(function (r) {
      var row = el("div", "entry");
      var main = el("div", "entry__main");
      main.appendChild(el("p", "entry__m", r[0]));
      main.appendChild(el("p", "entry__t entry__t--wrap", r[1]));
      row.appendChild(main);
      host.appendChild(row);
    });
  }

  /* =========================================================
     REGISTRAR
     ========================================================= */
  var draft = { category: null, action: null, minutes: "", amount: "", difficulty: "NORMAL" };

  function renderCats() {
    var host = $("[data-cats]");
    host.textContent = "";
    C.CATEGORIES.forEach(function (c) {
      var b = el("button", "chip", c.stat);
      b.type = "button";
      b.setAttribute("aria-pressed", draft.category === c.id ? "true" : "false");
      b.addEventListener("click", function () {
        draft.category = c.id;
        draft.action = null;
        renderCats();
        renderActs();
        renderExtra();
        renderPreview();
      });
      host.appendChild(b);
    });
  }

  function renderActs() {
    var host = $("[data-acts]");
    host.textContent = "";
    if (!draft.category) {
      host.appendChild(el("p", "micro", "Elige una categoría primero"));
      return;
    }
    (C.ACTIONS[draft.category] || []).forEach(function (a) {
      var b = el("button", "chip");
      b.type = "button";
      b.appendChild(document.createTextNode(a.label));
      b.appendChild(el("span", "chip__x", a.scaled ? "±" : signed(a.xp)));
      b.setAttribute("aria-pressed", draft.action === a.id ? "true" : "false");
      b.addEventListener("click", function () {
        draft.action = a.id;
        renderActs();
        renderExtra();
        renderPreview();
      });
      host.appendChild(b);
    });
  }

  function field(label, type, value, placeholder, onInput) {
    var wrap = el("label", "field");
    wrap.appendChild(el("span", null, label));
    var input = el("input");
    input.type = type;
    input.value = value || "";
    input.placeholder = placeholder || "";
    input.inputMode = type === "number" ? "numeric" : "text";
    input.addEventListener("input", function () {
      onInput(input.value);
    });
    wrap.appendChild(input);
    return wrap;
  }

  function renderExtra() {
    var host = $("[data-extra]");
    host.textContent = "";
    var def = C.action(draft.category, draft.action);
    if (!def) return;

    if (def.input === "min") {
      host.appendChild(
        field("Minutos", "number", draft.minutes, "30", function (v) {
          draft.minutes = v;
          renderPreview();
        })
      );
    }
    if (def.input === "amount") {
      host.appendChild(
        field("Importe (€)", "number", draft.amount, "200", function (v) {
          draft.amount = v;
          renderPreview();
        })
      );
    }
    if (def.scaled) {
      var wrap = el("label", "field");
      wrap.appendChild(el("span", null, "Dificultad"));
      var sel = el("select");
      C.DIFFICULTIES.forEach(function (d) {
        var o = el("option", null, d + " · " + signed(C.DIFFICULTY_XP[d]) + " XP");
        o.value = d;
        if (draft.difficulty === d) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () {
        draft.difficulty = sel.value;
        renderPreview();
      });
      wrap.appendChild(sel);
      host.appendChild(wrap);
    }
  }

  function renderPreview() {
    var xp =
      draft.category && draft.action
        ? C.actionXP(draft.category, draft.action, {
            minutes: draft.minutes,
            difficulty: draft.difficulty
          })
        : 0;
    $("[data-preview]").textContent = signed(xp) + " XP";
    $("[data-submit]").disabled = !(draft.category && draft.action);
    $("[data-log-note]").textContent = draft.category ? C.categoryName(draft.category) : "";
  }

  function submitDraft() {
    if (!draft.category || !draft.action) return;
    var def = C.action(draft.category, draft.action);
    var meta = null;
    if (def.input === "min" && draft.minutes) meta = { minutes: Number(draft.minutes) };
    if (def.input === "amount" && draft.amount) meta = { amount: Number(draft.amount) };
    if (def.scaled) meta = { difficulty: draft.difficulty };

    var res = E.logActivity({
      category: draft.category,
      action: draft.action,
      notes: $("[data-notes]").value.trim(),
      minutes: draft.minutes,
      difficulty: draft.difficulty,
      meta: meta,
      source: "quick"
    });

    if (!res.ok) {
      Toast.show("System", "No se pudo registrar (" + res.reason + ")");
      return;
    }

    draft.action = null;
    draft.minutes = "";
    draft.amount = "";
    $("[data-notes]").value = "";
    renderActs();
    renderExtra();
    renderPreview();
    go("dashboard");
  }

  /* =========================================================
     HISTORIAL
     ========================================================= */
  var historyFilter = "";

  function entryRow(t, opts) {
    opts = opts || {};
    var row = hue(el("div", "entry"), t.category);
    row.appendChild(el("i", "entry__dot"));

    var main = el("div", "entry__main");
    main.appendChild(el("p", "entry__t", t.label || t.action));
    var bits = [C.categoryName(t.category)];
    bits.push(opts.compact ? dayLabel(t.ts) + " " + timeLabel(t.ts) : timeLabel(t.ts));
    if (t.meta && t.meta.minutes) bits.push(t.meta.minutes + " min");
    if (t.meta && t.meta.amount) bits.push(num(t.meta.amount) + " €");
    if (t.meta && t.meta.difficulty) bits.push(t.meta.difficulty);
    if (t.notes) bits.push(t.notes);
    main.appendChild(el("p", "entry__m", bits.join(" · ")));
    row.appendChild(main);

    var v = el("p", "entry__v num", signed(t.amount) + " XP");
    if (t.amount < 0) v.setAttribute("data-neg", "1");
    row.appendChild(v);

    if (!opts.compact) {
      var del = el("button", "entry__x", "✕");
      del.type = "button";
      del.setAttribute("aria-label", "Eliminar registro");
      del.addEventListener("click", function () {
        if (!global.confirm("¿Eliminar este registro? El XP se recalculará.")) return;
        E.deleteActivity(t.id);
        Toast.show("System", "Registro eliminado · XP recalculado");
      });
      row.appendChild(del);
    }

    return row;
  }

  function initFilter() {
    var sel = $("[data-filter]");
    C.CATEGORIES.forEach(function (c) {
      var o = el("option", null, c.stat);
      o.value = c.id;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      historyFilter = sel.value;
      renderHistory();
    });
  }

  function renderHistory() {
    var host = $("[data-log]");
    host.textContent = "";
    var days = E.activityLog({ category: historyFilter || null });

    var count = days.reduce(function (n, d) {
      return n + d.items.length;
    }, 0);
    $("[data-history-count]").textContent = count ? num(count) + " registros" : "";

    if (!days.length) {
      emptyState(host, "No activity", "Registra tu primera acción.", "Registrar", function () {
        go("log");
      });
      return;
    }

    days.forEach(function (d) {
      var box = el("div", "day");
      var head = el("div", "day__head");
      head.appendChild(el("p", "day__d", dayLabel(d.ts)));
      head.appendChild(el("p", "day__v num", signed(d.total) + " XP"));
      box.appendChild(head);

      var list = el("div", "list");
      d.items.forEach(function (t) {
        list.appendChild(entryRow(t));
      });
      box.appendChild(list);
      host.appendChild(box);
    });
  }

  /* =========================================================
     FINANZAS
     ========================================================= */
  var finType = "saving";

  function masked() {
    return !!store.get().settings.maskMoney;
  }
  function money(n) {
    return masked() ? "••••" : F.fmt(n);
  }

  function renderFinance() {
    var sum = F.summary();
    var host = $("[data-fin-summary]");
    host.textContent = "";

    var fig = el("div", "figure");
    var left = el("div");
    left.appendChild(el("p", "kicker", "Patrimonio"));
    left.appendChild(el("p", "figure__v num", money(sum.netWorth)));
    fig.appendChild(left);
    var right = el("div", "figure__side");
    right.appendChild(el("p", "kicker", "Flujo neto"));
    right.appendChild(el("p", "tile__v num", money(sum.flow)));
    fig.appendChild(right);
    host.appendChild(fig);

    var grid = el("div", "tiles");
    grid.style.marginTop = "var(--s4)";
    [
      ["Ahorro", sum.saving],
      ["Inversión", sum.investment],
      ["Ingresos", sum.income],
      ["Gastos", sum.expense]
    ].forEach(function (r) {
      grid.appendChild(tile(r[0], money(r[1])));
    });
    host.appendChild(grid);

    $("[data-mask-toggle]").textContent = masked() ? "Mostrar cifras" : "Ocultar cifras";

    var ms = $("[data-fin-milestones]");
    ms.textContent = "";
    F.milestones().forEach(function (m) {
      var row = el("div", "ms" + (m.reached ? " ms--on" : ""));
      row.appendChild(el("span", "ms__v num", masked() ? "••••" : F.fmt(m.value)));
      var bar = el("div", "bar bar--thin");
      var fill = el("i");
      fill.style.width = Math.round(m.progress * 100) + "%";
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el("span", "ms__t", m.reached ? "OK" : Math.round(m.progress * 100) + "%"));
      ms.appendChild(row);
    });

    var next = F.nextMilestone();
    $("[data-fin-next]").textContent = next
      ? "siguiente " + (masked() ? "••••" : F.fmt(next))
      : "todos alcanzados";

    var chips = $("[data-fin-types]");
    chips.textContent = "";
    C.FINANCE.types.forEach(function (t) {
      var b = el("button", "chip", t.label);
      b.type = "button";
      b.setAttribute("aria-pressed", finType === t.id ? "true" : "false");
      b.addEventListener("click", function () {
        finType = t.id;
        renderFinance();
      });
      chips.appendChild(b);
    });

    var listHost = $("[data-fin-list]");
    listHost.textContent = "";
    var entries = F.all()
      .slice()
      .sort(function (a, b) {
        return new Date(b.ts) - new Date(a.ts);
      });
    $("[data-fin-count]").textContent = entries.length ? entries.length + " registros" : "";

    if (!entries.length) {
      emptyState(listHost, "Sin movimientos", "Registra un ahorro, ingreso o gasto.");
      return;
    }

    var list = el("div", "list");
    entries.forEach(function (e) {
      var def = F.typeDef(e.type);
      var row = el("div", "entry");
      var main = el("div", "entry__main");
      main.appendChild(el("p", "entry__t", def ? def.label : e.type));
      main.appendChild(
        el("p", "entry__m", [dayLabel(e.ts), timeLabel(e.ts), e.note].filter(Boolean).join(" · "))
      );
      row.appendChild(main);
      var v = el(
        "p",
        "entry__v num",
        (def && def.sign < 0 ? "−" : "+") + (masked() ? "••••" : F.fmt(e.amount))
      );
      if (def && def.sign < 0) v.setAttribute("data-neg", "1");
      row.appendChild(v);
      var del = el("button", "entry__x", "✕");
      del.type = "button";
      del.setAttribute("aria-label", "Eliminar movimiento");
      del.addEventListener("click", function () {
        if (!global.confirm("¿Eliminar el movimiento y su XP?")) return;
        F.deleteEntry(e.id);
      });
      row.appendChild(del);
      list.appendChild(row);
    });
    listHost.appendChild(list);
  }

  function initFinance() {
    $("[data-mask-toggle]").addEventListener("click", function () {
      store.commit(function (s) {
        s.settings.maskMoney = !s.settings.maskMoney;
      });
    });

    $("[data-fin-save]").addEventListener("click", function () {
      var res = F.addEntry({
        type: finType,
        amount: $("[data-fin-amount]").value,
        note: $("[data-fin-note]").value
      });
      if (!res.ok) {
        Toast.show("System", res.reason === "amount" ? "Falta el importe" : "No se pudo registrar");
        return;
      }
      $("[data-fin-amount]").value = "";
      $("[data-fin-note]").value = "";
      Toast.show("System", "Movimiento registrado");
    });
  }

  /* =========================================================
     TRADING
     ========================================================= */
  function renderTrading() {
    var st = T.stats();
    var host = $("[data-tr-summary]");
    host.textContent = "";

    var fig = el("div", "figure");
    var left = el("div");
    left.appendChild(el("p", "kicker", "Reglas respetadas"));
    left.appendChild(el("p", "figure__v num", pct1(st.discipline) + "%"));
    fig.appendChild(left);
    var right = el("div", "figure__side");
    right.appendChild(el("p", "kicker", "Revisadas"));
    right.appendChild(el("p", "tile__v num", st.reviewed + "/" + st.total));
    fig.appendChild(right);
    host.appendChild(fig);

    var grid = el("div", "tiles");
    grid.style.marginTop = "var(--s4)";
    grid.appendChild(tile("Operaciones", num(st.total)));
    grid.appendChild(tile("Con reglas", num(st.followed)));
    grid.appendChild(tile("Ganadoras", num(st.byResult.WIN)));
    grid.appendChild(tile("Perdedoras", num(st.byResult.LOSS)));
    host.appendChild(grid);

    $("[data-tr-count]").textContent = st.total ? st.total + " operaciones" : "";

    var listHost = $("[data-tr-list]");
    listHost.textContent = "";
    var trades = T.all()
      .slice()
      .sort(function (a, b) {
        return new Date(b.ts) - new Date(a.ts);
      });

    if (!trades.length) {
      emptyState(
        listHost,
        "Sin operaciones",
        "El XP premia registrar y respetar tus reglas.",
        "Registrar operación",
        function () {
          $("[data-tr-form]").hidden = false;
          $("[data-tr-strategy]").focus();
        }
      );
      return;
    }

    trades.forEach(function (t) {
      var card = el("div", "trade " + (t.rulesFollowed ? "trade--ok" : "trade--broken"));
      var top = el("div", "trade__top");
      top.appendChild(el("p", "trade__n", t.strategy));
      var res = el("p", "trade__r", t.result);
      res.style.color =
        t.result === "WIN" ? "var(--ok)" : t.result === "LOSS" ? "var(--bad)" : "var(--text-3)";
      top.appendChild(res);
      card.appendChild(top);

      var bits = [dayLabel(t.ts)];
      if (t.setup) bits.push(t.setup);
      if (t.entry) bits.push("in " + t.entry);
      if (t.exit) bits.push("out " + t.exit);
      if (t.risk) bits.push("riesgo " + t.risk);
      if (t.emotion) bits.push(t.emotion);
      card.appendChild(el("p", "trade__m", bits.join(" · ")));

      if (t.notes) card.appendChild(el("p", "trade__notes", t.notes));

      var foot = el("div", "trade__foot");
      var pills = el("div", "trade__pills");
      pills.appendChild(
        el(
          "span",
          "badge " + (t.rulesFollowed ? "badge--ok" : "badge--bad"),
          t.rulesFollowed ? "Reglas ok" : "Reglas rotas"
        )
      );
      if (t.reviewed) pills.appendChild(el("span", "badge", "Revisada"));
      foot.appendChild(pills);

      var del = el("button", "icon-btn", "✕");
      del.type = "button";
      del.setAttribute("aria-label", "Eliminar operación");
      del.addEventListener("click", function () {
        if (!global.confirm("¿Eliminar la operación y su XP?")) return;
        T.deleteTrade(t.id);
      });
      foot.appendChild(del);
      card.appendChild(foot);

      listHost.appendChild(card);
    });
  }

  function initTrading() {
    var res = $("[data-tr-result]");
    C.TRADING.results.forEach(function (r) {
      var o = el("option", null, r);
      o.value = r;
      if (r === "BREAKEVEN") o.selected = true;
      res.appendChild(o);
    });

    var emo = $("[data-tr-emotion]");
    var none = el("option", null, "—");
    none.value = "";
    emo.appendChild(none);
    C.TRADING.emotions.forEach(function (e) {
      var o = el("option", null, e);
      o.value = e;
      emo.appendChild(o);
    });

    $("[data-tr-toggle]").addEventListener("click", function () {
      var f = $("[data-tr-form]");
      f.hidden = !f.hidden;
      if (!f.hidden) $("[data-tr-strategy]").focus();
    });

    $("[data-tr-save]").addEventListener("click", function () {
      var r = T.addTrade({
        strategy: $("[data-tr-strategy]").value,
        setup: $("[data-tr-setup]").value,
        entry: $("[data-tr-entry]").value,
        exit: $("[data-tr-exit]").value,
        result: res.value,
        risk: $("[data-tr-risk]").value,
        emotion: emo.value,
        notes: $("[data-tr-notes]").value,
        rulesFollowed: $("[data-tr-rules]").checked,
        reviewed: $("[data-tr-reviewed]").checked
      });
      if (!r.ok) {
        Toast.show("System", "Falta la estrategia");
        return;
      }
      ["strategy", "setup", "entry", "exit", "risk", "notes"].forEach(function (k) {
        $("[data-tr-" + k + "]").value = "";
      });
      $("[data-tr-reviewed]").checked = false;
      $("[data-tr-form]").hidden = true;
      Toast.show("System", "Operación registrada");
    });
  }

  /* =========================================================
     BLOQUEO
     ========================================================= */
  var entered = "";

  function renderDots() {
    var host = $("[data-lock-dots]");
    host.textContent = "";
    var total = Math.max(L.pinLength(), entered.length);
    for (var i = 0; i < total; i++) {
      host.appendChild(el("i", "lock__dot" + (i < entered.length ? " lock__dot--on" : "")));
    }
  }

  function submitPin() {
    var pin = entered;
    entered = "";
    renderDots();
    L.verify(pin).then(function (ok) {
      if (ok) {
        L.markUnlocked();
        $("[data-lock-msg]").textContent = "";
        showApp();
        return;
      }
      var node = $("[data-lock]");
      node.className = "lock lock--wrong";
      $("[data-lock-msg]").textContent = "PIN incorrecto";
      global.setTimeout(function () {
        node.className = "lock";
      }, 320);
    });
  }

  function pressKey(k) {
    if (k === "del") entered = entered.slice(0, -1);
    else if (k === "ok") {
      if (entered.length >= L.MIN) submitPin();
      return;
    } else if (entered.length < L.MAX) entered += k;

    renderDots();
    $("[data-lock-msg]").textContent = "";
    if (entered.length === L.pinLength()) submitPin();
  }

  function initKeypad() {
    var host = $("[data-keypad]");
    host.textContent = "";
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"].forEach(function (k) {
      var b = el("button", "key" + (k === "del" || k === "ok" ? " key--fn" : ""));
      b.type = "button";
      b.textContent = k === "del" ? "Borrar" : k === "ok" ? "Entrar" : k;
      b.setAttribute("aria-label", k === "del" ? "Borrar" : k === "ok" ? "Entrar" : "Dígito " + k);
      b.addEventListener("click", function () {
        pressKey(k);
      });
      host.appendChild(b);
    });

    document.addEventListener("keydown", function (ev) {
      if ($("[data-lock]").hidden) return;
      if (/^[0-9]$/.test(ev.key)) pressKey(ev.key);
      else if (ev.key === "Backspace") pressKey("del");
      else if (ev.key === "Enter") pressKey("ok");
    });
  }

  function showLock() {
    $("[data-lock]").hidden = false;
    $(".app").hidden = true;
    $("[data-nav]").hidden = true;
    entered = "";
    renderDots();
  }

  function showApp() {
    $("[data-lock]").hidden = true;
    $(".app").hidden = false;
    $("[data-nav]").hidden = false;
    $("[data-lock-now]").hidden = !L.isEnabled();
    render();
  }

  /* =========================================================
     CONFIGURACIÓN
     ========================================================= */
  function renderSettings() {
    var on = L.isEnabled();
    $("[data-pin-state]").textContent = on ? "activo" : "sin PIN";
    $("[data-pin-off]").hidden = on;
    $("[data-pin-on]").hidden = !on;
    $("[data-lock-now]").hidden = !on;

    var bytes = 0;
    try {
      bytes = (global.localStorage.getItem(store.KEY) || "").length;
    } catch (e) {}
    $("[data-data-size]").textContent = Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function initSettings() {
    $("[data-pin-set]").addEventListener("click", function () {
      var a = $("[data-pin-new]").value.trim();
      var b = $("[data-pin-rep]").value.trim();
      if (a !== b) {
        Toast.show("System", "Los dos PIN no coinciden");
        return;
      }
      if (!L.validPin(a)) {
        Toast.show("System", "El PIN debe tener entre " + L.MIN + " y " + L.MAX + " dígitos");
        return;
      }
      L.setPin(a).then(function (res) {
        if (!res.ok) {
          Toast.show("System", "PIN no válido");
          return;
        }
        $("[data-pin-new]").value = "";
        $("[data-pin-rep]").value = "";
        Toast.show("System", "PIN activado");
      });
    });

    $("[data-pin-remove]").addEventListener("click", function () {
      L.removePin($("[data-pin-current]").value.trim()).then(function (res) {
        $("[data-pin-current]").value = "";
        Toast.show("System", res.ok ? "PIN desactivado" : "PIN incorrecto");
      });
    });

    $("[data-pin-lock]").addEventListener("click", function () {
      L.lockNow();
      showLock();
    });

    $("[data-lock-now]").addEventListener("click", function () {
      L.lockNow();
      showLock();
    });

    $("[data-export]").addEventListener("click", function () {
      var blob = new global.Blob([JSON.stringify(store.get(), null, 2)], {
        type: "application/json"
      });
      var url = global.URL.createObjectURL(blob);
      var a = el("a");
      a.href = url;
      a.download = "dani-system-" + E.dayKey(Date.now()) + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      global.setTimeout(function () {
        global.URL.revokeObjectURL(url);
      }, 1000);
      Toast.show("System", "Copia exportada");
    });

    $("[data-import]").addEventListener("click", function () {
      $("[data-import-file]").click();
    });

    $("[data-import-file]").addEventListener("change", function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      var reader = new global.FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!data || !Array.isArray(data.xp)) throw new Error("formato");
          if (!global.confirm("Esto reemplaza los datos actuales. ¿Continuar?")) return;
          store.replace(data);
          Q.rollover();
          P.check();
          Toast.show("System", "Copia importada");
        } catch (e) {
          Toast.show("System", "Archivo no válido");
        }
        ev.target.value = "";
      };
      reader.readAsText(file);
    });

    $("[data-reset]").addEventListener("click", function () {
      if (!global.confirm("¿Borrar TODO el progreso? No hay vuelta atrás.")) return;
      store.reset();
      Toast.show("System", "Sistema reiniciado");
      go("dashboard");
    });
  }

  /* =========================================================
     MENÚ (MÁS)
     ========================================================= */
  var ICONS = {
    history: "M4 6h16M4 12h16M4 18h10",
    skills: "M12 3.5l2.3 4.9 5.2.7-3.8 3.7.9 5.2-4.6-2.6-4.6 2.6.9-5.2-3.8-3.7 5.2-.7L12 3.5Z",
    achievements: "M8 4h8v4.5a4 4 0 0 1-8 0V4Z M12 13v3.5 M8.5 19.5h7 M8 5.5H5.5V7a3 3 0 0 0 3 3 M16 5.5h2.5V7a3 3 0 0 1-3 3",
    analytics: "M4 19V10M10 19V5M16 19v-6M22 19H2",
    finance: "M3 7.5h18v9H3v-9Zm0 3.5h18",
    trading: "M3 16.5l5-5.5 4 3 4-5.5 5 4M3 20.5h18",
    settings: "M4 8.5h8 M16 8.5h4 M4 15.5h4 M12 15.5h8 M14 6.5v4 M10 13.5v4"
  };

  var SECTIONS = [
    { view: "history", icon: "history", name: "Historial", desc: "Todas las acciones registradas" },
    { view: "unlocks", seg: "skills", icon: "skills", name: "Skills", desc: "Habilidades desbloqueadas" },
    { view: "unlocks", seg: "achievements", icon: "achievements", name: "Logros", desc: "Hitos conseguidos" },
    { view: "analytics", icon: "analytics", name: "Análisis", desc: "XP, rangos y crecimiento" },
    { view: "finance", icon: "finance", name: "Finanzas", desc: "Patrimonio y milestones" },
    { view: "trading", icon: "trading", name: "Trading", desc: "Journal y disciplina" },
    { view: "settings", icon: "settings", name: "Configuración", desc: "PIN, copia de seguridad y datos" }
  ];

  function renderMenu() {
    var host = $("[data-menu]");
    host.textContent = "";
    SECTIONS.forEach(function (sec) {
      var b = el("button", "menu-row");
      b.type = "button";

      var ico = el("span", "menu-row__ico");
      ico.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[sec.icon] + '"/></svg>';
      b.appendChild(ico);

      var main = el("div", "menu-row__main");
      main.appendChild(el("p", "menu-row__n", sec.name));
      main.appendChild(el("p", "menu-row__d", sec.desc));
      b.appendChild(main);
      b.appendChild(el("span", "menu-row__go", "→"));

      b.addEventListener("click", function () {
        if (sec.seg) segment = sec.seg;
        go(sec.view);
      });
      host.appendChild(b);
    });
  }

  /* =========================================================
     NAVEGACIÓN
     ========================================================= */
  var current = "dashboard";

  var TITLES = {
    dashboard: "Estado",
    quests: "Misiones",
    bosses: "Bosses",
    log: "Registrar",
    unlocks: "Desbloqueos",
    analytics: "Análisis",
    finance: "Finanzas",
    trading: "Trading",
    history: "Historial",
    settings: "Configuración",
    more: "Más"
  };

  function go(view) {
    current = view;
    $$("[data-view]").forEach(function (v) {
      v.hidden = v.getAttribute("data-view") !== view;
    });
    $$("[data-go]").forEach(function (b) {
      if (b.classList.contains("nav__btn")) {
        b.setAttribute("aria-current", b.getAttribute("data-go") === view ? "true" : "false");
      }
    });
    $("[data-topbar-view]").textContent = TITLES[view] || "";
    if (global.location.hash !== "#" + view) {
      global.history.replaceState(null, "", "#" + view);
    }
    render();
    global.scrollTo(0, 0);
  }

  /* Solo se dibuja la vista visible. */
  function render() {
    if (current === "dashboard") renderDashboard();
    else if (current === "quests") renderQuests();
    else if (current === "bosses") renderBosses();
    else if (current === "log") {
      renderCats();
      renderActs();
      renderExtra();
      renderPreview();
    } else if (current === "unlocks") renderUnlocks();
    else if (current === "analytics") renderAnalytics();
    else if (current === "finance") renderFinance();
    else if (current === "trading") renderTrading();
    else if (current === "history") renderHistory();
    else if (current === "settings") renderSettings();
    else if (current === "more") renderMenu();
  }

  function init() {
    Q.rollover();
    initFilter();
    initQuestForm();
    initBossForm();
    initSegments();
    initFinance();
    initTrading();
    initSettings();
    initKeypad();
    P.check();

    $$("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () {
        go(b.getAttribute("data-go"));
      });
    });

    store.subscribe(render);

    var hash = (global.location.hash || "").replace("#", "");
    current = $('[data-view="' + hash + '"]') ? hash : "dashboard";

    if (L.isEnabled() && !L.isUnlocked()) showLock();
    else showApp();
    go(current);
  }

  global.DS.ui = { go: go, render: render, toast: Toast.show, flash: Flash.push };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
