/* =========================================================
   DANI SYSTEM — finanzas
   Tracking personal, nada de bancos ni datos sensibles: solo
   importes que se escriben a mano. El XP premia progreso real
   (ahorrar, invertir, ingresar), nunca el gasto.
   ========================================================= */

(function (global) {
  "use strict";

  var C = global.DS.config;
  var store = global.DS.store;
  var E = global.DS.engine;

  function typeDef(id) {
    var t = C.FINANCE.types;
    for (var i = 0; i < t.length; i++) {
      if (t[i].id === id) return t[i];
    }
    return null;
  }

  function all() {
    return store.get().finance;
  }

  /* ---------- Añadir movimiento ---------- */
  function addEntry(input) {
    input = input || {};
    var def = typeDef(input.type);
    if (!def) return { ok: false, reason: "type" };

    var amount = Math.round((Number(input.amount) || 0) * 100) / 100;
    if (!amount) return { ok: false, reason: "amount" };

    var entry = {
      id: store.id("f"),
      ts: input.ts || new Date().toISOString(),
      type: def.id,
      amount: Math.abs(amount),
      note: String(input.note || "").trim()
    };

    store.commit(function (s) {
      s.finance.push(entry);
    });

    /* XP solo en los movimientos que suponen progreso. */
    if (def.action) {
      E.awardXP({
        category: "wealth",
        action: def.action,
        label: def.label + " · " + fmt(entry.amount),
        amount: C.actionXP("wealth", def.action, { amount: entry.amount }),
        notes: entry.note,
        source: "finance",
        refType: "finance",
        refId: entry.id,
        key: "fin:" + entry.id
      });
    }

    checkMilestones();
    return { ok: true, entry: entry };
  }

  function deleteEntry(id) {
    store.commit(function (s) {
      s.finance = s.finance.filter(function (e) {
        return e.id !== id;
      });
      s.xp = s.xp.filter(function (t) {
        return !(t.refType === "finance" && t.refId === id);
      });
    });
    return true;
  }

  /* ---------- Resumen ---------- */
  function summary(from) {
    var out = { saving: 0, investment: 0, income: 0, expense: 0, netWorth: 0, entries: 0 };
    all().forEach(function (e) {
      if (from && new Date(e.ts).getTime() < from) return;
      if (out[e.type] === undefined) return;
      out[e.type] += e.amount;
      out.entries++;
    });
    out.netWorth = totalWorth();
    out.flow = out.income - out.expense;
    return out;
  }

  /* El patrimonio siempre se calcula sobre todo el histórico. */
  function totalWorth() {
    var worth = 0;
    all().forEach(function (e) {
      var def = typeDef(e.type);
      if (def && def.worth) worth += e.amount * def.sign;
    });
    return worth;
  }

  /* ---------- Milestones ----------
     Se concede XP una vez por umbral cruzado, con clave única. */
  function checkMilestones() {
    var worth = totalWorth();
    C.FINANCE.milestones.forEach(function (m) {
      if (worth < m) return;
      var key = "fin:milestone:" + m;
      if (E.hasKey(key)) return;
      E.awardXP({
        category: "wealth",
        action: "milestone",
        label: "Milestone · " + fmt(m),
        source: "finance",
        refType: "milestone",
        refId: String(m),
        key: key
      });
      E.emit([{ type: "milestone", value: m }]);
    });
  }

  function milestones() {
    var worth = totalWorth();
    return C.FINANCE.milestones.map(function (m) {
      return {
        value: m,
        reached: worth >= m,
        progress: Math.max(0, Math.min(1, worth / m))
      };
    });
  }

  function nextMilestone() {
    var worth = totalWorth();
    for (var i = 0; i < C.FINANCE.milestones.length; i++) {
      if (worth < C.FINANCE.milestones[i]) return C.FINANCE.milestones[i];
    }
    return null;
  }

  function fmt(n) {
    return (
      Math.round(Number(n) || 0).toLocaleString("es-ES") + " " + C.FINANCE.currency
    );
  }

  global.DS.finance = {
    all: all,
    addEntry: addEntry,
    deleteEntry: deleteEntry,
    summary: summary,
    totalWorth: totalWorth,
    milestones: milestones,
    nextMilestone: nextMilestone,
    checkMilestones: checkMilestones,
    typeDef: typeDef,
    fmt: fmt
  };
})(window);
