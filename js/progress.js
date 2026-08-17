/* =========================================================
   DANI SYSTEM — logros y skills
   Evalúa las reglas declarativas de config.js y desbloquea.
   Idempotente: cada desbloqueo se guarda una vez y su XP lleva
   clave única, así que repetir check() no regala nada.
   ========================================================= */

(function (global) {
  "use strict";

  var C = global.DS.config;
  var store = global.DS.store;
  var E = global.DS.engine;

  /* ---------- Métricas que consumen las reglas ---------- */
  function metrics() {
    var s = store.get();
    var snap = E.snapshot();

    var completedQuests = s.quests.filter(function (q) {
      return q.status === "COMPLETED";
    }).length;

    var defeatedBosses = s.bosses.filter(function (b) {
      return b.status === "DEFEATED";
    }).length;

    var actionCount = {};
    var entryCount = {};
    s.xp.forEach(function (t) {
      var k = t.category + ":" + t.action;
      actionCount[k] = (actionCount[k] || 0) + 1;
      entryCount[t.category] = (entryCount[t.category] || 0) + 1;
    });

    var catXP = {};
    snap.stats.forEach(function (st) {
      catXP[st.id] = st.xp;
    });

    return {
      snap: snap,
      level: snap.level.level,
      power: snap.power,
      rankIndex: snap.rankIndex,
      quests: completedQuests,
      bosses: defeatedBosses,
      catXP: catXP,
      actionCount: actionCount,
      entryCount: entryCount
    };
  }

  function rankIndex(id) {
    for (var i = 0; i < C.RANKS.length; i++) {
      if (C.RANKS[i].id === id) return i;
    }
    return 0;
  }

  /* ---------- Evaluador de reglas ---------- */
  function meets(rule, m) {
    if (!rule) return false;
    switch (rule.type) {
      case "level":
        return m.level >= rule.value;
      case "power":
        return m.power >= rule.value;
      case "rank":
        return m.rankIndex >= rankIndex(rule.value);
      case "quests":
        return m.quests >= rule.value;
      case "bosses":
        return m.bosses >= rule.value;
      case "streak":
        return E.streak(streakCategories(rule.id)).current >= rule.value;
      case "catXP":
        return (m.catXP[rule.category] || 0) >= rule.value;
      case "action":
        return (m.actionCount[rule.category + ":" + rule.action] || 0) >= rule.value;
      case "entries":
        return (m.entryCount[rule.category] || 0) >= rule.value;
      default:
        return false;
    }
  }

  function streakCategories(id) {
    var tracked = C.STREAKS.tracked;
    for (var i = 0; i < tracked.length; i++) {
      if (tracked[i].id === id) return tracked[i].categories;
    }
    return null;
  }

  /* ---------- Estado de desbloqueo ---------- */
  function unlockedMap(key) {
    var map = {};
    store.get()[key].forEach(function (u) {
      map[u.id] = u;
    });
    return map;
  }

  function isUnlocked(key, id) {
    return !!unlockedMap(key)[id];
  }

  function unlock(kind, def) {
    var key = kind === "skill" ? "skills" : "achievements";
    if (isUnlocked(key, def.id)) return false;

    var entry = { id: def.id, unlockedAt: new Date().toISOString() };
    store.commit(function (s) {
      s[key].push(entry);
    });

    if (def.xp) {
      E.awardXP({
        category: "discipline",
        action: kind === "skill" ? "skill" : "achievement",
        label: (kind === "skill" ? "Skill · " : "Logro · ") + def.name,
        amount: def.xp,
        source: kind,
        refType: kind,
        refId: def.id,
        key: kind + ":" + def.id
      });
    }

    E.emit([
      {
        type: kind === "skill" ? "skill" : "achievement",
        name: def.name,
        desc: def.desc
      }
    ]);
    return true;
  }

  /* Desbloqueo manual (API pública para futuras integraciones). */
  function unlockAchievement(id) {
    var def = byId(C.ACHIEVEMENTS, id);
    return def ? unlock("achievement", def) : false;
  }
  function unlockSkill(id) {
    var def = byId(C.SKILLS, id);
    return def ? unlock("skill", def) : false;
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* ---------- Comprobación automática ----------
     Se llama tras cada evento del motor. El cerrojo evita
     recursión cuando un desbloqueo concede XP.               */
  var checking = false;

  function check() {
    if (checking) return 0;
    checking = true;
    var found = 0;
    try {
      var m = metrics();
      C.ACHIEVEMENTS.forEach(function (def) {
        if (!isUnlocked("achievements", def.id) && meets(def.rule, m)) {
          if (unlock("achievement", def)) found++;
        }
      });
      C.SKILLS.forEach(function (def) {
        if (!isUnlocked("skills", def.id) && meets(def.rule, m)) {
          if (unlock("skill", def)) found++;
        }
      });
    } finally {
      checking = false;
    }
    /* Un desbloqueo puede habilitar otro (XP en cascada). */
    if (found) check();
    return found;
  }

  /* ---------- Listados para la UI ---------- */
  function list(kind) {
    var defs = kind === "skill" ? C.SKILLS : C.ACHIEVEMENTS;
    var map = unlockedMap(kind === "skill" ? "skills" : "achievements");
    var m = metrics();
    return defs.map(function (def) {
      var u = map[def.id];
      return {
        id: def.id,
        name: def.name,
        desc: def.desc,
        xp: def.xp || 0,
        cat: def.cat || null,
        unlocked: !!u,
        unlockedAt: u ? u.unlockedAt : null,
        progress: ruleProgress(def.rule, m)
      };
    });
  }

  /* Progreso 0..1 hacia el requisito, para la barra de la tarjeta. */
  function ruleProgress(rule, m) {
    if (!rule) return 0;
    var current = 0,
      target = rule.value;
    switch (rule.type) {
      case "level":
        current = m.level;
        break;
      case "power":
        current = m.power;
        break;
      case "rank":
        current = m.rankIndex;
        target = rankIndex(rule.value);
        break;
      case "quests":
        current = m.quests;
        break;
      case "bosses":
        current = m.bosses;
        break;
      case "streak":
        current = E.streak(streakCategories(rule.id)).current;
        break;
      case "catXP":
        current = m.catXP[rule.category] || 0;
        break;
      case "action":
        current = m.actionCount[rule.category + ":" + rule.action] || 0;
        break;
      case "entries":
        current = m.entryCount[rule.category] || 0;
        break;
    }
    if (!target) return current > 0 ? 1 : 0;
    return Math.max(0, Math.min(1, current / target));
  }

  function counts() {
    return {
      achievements: {
        unlocked: store.get().achievements.length,
        total: C.ACHIEVEMENTS.length
      },
      skills: { unlocked: store.get().skills.length, total: C.SKILLS.length }
    };
  }

  E.on(function () {
    check();
  });

  global.DS.progress = {
    check: check,
    list: list,
    counts: counts,
    unlockAchievement: unlockAchievement,
    unlockSkill: unlockSkill,
    metrics: metrics
  };
})(window);
