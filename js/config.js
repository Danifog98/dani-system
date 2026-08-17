/* =========================================================
   DANI SYSTEM — configuración central
   ÚNICO sitio donde se tocan pesos, XP, niveles y ranks.
   Nada de esto debe repetirse en otros archivos.
   ========================================================= */

(function (global) {
  "use strict";

  /* ---------- Categorías y pesos (suman 1.00) ---------- */
  var CATEGORIES = [
    { id: "physical",   stat: "FÍSICO",             weight: 0.15, hue: 8   },
    { id: "combat",     stat: "COMBATE",            weight: 0.10, hue: 350 },
    { id: "tech",       stat: "TECNOLOGÍA",         weight: 0.15, hue: 190 },
    { id: "knowledge",  stat: "CONOCIMIENTO",       weight: 0.10, hue: 215 },
    { id: "wealth",     stat: "DINERO",             weight: 0.15, hue: 145 },
    { id: "trading",    stat: "TRADING",            weight: 0.10, hue: 165 },
    { id: "business",   stat: "NEGOCIOS",           weight: 0.15, hue: 45  },
    { id: "discipline", stat: "DISCIPLINA",         weight: 0.05, hue: 265 },
    { id: "problems",   stat: "PROBLEMAS RESUELTOS", weight: 0.05, hue: 30 }
  ];

  /* ---------- Acciones y XP ----------
     Cada acción: id, etiqueta, xp. `xp` negativo penaliza.
     `input` pide un dato extra (min = minutos, amount = importe).
     `scaled` usa la tabla DIFFICULTY_XP en vez de un valor fijo.        */
  var ACTIONS = {
    physical: [
      { id: "workout",     label: "Entrenamiento",        xp: 100 },
      { id: "pr",          label: "PR / récord personal", xp: 200 },
      { id: "cardio",      label: "Cardio",               xp: 50  },
      { id: "week_streak", label: "Semana completa",      xp: 500 }
    ],
    combat: [
      { id: "training",  label: "Entrenamiento",  xp: 100 },
      { id: "technique", label: "Técnica nueva",  xp: 150 },
      { id: "sparring",  label: "Sparring",       xp: 200 }
    ],
    tech: [
      { id: "study",        label: "Estudio 30 min",     xp: 50,   input: "min" },
      { id: "lesson",       label: "Lección completada", xp: 100 },
      { id: "problem",      label: "Problema resuelto",  xp: 200 },
      { id: "project_new",  label: "Proyecto funcional", xp: 500 },
      { id: "project_done", label: "Proyecto terminado", xp: 1000 }
    ],
    knowledge: [
      { id: "study",   label: "Estudio 30 min",   xp: 50, input: "min" },
      { id: "chapter", label: "Capítulo",         xp: 100 },
      { id: "book",    label: "Libro terminado",  xp: 500 },
      { id: "course",  label: "Curso terminado",  xp: 1000 },
      { id: "applied", label: "Aplicado en real", xp: 300 }
    ],
    wealth: [
      { id: "saved",       label: "Ahorro registrado",   xp: 100, input: "amount" },
      { id: "income",      label: "Ingreso registrado",  xp: 100, input: "amount" },
      { id: "expense_cut", label: "Gasto recortado",     xp: 100 },
      { id: "invested",    label: "Inversión periódica", xp: 150, input: "amount" },
      { id: "milestone",   label: "Milestone financiero", xp: 1000 }
    ],
    trading: [
      { id: "study",         label: "Estudio",              xp: 50, input: "min" },
      { id: "backtest",      label: "Backtesting",          xp: 100 },
      { id: "journal",       label: "Journal de operación", xp: 50 },
      { id: "rules_ok",      label: "Reglas respetadas",    xp: 150 },
      { id: "review",        label: "Revisión de errores",  xp: 100 },
      { id: "rules_broken",  label: "Reglas incumplidas",   xp: -150 }
    ],
    business: [
      { id: "idea",          label: "Idea desarrollada",   xp: 50   },
      { id: "design",        label: "Diseño terminado",    xp: 100  },
      { id: "content",       label: "Contenido publicado", xp: 100  },
      { id: "product",       label: "Producto terminado",  xp: 500  },
      { id: "website",       label: "Web funcional",       xp: 500  },
      { id: "first_client",  label: "Primer cliente",      xp: 1000 },
      { id: "rev_1k",        label: "1.000 € en ventas",   xp: 2000 },
      { id: "rev_10k",       label: "10.000 € en ventas",  xp: 5000 },
      { id: "drop_soldout",  label: "Drop agotado",        xp: 5000 }
    ],
    discipline: [
      { id: "daily",   label: "Misión diaria",     xp: 100 },
      { id: "weekly",  label: "Misión semanal",    xp: 500 },
      { id: "avoided", label: "Tarea que evitaba", xp: 200 }
    ],
    problems: [
      { id: "solved", label: "Problema resuelto", scaled: true }
    ]
  };

  /* ---------- Dificultad ---------- */
  var DIFFICULTIES = ["EASY", "NORMAL", "HARD", "EPIC", "LEGENDARY"];

  var DIFFICULTY_XP = {
    EASY: 100,
    NORMAL: 200,
    HARD: 400,
    EPIC: 800,
    LEGENDARY: 1500
  };

  /* XP de un Boss = DIFFICULTY_XP · BOSS_MULTIPLIER. */
  var BOSS_MULTIPLIER = { EASY: 2, NORMAL: 3, HARD: 4, EPIC: 5, LEGENDARY: 6 };

  var BOSSES = {
    /* Parte del XP que se reparte entre las tareas; el resto se cobra
       al derrotar al boss. Desmarcar una tarea devuelve su XP. */
    taskShare: 0.3
  };

  /* ---------- Niveles ----------
     Umbrales manuales hasta 10; después, fórmula escalable:
     el salto crece un GROWTH% por nivel.                            */
  var LEVELS = [0, 1000, 2500, 5000, 8000, 12000, 17000, 23000, 30000, 40000];

  var LEVEL_FORMULA = {
    lastStep: 10000, // salto entre nivel 9 y 10
    growth: 1.15,
    max: 200
  };

  /* ---------- Ranks (sobre TOTAL POWER) ---------- */
  var RANKS = [
    { id: "F",         min: 0    },
    { id: "E",         min: 400  },
    { id: "D",         min: 900  },
    { id: "C",         min: 1600 },
    { id: "B",         min: 2600 },
    { id: "A",         min: 4000 },
    { id: "S",         min: 5800 },
    { id: "SS",        min: 7200 },
    { id: "SSS",       min: 8600 },
    { id: "LEGENDARY", min: 9500 }
  ];

  /* ---------- Stats ----------
     mastery% de un stat = XP de su categoría / MASTERY_XP.
     STAT_CURVE define el nivel del stat.                            */
  var STATS = {
    masteryXP: 50000,   // XP de una categoría que equivale al 100 %
    curveBase: 500,     // XP del nivel 2 del stat
    curveGrowth: 1.35,
    inactiveDays: 5     // días sin actividad = categoría abandonada
  };

  /* ---------- Total Power ----------
     Fórmula única y determinista (engine.snapshot):

       mastery(cat) = min(100, XP(cat) / STATS.masteryXP · 100)
       POWER        = Σ( peso(cat) · mastery(cat) ) · masteryScale
                      + nivel · perLevel

     Con los pesos sumando 1, Σ(peso · mastery) va de 0 a 100, así que
     el término de stats aporta 0..10.000 y el nivel suma perLevel por
     nivel. Cambiar un stat cambia el power; no hay números sueltos.   */
  var POWER = {
    masteryScale: 100,
    perLevel: 25
  };

  var LIMITS = {
    dailyQuests: 5,
    recommendations: 3
  };

  /* ---------- Quests ---------- */
  var QUESTS = {
    weeklyMultiplier: 2.5, // XP por defecto de una weekly = dificultad · esto
    /* Bonus de DISCIPLINA al cumplir una misión (spec: diaria 100 / semanal 500).
       No se suma si la propia quest ya es de disciplina. */
    disciplineBonus: { daily: 100, weekly: 500 }
  };

  /* ---------- Streaks ----------
     grace: días que se pueden fallar sin romper la racha.
     La racha motiva; no castiga un día de descanso.                   */
  var STREAKS = {
    grace: 1,
    tracked: [
      { id: "daily",     label: "DIARIA",      categories: null },
      { id: "physical",  label: "GYM",          categories: ["physical", "combat"] },
      { id: "tech",      label: "TECNOLOGÍA",   categories: ["tech"] },
      { id: "knowledge", label: "ESTUDIO",      categories: ["knowledge"] },
      { id: "business",  label: "NEGOCIOS",     categories: ["business"] }
    ]
  };

  /* ---------- Finanzas ----------
     Milestones sobre el patrimonio (ahorro + inversión). Al cruzar uno
     se concede XP una sola vez.                                       */
  var FINANCE = {
    currency: "€",
    milestones: [1000, 5000, 10000, 25000, 50000, 100000],
    types: [
      { id: "saving",     label: "Ahorro",    action: "saved",    sign: 1,  worth: true },
      { id: "investment", label: "Inversión", action: "invested", sign: 1,  worth: true },
      { id: "income",     label: "Ingreso",   action: "income",   sign: 1,  worth: false },
      { id: "expense",    label: "Gasto",     action: null,       sign: -1, worth: false }
    ]
  };

  /* ---------- Trading ----------
     El XP premia proceso, nunca resultado ni riesgo. Un journal con las
     reglas respetadas puntúa; incumplirlas resta.                     */
  var TRADING = {
    xp: { journal: "journal", rulesOk: "rules_ok", rulesBroken: "rules_broken" },
    results: ["WIN", "LOSS", "BREAKEVEN"],
    emotions: ["CALMA", "DUDA", "FOMO", "FRUSTRACIÓN", "EUFORIA"]
  };

  /* ---------- Reglas de desbloqueo ----------
     Declarativas: las evalúa progress.js. Tipos disponibles:
       level        → nivel mínimo
       rank         → rank mínimo (id)
       power        → total power mínimo
       quests       → nº de quests completadas
       bosses       → nº de bosses derrotados
       streak       → racha (id de STREAKS.tracked) mínima
       catXP        → XP mínimo en una categoría
       action       → nº de veces registrada una acción concreta
       entries      → nº de registros en una categoría
     `xp` es la recompensa opcional al desbloquear.                  */
  var ACHIEVEMENTS = [
    { id: "first_quest",  name: "FIRST BLOOD",         desc: "Completa tu primera quest",            xp: 100, rule: { type: "quests", value: 1 } },
    { id: "iron_streak",  name: "CONSTANCIA DE HIERRO", desc: "7 días seguidos de actividad",         xp: 300, rule: { type: "streak", id: "daily", value: 7 } },
    { id: "builder",      name: "BUILDER",             desc: "Termina tu primer proyecto técnico",   xp: 300, rule: { type: "action", category: "tech", action: "project_done", value: 1 } },
    { id: "entrepreneur", name: "ENTREPRENEUR",        desc: "Consigue el primer cliente",           xp: 500, rule: { type: "action", category: "business", action: "first_client", value: 1 } },
    { id: "boss_slayer",  name: "BOSS SLAYER",         desc: "Derrota tu primer boss",               xp: 300, rule: { type: "bosses", value: 1 } },
    { id: "level_10",     name: "LEVEL 10",            desc: "Alcanza el nivel 10",                  xp: 500, rule: { type: "level", value: 10 } },
    { id: "milestone",    name: "MILESTONE",           desc: "Primer milestone financiero",          xp: 300, rule: { type: "action", category: "wealth", action: "milestone", value: 1 } },
    { id: "solver_10",    name: "SOLVER X10",          desc: "Resuelve 10 problemas reales",         xp: 400, rule: { type: "entries", category: "problems", value: 10 } },
    { id: "rank_c",       name: "RANK C",              desc: "Alcanza el rank C",                    xp: 500, rule: { type: "rank", value: "C" } },
    { id: "quests_50",    name: "OPERADOR",            desc: "Completa 50 quests",                   xp: 500, rule: { type: "quests", value: 50 } }
  ];

  var SKILLS = [
    { id: "discipline_1",  name: "DISCIPLINA I",  desc: "5 días seguidos de actividad",        cat: "discipline", rule: { type: "streak", id: "daily", value: 5 } },
    { id: "discipline_2",  name: "DISCIPLINA II", desc: "21 días seguidos de actividad",       cat: "discipline", rule: { type: "streak", id: "daily", value: 21 } },
    { id: "focus_1",       name: "FOCUS I",       desc: "2.000 XP en tecnología",              cat: "tech",       rule: { type: "catXP", category: "tech", value: 2000 } },
    { id: "tech_builder",  name: "TECH BUILDER",  desc: "Un proyecto técnico terminado",       cat: "tech",       rule: { type: "action", category: "tech", action: "project_done", value: 1 } },
    { id: "entrepreneur_1", name: "ENTREPRENEUR I", desc: "3.000 XP en negocios",              cat: "business",   rule: { type: "catXP", category: "business", value: 3000 } },
    { id: "risk_keeper",   name: "RISK KEEPER",   desc: "10 operaciones respetando las reglas", cat: "trading",    rule: { type: "action", category: "trading", action: "rules_ok", value: 10 } },
    { id: "iron_body",     name: "IRON BODY",     desc: "5.000 XP en físico",                  cat: "physical",   rule: { type: "catXP", category: "physical", value: 5000 } },
    { id: "boss_hunter",   name: "BOSS HUNTER",   desc: "3 bosses derrotados",                 cat: "problems",   rule: { type: "bosses", value: 3 } },
    { id: "iron_mind",     name: "IRON MIND",     desc: "Alcanza el nivel 10",                 cat: "discipline", rule: { type: "level", value: 10 } }
  ];

  /* ---------- Helpers de configuración ---------- */
  function category(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return null;
  }

  function categoryName(id) {
    var c = category(id);
    return c ? c.stat : String(id || "").toUpperCase();
  }

  function action(categoryId, actionId) {
    var list = ACTIONS[categoryId] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === actionId) return list[i];
    }
    return null;
  }

  /* XP de una acción, ya resuelta con su dificultad o su input. */
  function actionXP(categoryId, actionId, opts) {
    var def = action(categoryId, actionId);
    if (!def) return 0;
    opts = opts || {};

    if (def.scaled) {
      return DIFFICULTY_XP[opts.difficulty || "NORMAL"] || DIFFICULTY_XP.NORMAL;
    }
    /* Las acciones por minutos escalan en bloques de 30. */
    if (def.input === "min" && opts.minutes) {
      var blocks = Math.max(1, Math.round(Number(opts.minutes) / 30));
      return def.xp * blocks;
    }
    return def.xp;
  }

  global.DS = global.DS || {};
  global.DS.config = {
    CATEGORIES: CATEGORIES,
    ACTIONS: ACTIONS,
    DIFFICULTIES: DIFFICULTIES,
    DIFFICULTY_XP: DIFFICULTY_XP,
    BOSS_MULTIPLIER: BOSS_MULTIPLIER,
    BOSSES: BOSSES,
    FINANCE: FINANCE,
    TRADING: TRADING,
    ACHIEVEMENTS: ACHIEVEMENTS,
    SKILLS: SKILLS,
    LEVELS: LEVELS,
    LEVEL_FORMULA: LEVEL_FORMULA,
    RANKS: RANKS,
    STATS: STATS,
    POWER: POWER,
    LIMITS: LIMITS,
    QUESTS: QUESTS,
    STREAKS: STREAKS,
    category: category,
    categoryName: categoryName,
    action: action,
    actionXP: actionXP
  };
})(window);
