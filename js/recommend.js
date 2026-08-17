/* =========================================================
   DANI SYSTEM — recomendaciones
   Motor de reglas determinista: mira stats abandonados, bosses
   parados, rachas en riesgo y huecos de misiones, y propone unas
   pocas quests. Sin IA y sin generar listas infinitas.
   ========================================================= */

(function (global) {
  "use strict";

  var C = global.DS.config;
  var store = global.DS.store;
  var E = global.DS.engine;
  var Q = global.DS.quests;
  var B = global.DS.bosses;

  /* Acción recomendada por categoría: la que representa una sesión
     normal de trabajo, no el premio grande. */
  var SUGGESTED = {
    physical: { action: "workout", title: "Entrenar 60 minutos" },
    combat: { action: "training", title: "Sesión de combate" },
    tech: { action: "study", title: "90 minutos de Claude Code", minutes: 90 },
    knowledge: { action: "study", title: "60 minutos de estudio", minutes: 60 },
    wealth: { action: "expense_cut", title: "Revisar gastos del mes" },
    trading: { action: "backtest", title: "Sesión de backtesting" },
    business: { action: "idea", title: "Avanzar el proyecto de negocio" },
    discipline: { action: "avoided", title: "Hacer la tarea que estás evitando" },
    problems: { action: "solved", title: "Resolver un problema pendiente" }
  };

  function suggestionFor(catId) {
    var s = SUGGESTED[catId];
    if (!s) return null;
    var xp = C.actionXP(catId, s.action, { minutes: s.minutes, difficulty: "NORMAL" });
    return { title: s.title, xp: Math.max(50, xp) };
  }

  /* Evita repetir una recomendación que ya está como quest activa hoy. */
  function alreadyQueued(title) {
    return Q.daily().some(function (q) {
      return q.title === title && q.status === Q.STATUS.ACTIVE;
    });
  }

  function getRecommendations() {
    var snap = E.snapshot();
    var out = [];

    /* 1. Racha en riesgo: hay racha viva pero hoy no se ha registrado nada. */
    var streak = E.streak(null);
    if (streak.current >= 3 && !streak.active) {
      out.push({
        id: "streak",
        kicker: "Racha en riesgo",
        detail: "Llevas " + streak.current + " días seguidos y hoy no hay actividad.",
        category: "discipline",
        title: "Registrar una acción hoy",
        xp: C.actionXP("discipline", "daily")
      });
    }

    /* 2. Stats abandonados, empezando por el de más peso. */
    var idle = snap.stats
      .filter(function (st) {
        return st.xp > 0 && st.neglected;
      })
      .sort(function (a, b) {
        return b.weight * b.daysIdle - a.weight * a.daysIdle;
      });

    idle.forEach(function (st) {
      var s = suggestionFor(st.id);
      if (!s) return;
      out.push({
        id: "idle:" + st.id,
        kicker: st.stat,
        detail: st.daysIdle + " días sin actividad.",
        category: st.id,
        title: s.title,
        xp: s.xp
      });
    });

    /* 3. Bosses empezados y parados. */
    B.all().forEach(function (b) {
      if (b.status === B.STATUS.DEFEATED) return;
      var pending = b.tasks.filter(function (t) {
        return !t.done;
      });
      if (!pending.length || pending.length === b.tasks.length) return;

      var last = 0;
      b.tasks.forEach(function (t) {
        if (t.doneAt) last = Math.max(last, new Date(t.doneAt).getTime());
      });
      var days = last ? Math.floor((Date.now() - last) / E.DAY) : null;
      if (days === null || days < 3) return;

      out.push({
        id: "boss:" + b.id,
        kicker: "Boss parado",
        detail: b.name + " · " + days + " días sin avanzar · " + pending.length + " tareas.",
        category: b.category,
        title: pending[0].title,
        xp: B.taskXP(b) || C.DIFFICULTY_XP.NORMAL
      });
    });

    /* 4. Categoría de peso alto sin empezar. */
    snap.stats
      .filter(function (st) {
        return st.xp === 0 && st.weight >= 0.15;
      })
      .forEach(function (st) {
        var s = suggestionFor(st.id);
        if (!s) return;
        out.push({
          id: "start:" + st.id,
          kicker: st.stat,
          detail: "Sin actividad registrada todavía.",
          category: st.id,
          title: s.title,
          xp: s.xp
        });
      });

    /* 5. Sin misiones activas hoy: proponer la categoría más fuerte
          para no romper la inercia. */
    if (!Q.questStats().activeToday && !out.length) {
      var best = snap.stats.slice().sort(function (a, b) {
        return b.growth - a.growth;
      })[0];
      if (best) {
        var s2 = suggestionFor(best.id);
        if (s2) {
          out.push({
            id: "keep:" + best.id,
            kicker: "Mantener el ritmo",
            detail: "Hoy no tienes misiones activas.",
            category: best.id,
            title: s2.title,
            xp: s2.xp
          });
        }
      }
    }

    return out
      .filter(function (r) {
        return !alreadyQueued(r.title);
      })
      .slice(0, C.LIMITS.recommendations);
  }

  /* Convierte una recomendación en daily quest real. */
  function acceptRecommendation(rec) {
    if (!rec) return { ok: false, reason: "missing" };
    return Q.createQuest({
      title: rec.title,
      description: rec.detail,
      category: rec.category,
      difficulty: "NORMAL",
      xp: rec.xp
    });
  }

  /* Marca una recomendación como descartada por hoy. */
  function dismiss(id) {
    var day = E.dayKey(Date.now());
    store.commit(function (s) {
      if (!s.settings.dismissed || s.settings.dismissedDay !== day) {
        s.settings.dismissed = [];
        s.settings.dismissedDay = day;
      }
      if (s.settings.dismissed.indexOf(id) === -1) s.settings.dismissed.push(id);
    });
  }

  function visibleRecommendations() {
    var s = store.get().settings;
    var day = E.dayKey(Date.now());
    var hidden = s.dismissedDay === day && s.dismissed ? s.dismissed : [];
    return getRecommendations().filter(function (r) {
      return hidden.indexOf(r.id) === -1;
    });
  }

  global.DS.recommend = {
    getRecommendations: getRecommendations,
    visibleRecommendations: visibleRecommendations,
    acceptRecommendation: acceptRecommendation,
    dismiss: dismiss
  };
})(window);
