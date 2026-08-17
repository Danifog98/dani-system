/* =========================================================
   DANI SYSTEM — bloqueo por PIN
   Evita que cualquiera que abra la URL vea el sistema. El PIN
   se guarda como hash con sal, nunca en claro.
   No es cifrado: los datos siguen en localStorage y alguien con
   acceso al dispositivo y a las herramientas del navegador podría
   leerlos. Es una puerta, no una caja fuerte.
   ========================================================= */

(function (global) {
  "use strict";

  var store = global.DS.store;
  var SESSION = "dani:unlocked";
  var MIN = 4;
  var MAX = 8;

  function settings() {
    return store.get().settings;
  }

  function isEnabled() {
    return !!settings().pinHash;
  }

  function pinLength() {
    return settings().pinLength || MIN;
  }

  /* SHA-256 cuando hay contexto seguro (https o localhost). Si no lo
     hay —por ejemplo abriendo el archivo con file://— se usa un hash
     propio: más débil, pero el PIN nunca se guarda en claro. */
  function hash(pin, salt) {
    var text = "dani-system:" + salt + ":" + pin;
    var subtle = global.crypto && global.crypto.subtle;

    if (subtle && global.TextEncoder) {
      return subtle.digest("SHA-256", new global.TextEncoder().encode(text)).then(function (buf) {
        var bytes = new Uint8Array(buf);
        var out = "";
        for (var i = 0; i < bytes.length; i++) {
          out += bytes[i].toString(16).padStart(2, "0");
        }
        return out;
      });
    }
    return global.Promise.resolve(weak(text));
  }

  function weak(text) {
    var h1 = 0x811c9dc5;
    var h2 = 0xc2b2ae35;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      h1 = ((h1 ^ c) * 0x01000193) >>> 0;
      h2 = ((h2 + c) * 0x85ebca6b) >>> 0;
    }
    return "w" + h1.toString(16) + h2.toString(16);
  }

  function randomSalt() {
    if (global.crypto && global.crypto.getRandomValues) {
      var a = new Uint8Array(8);
      global.crypto.getRandomValues(a);
      return Array.prototype.map
        .call(a, function (b) {
          return b.toString(16).padStart(2, "0");
        })
        .join("");
    }
    return String(Date.now()) + Math.random().toString(36).slice(2);
  }

  function validPin(pin) {
    return /^\d+$/.test(pin) && pin.length >= MIN && pin.length <= MAX;
  }

  function setPin(pin) {
    if (!validPin(pin)) {
      return global.Promise.resolve({ ok: false, reason: "format" });
    }
    var salt = randomSalt();
    return hash(pin, salt).then(function (h) {
      store.commit(function (s) {
        s.settings.pinSalt = salt;
        s.settings.pinHash = h;
        s.settings.pinLength = pin.length;
      });
      markUnlocked();
      return { ok: true };
    });
  }

  function verify(pin) {
    var s = settings();
    if (!s.pinHash) return global.Promise.resolve(true);
    return hash(pin, s.pinSalt || "").then(function (h) {
      return h === s.pinHash;
    });
  }

  function removePin(pin) {
    return verify(pin).then(function (ok) {
      if (!ok) return { ok: false, reason: "wrong" };
      store.commit(function (s) {
        delete s.settings.pinHash;
        delete s.settings.pinSalt;
        delete s.settings.pinLength;
      });
      return { ok: true };
    });
  }

  function markUnlocked() {
    try {
      global.sessionStorage.setItem(SESSION, "1");
    } catch (e) {
      /* sin sessionStorage se pedirá el PIN en cada carga */
    }
  }

  function isUnlocked() {
    if (!isEnabled()) return true;
    try {
      return global.sessionStorage.getItem(SESSION) === "1";
    } catch (e) {
      return false;
    }
  }

  function lockNow() {
    try {
      global.sessionStorage.removeItem(SESSION);
    } catch (e) {}
  }

  global.DS.lock = {
    MIN: MIN,
    MAX: MAX,
    isEnabled: isEnabled,
    isUnlocked: isUnlocked,
    pinLength: pinLength,
    setPin: setPin,
    removePin: removePin,
    verify: verify,
    markUnlocked: markUnlocked,
    lockNow: lockNow,
    validPin: validPin
  };
})(window);
