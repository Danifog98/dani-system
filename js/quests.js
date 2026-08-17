/* =========================================================
   DANI SYSTEM — motor de quests
   Diarias y semanales. El XP se concede siempre a través de
   engine.awardXP con clave única: completar dos veces o
   refrescar no duplica recompensa.
   ========================================================= */

(function (global) {
  "use strict";

  var C = global.DS.config;
  var store = global.DS.store;
  var E = global.DS.engine;

  var STATUS = { ACTIVE: "ACTIVE", COMPLETED: "COMPLETED", FAILED: "FAILED", SKIPPED: "SKIPPED" };

  function todayKey() {
    return E.dayKey(Date.now());
  }
  function weekKey(d) {
    return E.dayKey(E.startOfWeek(d || Date.now()));
  }

  function defaultXP(type, difficulty) {
    var base = C.DIFFICULTY_XP[difficulty] || C.DIFFICULTY_XP.NORMAL;
    return type === "weekly" ? Math.round(base * C.QUESTS.weeklyMultiplier) : base;
  }

  /* ---------- Consultas ---------- */
  function all() {
    return store.get().quests;
  }

  function daily(dayk) {
    var k = dayk || todayKey();
    return all().filter(function (q) {
      return q.type === "daily" && q.period === k;
    });
  }

  function weekly(weekk) {
    var k = weekk || weekKey();
    return all().filter(function (q) {
      return q.type === "weekly" && q.period === k;
    });
  }

  function activeDailyCount() {
    return daily().filter(function (q) {
      return q.status === STATUS.ACTIVE;
    }).length;
  }

  /* ---------- Crear ---------- */
  function createQuest(input) {
    input = input || {};
    var type = input.type === "weekly" ? "weekly" : "daily";
    var title = String(input.title || "").trim();
    if (!title) return { ok: false, reason: "title" };
    if (!C.category(input.category)) return { ok: false, reason: "category" };

    if (type === "daily" && activeDailyCount() >= C.LIMITS.dailyQuests && !input.force) {
      return { ok: false, reason: "limit" };
    }

    var difficulty = C.DIFFICULTIES.indexOf(input.difficulty) > -1 ? input.difficulty : "NORMAL";
    var target = Math.max(1, parseInt(input.target, 10) || 1);

    var quest = {
      id: store.id("q"),
      type: type,
      title: title,
      description: String(input.description || "").trim(),
      category: input.category,
      difficulty: difficulty,
      xp:
        input.xp === undefined || input.xp === null || input.xp === ""
          ? defaultXP(type, difficulty)
          : Math.round(Number(input.xp) || 0),
      target: target,
      progress: 0,
      status: STATUS.ACTIVE,
      period: type === "weekly" ? weekKey() : todayKey(),
      recurring: !!input.recurring,
      origin: input.origin || null,
      created: new Date().toISOString(),
      completedAt: null,
      deadline: input.deadline || null
    };
    if (!quest.origin) quest.origin = quest.id;

    store.commit(function (s) {
      s.quests.push(quest);
    });
    return { ok: true, quest: quest };
  }

  function find(id) {
    var list = all();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* ---------- Completar ---------- */
  function completeQuest(id) {
    var q = find(id);
    if (!q) return { ok: false, reason: "missing" };
    if (q.status === STATUS.COMPLETED) return { ok: false, reason: "done" };

    E.emit([{ type: "quest", title: q.title, xp: q.xp, questType: q.type }]);

    var res = E.awardXP({
      category: q.category,
      action: q.type === "weekly" ? "weekly_quest" : "daily_quest",
      label: q.title,
      amount: q.xp,
      notes: q.description,
      source: "quest",
      refType: "quest",
      refId: q.id,
      key: "quest:" + q.id + ":complete"
    });

    store.commit(function () {
      q.status = STATUS.COMPLETED;
      q.progress = q.target;
      q.completedAt = new Date().toISOString();
    });

    /* Bonus de disciplina (configurable). No se aplica si la quest ya
       puntuaba en disciplina, para no contar dos veces lo mismo. */
    var bonus = C.QUESTS.disciplineBonus[q.type === "weekly" ? "weekly" : "daily"];
    if (bonus && q.category !== "discipline") {
      E.awardXP({
        category: "discipline",
        action: q.type === "weekly" ? "weekly" : "daily",
        label: (q.type === "weekly" ? "Misión semanal · " : "Misión diaria · ") + q.title,
        amount: bonus,
        source: "quest",
        refType: "quest",
        refId: q.id,
        key: "quest:" + q.id + ":bonus"
      });
    }

    return { ok: true, quest: q, xp: res.ok ? res.tx.amount : 0 };
  }

  /* Avance de una weekly con objetivo (3/5…). Al llegar, se completa. */
  function addProgress(id, delta) {
    var q = find(id);
    if (!q || q.status !== STATUS.ACTIVE) return { ok: false };
    var next = Math.max(0, Math.min(q.target, q.progress + (delta === undefined ? 1 : delta)));
    store.commit(function () {
      q.progress = next;
    });
    if (next >= q.target) return completeQuest(id);
    return { ok: true, quest: q };
  }

  function setStatus(id, status) {
    var q = find(id);
    if (!q || q.status === STATUS.COMPLETED) return false;
    store.commit(function () {
      q.status = status;
    });
    return true;
  }

  function skipQuest(id) {
    return setStatus(id, STATUS.SKIPPED);
  }
  function failQuest(id) {
    return setStatus(id, STATUS.FAILED);
  }

  /* Borrar una quest no devuelve el XP ya concedido: la transacción es
     el registro real. Se elimina también su XP para no dejar huérfanos. */
  function deleteQuest(id) {
    store.commit(function (s) {
      s.quests = s.quests.filter(function (q) {
        return q.id !== id;
      });
      s.xp = s.xp.filter(function (t) {
        return !(t.refType === "quest" && t.refId === id);
      });
    });
    return true;
  }

  /* ---------- Rollover ----------
     Cierra los periodos vencidos y regenera las quests recurrentes.
     Es idempotente: se puede llamar en cada arranque.               */
  function rollover() {
    var tk = todayKey();
    var wk = weekKey();
    var changed = 0;
    var toClone = [];

    store.commit(function (s) {
      s.quests.forEach(function (q) {
        var currentPeriod = q.type === "weekly" ? wk : tk;
        if (q.period === currentPeriod) return;

        if (q.status === STATUS.ACTIVE) {
          q.status = STATUS.FAILED;
          changed++;
        }
        if (q.recurring) toClone.push(q);
      });
    });

    /* Una sola copia por origin y periodo. */
    var seen = {};
    toClone.forEach(function (q) {
      var currentPeriod = q.type === "weekly" ? wk : tk;
      var key = (q.origin || q.id) + "|" + currentPeriod;
      if (seen[key]) return;
      seen[key] = true;

      var exists = all().some(function (x) {
        return x.type === q.type && x.period === currentPeriod && (x.origin || x.id) === (q.origin || q.id);
      });
      if (exists) return;

      createQuest({
        type: q.type,
        title: q.title,
        description: q.description,
        category: q.category,
        difficulty: q.difficulty,
        xp: q.xp,
        target: q.target,
        recurring: true,
        origin: q.origin || q.id,
        force: true
      });
      changed++;
    });

    return changed;
  }

  function questStats() {
    var list = all();
    var done = list.filter(function (q) {
      return q.status === STATUS.COMPLETED;
    });
    var today = daily();
    return {
      total: list.length,
      completed: done.length,
      completedToday: today.filter(function (q) {
        return q.status === STATUS.COMPLETED;
      }).length,
      activeToday: today.filter(function (q) {
        return q.status === STATUS.ACTIVE;
      }).length,
      slots: C.LIMITS.dailyQuests
    };
  }

  global.DS.quests = {
    STATUS: STATUS,
    all: all,
    daily: daily,
    weekly: weekly,
    find: find,
    createQuest: createQuest,
    completeQuest: completeQuest,
    addProgress: addProgress,
    skipQuest: skipQuest,
    failQuest: failQuest,
    deleteQuest: deleteQuest,
    rollover: rollover,
    questStats: questStats,
    defaultXP: defaultXP,
    todayKey: todayKey,
    weekKey: weekKey
  };
})(window);
