/* =========================================================
   DANI SYSTEM — motor de bosses
   Un boss es un problema grande de la vida real dividido en
   tareas. Parte del XP se reparte entre las tareas y el resto
   se cobra al derrotarlo. Todo con clave única: marcar y
   desmarcar no infla el XP.
   ========================================================= */

(function (global) {
  "use strict";

  var C = global.DS.config;
  var store = global.DS.store;
  var E = global.DS.engine;

  var STATUS = { ACTIVE: "ACTIVE", DEFEATED: "DEFEATED", ABANDONED: "ABANDONED" };

  function all() {
    return store.get().bosses;
  }

  function find(id) {
    var list = all();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function defaultXP(difficulty) {
    var base = C.DIFFICULTY_XP[difficulty] || C.DIFFICULTY_XP.NORMAL;
    var mult = C.BOSS_MULTIPLIER[difficulty] || C.BOSS_MULTIPLIER.NORMAL;
    return base * mult;
  }

  function createBoss(input) {
    input = input || {};
    var name = String(input.name || "").trim();
    if (!name) return { ok: false, reason: "name" };
    if (!C.category(input.category)) return { ok: false, reason: "category" };

    var difficulty = C.DIFFICULTIES.indexOf(input.difficulty) > -1 ? input.difficulty : "NORMAL";

    var tasks = (input.tasks || [])
      .map(function (t) {
        return typeof t === "string" ? t.trim() : String(t.title || "").trim();
      })
      .filter(Boolean)
      .map(function (title) {
        return { id: store.id("t"), title: title, done: false, doneAt: null };
      });

    var boss = {
      id: store.id("b"),
      name: name,
      description: String(input.description || "").trim(),
      category: input.category,
      difficulty: difficulty,
      xp:
        input.xp === undefined || input.xp === null || input.xp === ""
          ? defaultXP(difficulty)
          : Math.round(Number(input.xp) || 0),
      tasks: tasks,
      status: STATUS.ACTIVE,
      created: new Date().toISOString(),
      defeatedAt: null
    };

    store.commit(function (s) {
      s.bosses.push(boss);
    });
    return { ok: true, boss: boss };
  }

  function updateBoss(id, patch) {
    var b = find(id);
    if (!b) return { ok: false, reason: "missing" };
    store.commit(function () {
      ["name", "description", "category", "difficulty", "xp", "status"].forEach(function (k) {
        if (patch[k] !== undefined) b[k] = patch[k];
      });
    });
    return { ok: true, boss: b };
  }

  function addTask(bossId, title) {
    var b = find(bossId);
    title = String(title || "").trim();
    if (!b || !title) return { ok: false };
    store.commit(function () {
      b.tasks.push({ id: store.id("t"), title: title, done: false, doneAt: null });
    });
    return { ok: true };
  }

  function removeTask(bossId, taskId) {
    var b = find(bossId);
    if (!b) return false;
    store.commit(function (s) {
      b.tasks = b.tasks.filter(function (t) {
        return t.id !== taskId;
      });
      s.xp = s.xp.filter(function (t) {
        return t.key !== taskKey(bossId, taskId);
      });
    });
    return true;
  }

  function taskKey(bossId, taskId) {
    return "boss:" + bossId + ":task:" + taskId;
  }

  /* XP por tarea: reparto de BOSSES.taskShare entre todas las tareas. */
  function taskXP(boss) {
    if (!boss.tasks.length) return 0;
    return Math.round((boss.xp * C.BOSSES.taskShare) / boss.tasks.length);
  }

  function progress(boss) {
    if (!boss.tasks.length) return boss.status === STATUS.DEFEATED ? 100 : 0;
    var done = boss.tasks.filter(function (t) {
      return t.done;
    }).length;
    return (done / boss.tasks.length) * 100;
  }

  /* Marca/desmarca una tarea. Al desmarcar se retira su XP. */
  function completeBossTask(bossId, taskId, value) {
    var b = find(bossId);
    if (!b) return { ok: false, reason: "missing" };
    var task = null;
    for (var i = 0; i < b.tasks.length; i++) {
      if (b.tasks[i].id === taskId) task = b.tasks[i];
    }
    if (!task) return { ok: false, reason: "task" };

    var next = value === undefined ? !task.done : !!value;
    store.commit(function () {
      task.done = next;
      task.doneAt = next ? new Date().toISOString() : null;
    });

    var key = taskKey(bossId, taskId);
    if (next) {
      var share = taskXP(b);
      if (share > 0) {
        E.awardXP({
          category: b.category,
          action: "boss_task",
          label: b.name + " · " + task.title,
          amount: share,
          source: "boss",
          refType: "boss",
          refId: b.id,
          key: key
        });
      }
    } else {
      store.commit(function (s) {
        s.xp = s.xp.filter(function (t) {
          return t.key !== key;
        });
      });
    }

    var allDone =
      b.tasks.length > 0 &&
      b.tasks.every(function (t) {
        return t.done;
      });
    if (allDone && b.status !== STATUS.DEFEATED) return defeatBoss(bossId);

    return { ok: true, boss: b, progress: progress(b) };
  }

  /* Derrota: cobra el XP que no se repartió en tareas. */
  function defeatBoss(id) {
    var b = find(id);
    if (!b) return { ok: false, reason: "missing" };
    if (b.status === STATUS.DEFEATED) return { ok: false, reason: "done" };

    var paid = b.tasks.filter(function (t) {
      return t.done;
    }).length * taskXP(b);
    var rest = Math.max(0, b.xp - paid);

    store.commit(function () {
      b.status = STATUS.DEFEATED;
      b.defeatedAt = new Date().toISOString();
      b.tasks.forEach(function (t) {
        if (!t.done) {
          t.done = true;
          t.doneAt = b.defeatedAt;
        }
      });
    });

    E.emit([{ type: "boss", name: b.name, xp: b.xp }]);

    E.awardXP({
      category: b.category,
      action: "boss_defeat",
      label: "BOSS · " + b.name,
      amount: rest,
      notes: b.description,
      source: "boss",
      refType: "boss",
      refId: b.id,
      key: "boss:" + b.id + ":defeat"
    });

    return { ok: true, boss: b, xp: rest };
  }

  function deleteBoss(id) {
    store.commit(function (s) {
      s.bosses = s.bosses.filter(function (b) {
        return b.id !== id;
      });
      s.xp = s.xp.filter(function (t) {
        return !(t.refType === "boss" && t.refId === id);
      });
    });
    return true;
  }

  function bossStats() {
    var list = all();
    return {
      total: list.length,
      active: list.filter(function (b) {
        return b.status === STATUS.ACTIVE;
      }).length,
      defeated: list.filter(function (b) {
        return b.status === STATUS.DEFEATED;
      }).length
    };
  }

  global.DS.bosses = {
    STATUS: STATUS,
    all: all,
    find: find,
    createBoss: createBoss,
    updateBoss: updateBoss,
    addTask: addTask,
    removeTask: removeTask,
    completeBossTask: completeBossTask,
    defeatBoss: defeatBoss,
    deleteBoss: deleteBoss,
    progress: progress,
    taskXP: taskXP,
    defaultXP: defaultXP,
    bossStats: bossStats
  };
})(window);
