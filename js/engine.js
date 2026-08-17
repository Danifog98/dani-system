/* =========================================================
   DANI SYSTEM — motor
   Todo lo que se muestra (XP total, nivel, rank, stats, power,
   analíticas) se DERIVA de state.xp. Nada de esto se almacena.
   ========================================================= */

(function (global) {
  "use strict";

  var C = global.DS.config;
  var store = global.DS.store;

  /* =========================================================
     Fechas
     ========================================================= */
  var DAY = 86400000;

  function startOfDay(d) {
    var x = new Date(d || Date.now());
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function startOfWeek(d) {
    var x = startOfDay(d);
    var wd = (x.getDay() + 6) % 7; // lunes = 0
    x.setDate(x.getDate() - wd);
    return x;
  }
  function startOfMonth(d) {
    var x = startOfDay(d);
    x.setDate(1);
    return x;
  }
  function dayKey(ts) {
    var d = new Date(ts);
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  /* =========================================================
     Niveles
     ========================================================= */
  var levelCache = null;

  function levelTable() {
    if (levelCache) return levelCache;
    var f = C.LEVEL_FORMULA;
    var table = C.LEVELS.slice();
    var step = f.lastStep;
    while (table.length < f.max) {
      step = step * f.growth;
      table.push(Math.round((table[table.length - 1] + step) / 100) * 100);
    }
    levelCache = table;
    return table;
  }

  function xpForLevel(level) {
    var t = levelTable();
    if (level < 1) return 0;
    return level <= t.length ? t[level - 1] : t[t.length - 1];
  }

  function levelInfo(totalXP) {
    var t = levelTable();
    var xp = Math.max(0, totalXP);
    var level = 1;
    for (var i = 0; i < t.length; i++) {
      if (xp >= t[i]) level = i + 1;
      else break;
    }
    var floor = xpForLevel(level);
    var next = level < t.length ? xpForLevel(level + 1) : null;
    var span = next === null ? 0 : next - floor;
    return {
      level: level,
      max: level >= t.length,
      xpTotal: xp,
      xpInto: xp - floor,
      xpNeeded: span,
      xpToNext: next === null ? 0 : next - xp,
      floor: floor,
      next: next,
      pct: span > 0 ? Math.min(100, ((xp - floor) / span) * 100) : 100
    };
  }

  /* =========================================================
     Curva de los stats
     ========================================================= */
  var statCurveCache = null;

  function statCurve() {
    if (statCurveCache) return statCurveCache;
    var s = C.STATS;
    var table = [0];
    var step = s.curveBase;
    var cum = 0;
    while (cum < s.masteryXP * 3 && table.length < 100) {
      cum += step;
      table.push(Math.round(cum));
      step = step * s.curveGrowth;
    }
    statCurveCache = table;
    return statCurveCache;
  }

  function statLevel(xp) {
    var t = statCurve();
    var level = 1;
    for (var i = 0; i < t.length; i++) {
      if (xp >= t[i]) level = i + 1;
      else break;
    }
    var floor = t[level - 1];
    var next = level < t.length ? t[level] : null;
    var span = next === null ? 0 : next - floor;
    return {
      level: level,
      pct: span > 0 ? Math.min(100, ((xp - floor) / span) * 100) : 100,
      into: xp - floor,
      needed: span
    };
  }

  /* =========================================================
     Snapshot: un solo recorrido de las transacciones
     ========================================================= */
  function snapshot(now) {
    var s = store.get();
    now = now || Date.now();

    var dayStart = startOfDay(now).getTime();
    var weekStart = startOfWeek(now).getTime();
    var monthStart = startOfMonth(now).getTime();
    var last7 = now - 7 * DAY;
    var prev7 = now - 14 * DAY;

    var byCat = {};
    C.CATEGORIES.forEach(function (c) {
      byCat[c.id] = { xp: 0, xp7: 0, xpPrev7: 0, last: null, count: 0 };
    });

    var total = 0,
      today = 0,
      week = 0,
      month = 0;
    var byDay = {};

    var list = s.xp;
    for (var i = 0; i < list.length; i++) {
      var tx = list[i];
      var amount = Number(tx.amount) || 0;
      var ts = new Date(tx.ts).getTime();
      total += amount;

      if (ts >= dayStart) today += amount;
      if (ts >= weekStart) week += amount;
      if (ts >= monthStart) month += amount;

      var k = dayKey(ts);
      byDay[k] = (byDay[k] || 0) + amount;

      var cat = byCat[tx.category];
      if (cat) {
        cat.xp += amount;
        cat.count++;
        if (ts >= last7) cat.xp7 += amount;
        else if (ts >= prev7) cat.xpPrev7 += amount;
        if (cat.last === null || ts > cat.last) cat.last = ts;
      }
    }

    var level = levelInfo(total);

    /* Stats */
    var masteryXP = C.STATS.masteryXP;
    var stats = C.CATEGORIES.map(function (c) {
      var d = byCat[c.id];
      var mastery = Math.min(100, (d.xp / masteryXP) * 100);
      var delta = (d.xp7 / masteryXP) * 100;
      var prevDelta = (d.xpPrev7 / masteryXP) * 100;
      var sl = statLevel(d.xp);
      var days = d.last === null ? null : Math.floor((now - d.last) / DAY);
      /* Crecimiento real: XP de los últimos 7 días sobre lo que había antes. */
      var prior = d.xp - d.xp7;
      var growth = prior > 0 ? (d.xp7 / prior) * 100 : d.xp7 > 0 ? 100 : 0;
      return {
        id: c.id,
        stat: c.stat,
        weight: c.weight,
        hue: c.hue,
        xp: d.xp,
        entries: d.count,
        mastery: mastery,
        level: sl.level,
        levelPct: sl.pct,
        levelInto: sl.into,
        levelNeeded: sl.needed,
        levelNext: sl.needed ? d.xp - sl.into + sl.needed : null,
        growth: growth,
        xp7: d.xp7,
        delta: delta,
        trend: delta > prevDelta ? "up" : delta < prevDelta ? "down" : "flat",
        lastActivity: d.last,
        daysIdle: days,
        neglected: days === null || days >= C.STATS.inactiveDays
      };
    });

    /* Total Power */
    var weighted = 0;
    stats.forEach(function (st) {
      weighted += st.weight * st.mastery;
    });
    var power = Math.round(
      weighted * (C.POWER.masteryScale / 100) * 100 + level.level * C.POWER.perLevel
    );

    /* Rank */
    var rank = C.RANKS[0],
      rankIndex = 0,
      nextRank = C.RANKS[1] || null;
    for (var r = 0; r < C.RANKS.length; r++) {
      if (power >= C.RANKS[r].min) {
        rank = C.RANKS[r];
        rankIndex = r;
        nextRank = C.RANKS[r + 1] || null;
      }
    }

    return {
      totalXP: total,
      today: today,
      week: week,
      month: month,
      level: level,
      stats: stats,
      power: power,
      rank: rank.id,
      rankIndex: rankIndex,
      nextRank: nextRank,
      rankPct: nextRank
        ? Math.min(100, ((power - rank.min) / (nextRank.min - rank.min)) * 100)
        : 100,
      byDay: byDay,
      entries: list.length
    };
  }

  /* =========================================================
     Eventos del sistema (nivel, rank, logros…)
     ========================================================= */
  var handlers = [];

  function on(fn) {
    handlers.push(fn);
  }
  function emit(events) {
    if (!events || !events.length) return;
    handlers.forEach(function (fn) {
      fn(events);
    });
  }

  /* =========================================================
     Conceder XP
     `key` da idempotencia: la misma clave nunca puntúa dos veces
     (p. ej. quest:<id>:complete), así refrescar no duplica XP.
     ========================================================= */
  function hasKey(key) {
    if (!key) return false;
    var list = store.get().xp;
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return true;
    }
    return false;
  }

  function awardXP(input) {
    if (!input || !input.category) return { ok: false, reason: "invalid" };
    if (input.key && hasKey(input.key)) return { ok: false, reason: "duplicate" };

    var before = snapshot();

    var amount = input.amount;
    if (amount === undefined || amount === null) {
      amount = C.actionXP(input.category, input.action, input);
    }
    amount = Math.round(Number(amount) || 0);

    var tx = {
      id: store.id("xp"),
      ts: input.ts || new Date().toISOString(),
      amount: amount,
      category: input.category,
      action: input.action || "manual",
      label: input.label || labelFor(input.category, input.action),
      notes: input.notes || "",
      source: input.source || "manual",
      refType: input.refType || null,
      refId: input.refId || null,
      key: input.key || null,
      meta: input.meta || null
    };

    store.commit(function (s) {
      s.xp.push(tx);
    });

    var after = snapshot();
    var events = diffEvents(before, after, tx);
    emit(events);

    return { ok: true, tx: tx, before: before, after: after, events: events };
  }

  function labelFor(categoryId, actionId) {
    var def = C.action(categoryId, actionId);
    return def ? def.label : "Actividad";
  }

  function diffEvents(before, after, tx) {
    var events = [];
    if (tx) {
      events.push({
        type: "xp",
        amount: tx.amount,
        label: tx.label,
        category: tx.category
      });
    }
    if (after.level.level > before.level.level) {
      events.push({
        type: "level",
        from: before.level.level,
        to: after.level.level
      });
    }
    if (after.rankIndex > before.rankIndex) {
      events.push({ type: "rank", from: before.rank, to: after.rank });
    }
    return events;
  }

  /* Registrar actividad: valida contra la configuración y concede XP. */
  function logActivity(input) {
    if (!input || !C.category(input.category)) {
      return { ok: false, reason: "category" };
    }
    return awardXP(input);
  }

  /* Borrar una actividad: los totales se recalculan solos. */
  function deleteActivity(txId) {
    var removed = false;
    store.commit(function (s) {
      var next = s.xp.filter(function (t) {
        return t.id !== txId;
      });
      removed = next.length !== s.xp.length;
      s.xp = next;
    });
    return removed;
  }

  /* =========================================================
     Registro de actividad agrupado por día
     ========================================================= */
  function activityLog(opts) {
    opts = opts || {};
    var list = store.get().xp.slice();

    if (opts.category) {
      list = list.filter(function (t) {
        return t.category === opts.category;
      });
    }
    if (opts.from) {
      var f = new Date(opts.from).getTime();
      list = list.filter(function (t) {
        return new Date(t.ts).getTime() >= f;
      });
    }
    if (opts.to) {
      var to = new Date(opts.to).getTime();
      list = list.filter(function (t) {
        return new Date(t.ts).getTime() <= to;
      });
    }

    list.sort(function (a, b) {
      return new Date(b.ts) - new Date(a.ts);
    });

    var days = [];
    var index = {};
    list.forEach(function (t) {
      var k = dayKey(t.ts);
      if (!index[k]) {
        index[k] = { key: k, ts: t.ts, total: 0, items: [] };
        days.push(index[k]);
      }
      index[k].items.push(t);
      index[k].total += Number(t.amount) || 0;
    });

    if (opts.limitDays) days = days.slice(0, opts.limitDays);
    return days;
  }

  /* =========================================================
     Analíticas
     ========================================================= */
  /* Rangos: hoy (natural), 7d y 30d (ventana móvil), semana y mes
     naturales, y todo. */
  function rangeStart(range, now) {
    now = now || Date.now();
    if (range === "today") return startOfDay(now).getTime();
    if (range === "7d") return startOfDay(now - 6 * DAY).getTime();
    if (range === "30d") return startOfDay(now - 29 * DAY).getTime();
    if (range === "week") return startOfWeek(now).getTime();
    if (range === "month") return startOfMonth(now).getTime();
    return 0;
  }

  function getAnalytics(range) {
    range = range || "week";
    var s = store.get();
    var snap = snapshot();
    var from = rangeStart(range);

    var xpInRange = 0;
    var activities = 0;
    var byCategory = {};
    var problems = 0;
    C.CATEGORIES.forEach(function (c) {
      byCategory[c.id] = 0;
    });

    s.xp.forEach(function (t) {
      if (new Date(t.ts).getTime() < from) return;
      var a = Number(t.amount) || 0;
      xpInRange += a;
      activities++;
      if (byCategory[t.category] !== undefined) byCategory[t.category] += a;
      if (t.category === "problems") problems++;
    });

    /* Quests y bosses cerrados dentro del rango. */
    function inRange(iso) {
      return iso ? new Date(iso).getTime() >= from : false;
    }
    var questsDone = s.quests.filter(function (q) {
      return q.status === "COMPLETED" && (from === 0 || inRange(q.completedAt));
    }).length;
    var bossesDown = s.bosses.filter(function (b) {
      return b.status === "DEFEATED" && (from === 0 || inRange(b.defeatedAt));
    }).length;

    var sorted = snap.stats.slice().sort(function (a, b) {
      return b.mastery - a.mastery;
    });
    var byGrowth = snap.stats.slice().sort(function (a, b) {
      return b.growth - a.growth;
    });

    return {
      range: range,
      from: from,
      xp: xpInRange,
      totalXP: snap.totalXP,
      activities: activities,
      questsCompleted: questsDone,
      bossesDefeated: bossesDown,
      byCategory: byCategory,
      problemsSolved: problems,
      streak: streak(null),
      strongest: sorted[0] || null,
      weakest: sorted[sorted.length - 1] || null,
      fastest: byGrowth[0] || null,
      /* neglected = todo lo parado; idle = tenía actividad y se ha enfriado;
         untouched = nunca se ha tocado. */
      neglected: snap.stats.filter(function (st) {
        return st.neglected;
      }),
      idle: snap.stats.filter(function (st) {
        return st.neglected && st.xp > 0;
      }),
      untouched: snap.stats.filter(function (st) {
        return st.lastActivity === null;
      }),
      snapshot: snap
    };
  }

  /* =========================================================
     Streaks
     Se derivan de las transacciones: no se guarda ningún contador.
     `grace` permite fallar días sueltos sin romper la racha; dos
     fallos consecutivos sí la cortan.
     ========================================================= */
  function activeDays(categories) {
    var set = {};
    store.get().xp.forEach(function (t) {
      if ((Number(t.amount) || 0) <= 0) return; // una penalización no mantiene racha
      if (categories && categories.indexOf(t.category) === -1) return;
      set[dayKey(t.ts)] = true;
    });
    return set;
  }

  function streak(categories, now) {
    var set = activeDays(categories);
    var grace = C.STREAKS.grace;
    now = now || Date.now();
    var today = startOfDay(now).getTime();

    var keys = Object.keys(set);
    if (!keys.length) return { current: 0, best: 0, days: 0, active: false, last: null };

    /* Racha actual: hacia atrás desde hoy. */
    var current = 0,
      miss = 0;
    for (var i = 0; i < 400; i++) {
      var k = dayKey(today - i * DAY);
      if (set[k]) {
        current++;
        miss = 0;
      } else {
        if (i === 0) continue; // el día en curso aún no cuenta como fallo
        miss++;
        if (miss > grace) break;
      }
    }

    /* Mejor racha histórica con la misma regla. */
    var sorted = keys
      .map(function (k) {
        var p = k.split("-");
        return new Date(+p[0], +p[1] - 1, +p[2]).getTime();
      })
      .sort(function (a, b) {
        return a - b;
      });
    var best = 0,
      run = 0,
      prev = null;
    sorted.forEach(function (ts) {
      if (prev === null) run = 1;
      else {
        var gap = Math.round((ts - prev) / DAY) - 1;
        run = gap > grace ? 1 : run + 1;
      }
      if (run > best) best = run;
      prev = ts;
    });

    return {
      current: current,
      best: Math.max(best, current),
      days: keys.length,
      active: !!set[dayKey(today)],
      last: sorted[sorted.length - 1] || null
    };
  }

  function getStreaks() {
    return C.STREAKS.tracked.map(function (t) {
      var s = streak(t.categories);
      s.id = t.id;
      s.label = t.label;
      return s;
    });
  }

  /* Serie de XP por día para los gráficos. */
  function xpSeries(days) {
    days = days || 14;
    var snap = snapshot();
    var out = [];
    var base = startOfDay(Date.now()).getTime();
    for (var i = days - 1; i >= 0; i--) {
      var ts = base - i * DAY;
      var k = dayKey(ts);
      out.push({ ts: ts, key: k, xp: snap.byDay[k] || 0 });
    }
    return out;
  }

  global.DS = global.DS || {};
  global.DS.engine = {
    /* derivados */
    snapshot: snapshot,
    getStats: function () {
      return snapshot().stats;
    },
    getDashboard: snapshot,
    levelInfo: levelInfo,
    xpForLevel: xpForLevel,
    statLevel: statLevel,
    /* escritura */
    awardXP: awardXP,
    logActivity: logActivity,
    deleteActivity: deleteActivity,
    hasKey: hasKey,
    /* consulta */
    activityLog: activityLog,
    getAnalytics: getAnalytics,
    xpSeries: xpSeries,
    streak: streak,
    getStreaks: getStreaks,
    /* eventos */
    on: on,
    emit: emit,
    /* utilidades de fecha */
    startOfDay: startOfDay,
    startOfWeek: startOfWeek,
    startOfMonth: startOfMonth,
    dayKey: dayKey,
    DAY: DAY
  };
})(window);
