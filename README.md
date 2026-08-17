# DANI SYSTEM

Sistema personal de progresión estilo RPG: convierte acciones reales
(entrenar, estudiar, programar, negocio, ahorro, trading, problemas
resueltos) en XP, niveles, rangos, stats, misiones, bosses, skills y logros.

Web estática: HTML, CSS y JavaScript sin dependencias, sin build y sin
llamadas externas. Se publica tal cual en cualquier hosting estático.

## Cómo funciona

Todo el progreso se guarda como **transacciones de XP** en el `localStorage`
del navegador. El total, el nivel, el rango, los stats y el Total Power se
recalculan siempre a partir de ellas: no hay contadores almacenados que puedan
desincronizarse. Cada acción irrepetible (completar una misión, derrotar un
boss, cruzar un milestone) lleva una clave única, así que refrescar o repetir
la acción nunca duplica XP.

Los datos **no salen del dispositivo**: no hay servidor, cuentas ni analítica.
Por eso conviene exportar una copia de vez en cuando (Más → Ajustes).

## Estructura

```
index.html            Una sola página con todas las vistas
css/system.css        Estilos del HUD (tokens en :root)
fonts/                Inter en woff2, autoalojada
js/config.js          ÚNICA fuente de pesos, XP por acción, niveles y rangos
js/store.js           Persistencia en localStorage y migración de esquema
js/engine.js          XP, niveles, rangos, stats, power, rachas y analítica
js/quests.js          Misiones diarias y semanales, recurrencia y rollover
js/bosses.js          Bosses, tareas y recompensas
js/progress.js        Skills y logros con reglas declarativas
js/finance.js         Ahorro, inversión, patrimonio y milestones
js/trading.js         Journal: premia el proceso, no el riesgo
js/recommend.js       Recomendaciones deterministas (máximo 3)
js/lock.js            Bloqueo por PIN (hash con sal)
js/ui.js              Render, navegación y notificaciones
```

## Qué se toca para ajustar el sistema

**Todo lo numérico vive en `js/config.js`**: pesos de las categorías, XP de
cada acción, tabla de niveles y fórmula posterior, umbrales de rango, curva de
los stats, fórmula del Total Power, dificultades, milestones financieros y
requisitos de skills y logros. No hay valores repartidos por el resto del
código.

## Privacidad

El PIN (Más → Ajustes) impide que se abra desde el navegador de otra persona:
se guarda como hash con sal, nunca en claro. **No es cifrado**: quien tenga el
dispositivo desbloqueado y abra las herramientas del navegador puede leer el
`localStorage`. Es una puerta, no una caja fuerte.

## Publicación

No necesita build. En GitHub Pages basta con servir la raíz de `main`
(Settings → Pages → Deploy from a branch → main / root).

## Uso en iPhone

Abrir la URL en Safari y usar «Añadir a pantalla de inicio»: arranca a
pantalla completa con su propio icono. Cada dispositivo guarda sus propios
datos; para llevarlos de uno a otro, exporta la copia e impórtala.
