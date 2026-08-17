/* =========================================================
   DANI SYSTEM — journal de trading
   El XP premia el proceso: registrar la operación y respetar
   las reglas. El resultado y el riesgo NO dan XP; incumplir
   las reglas resta. Nunca se premia arriesgar más.
   ========================================================= */

(function (global) {
  "use strict";

  var C = global.DS.config;
  var store = global.DS.store;
  var E = global.DS.engine;

  function all() {
    return store.get().trades;
  }

  function addTrade(input) {
    input = input || {};
    var strategy = String(input.strategy || "").trim();
    if (!strategy) return { ok: false, reason: "strategy" };

    var trade = {
      id: store.id("tr"),
      ts: input.ts || new Date().toISOString(),
      strategy: strategy,
      setup: String(input.setup || "").trim(),
      entry: String(input.entry || "").trim(),
      exit: String(input.exit || "").trim(),
      result: C.TRADING.results.indexOf(input.result) > -1 ? input.result : "BREAKEVEN",
      risk: String(input.risk || "").trim(),
      rulesFollowed: !!input.rulesFollowed,
      reviewed: !!input.reviewed,
      emotion: C.TRADING.emotions.indexOf(input.emotion) > -1 ? input.emotion : "",
      notes: String(input.notes || "").trim()
    };

    store.commit(function (s) {
      s.trades.push(trade);
    });

    /* 1) Registrar la operación en el journal siempre puntúa. */
    E.awardXP({
      category: "trading",
      action: C.TRADING.xp.journal,
      label: "Journal · " + trade.strategy,
      notes: trade.notes,
      source: "trading",
      refType: "trade",
      refId: trade.id,
      key: "trade:" + trade.id + ":journal"
    });

    /* 2) Disciplina: respetar las reglas suma, incumplirlas resta.
          El resultado (WIN/LOSS) no interviene. */
    var action = trade.rulesFollowed ? C.TRADING.xp.rulesOk : C.TRADING.xp.rulesBroken;
    E.awardXP({
      category: "trading",
      action: action,
      label: (trade.rulesFollowed ? "Reglas respetadas · " : "Reglas incumplidas · ") + trade.strategy,
      source: "trading",
      refType: "trade",
      refId: trade.id,
      key: "trade:" + trade.id + ":rules"
    });

    /* 3) Revisar los errores también es proceso. */
    if (trade.reviewed) {
      E.awardXP({
        category: "trading",
        action: "review",
        label: "Revisión · " + trade.strategy,
        source: "trading",
        refType: "trade",
        refId: trade.id,
        key: "trade:" + trade.id + ":review"
      });
    }

    return { ok: true, trade: trade };
  }

  function deleteTrade(id) {
    store.commit(function (s) {
      s.trades = s.trades.filter(function (t) {
        return t.id !== id;
      });
      s.xp = s.xp.filter(function (t) {
        return !(t.refType === "trade" && t.refId === id);
      });
    });
    return true;
  }

  /* Estadísticas de proceso, no de rentabilidad. */
  function stats() {
    var list = all();
    var followed = list.filter(function (t) {
      return t.rulesFollowed;
    }).length;
    var reviewed = list.filter(function (t) {
      return t.reviewed;
    }).length;
    var byResult = { WIN: 0, LOSS: 0, BREAKEVEN: 0 };
    list.forEach(function (t) {
      if (byResult[t.result] !== undefined) byResult[t.result]++;
    });
    return {
      total: list.length,
      followed: followed,
      reviewed: reviewed,
      discipline: list.length ? (followed / list.length) * 100 : 0,
      byResult: byResult
    };
  }

  global.DS.trading = {
    all: all,
    addTrade: addTrade,
    deleteTrade: deleteTrade,
    stats: stats
  };
})(window);
