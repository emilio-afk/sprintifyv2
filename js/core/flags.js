// flags.js — Motor de banderas del Tablero Astrolab (funciones puras, sin efectos)
//
// Cada ÍTEM tiene un measurementType ("hito" | "tasa" | "apuesta") y su bandera
// se calcula con el disparador propio de su tipo. La bandera del FRENTE es el
// roll-up (worst-of) de las banderas de sus ítems.
//
// Convención de colores: "green" | "yellow" | "red" | "gray" (sin datos).

export const FLAG_COLORS = ["gray", "green", "yellow", "orange", "red"];
// Severidad para el roll-up (worst-of). Naranja (vencido) pesa más que amarillo
// pero menos que rojo (bloqueado / murió).
const SEVERITY = { gray: 0, green: 1, yellow: 2, orange: 3, red: 4 };

const MS_DAY = 24 * 60 * 60 * 1000;

function atMidnight(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toDateSafe(value) {
  if (!value) return null;
  // Firestore Timestamp
  if (typeof value === "object" && typeof value.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a, b) {
  return Math.round((atMidnight(a) - atMidnight(b)) / MS_DAY);
}

// ¿La fecha cae dentro de la semana en curso (lunes–domingo) que contiene `today`?
function isThisWeek(target, today) {
  const t = atMidnight(today);
  const day = t.getDay(); // 0=dom
  const monday = new Date(t);
  monday.setDate(t.getDate() - day + (day === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const tt = atMidnight(target);
  return tt >= monday && tt <= sunday;
}

// ------------------ Banderas por tipo ------------------

// 🎯 HITO: guiado por ESTADO.
//   Bloqueado → 🔴 · Hecho → 🟢 · Fecha vencida (no hecho) → 🟠 ·
//   En curso → 🟢 · Pendiente → ⚪ gris.
export function flagForHito(item, today = new Date()) {
  const status = item?.status || "pending";
  if (item?.blocked) return { color: "red", reason: "Bloqueado, esperando a alguien" };
  if (status === "done") return { color: "green", reason: "Hito terminado" };

  const target = toDateSafe(item?.targetDate);
  if (target && daysBetween(target, today) < 0) {
    return { color: "orange", reason: "Fecha vencida sin terminar" };
  }
  if (status === "inprogress") return { color: "green", reason: "En curso" };
  return { color: "gray", reason: "Pendiente, sin empezar" };
}

// 📈 TASA: verde ≥90% del ritmo esperado · amarillo 70–90% · rojo <70% o cayendo
// 2 semanas seguidas. `history` opcional: array de reals de semanas previas.
export function flagForTasa(item, today = new Date()) {
  const meta = Number(item?.meta);
  const real = Number(item?.real);
  if (!Number.isFinite(meta) || meta <= 0 || !Number.isFinite(real)) {
    return { color: "gray", reason: "Sin meta/real capturados" };
  }
  const ratio = real / meta;

  const hist = Array.isArray(item?.history) ? item.history.map(Number).filter(Number.isFinite) : [];
  const fallingTwoWeeks =
    hist.length >= 2 &&
    real < hist[hist.length - 1] &&
    hist[hist.length - 1] < hist[hist.length - 2];

  if (ratio < 0.7 || fallingTwoWeeks) {
    return {
      color: "red",
      reason: fallingTwoWeeks ? "Cayendo 2 semanas seguidas" : "Por debajo del 70% del ritmo",
    };
  }
  if (ratio < 0.9) return { color: "yellow", reason: "Entre 70–90% del ritmo" };
  return { color: "green", reason: "Al 90%+ del ritmo esperado" };
}

// 🎲 APUESTA: verde avanzó (señal nueva esta semana) · amarillo no se movió ·
// rojo sin moverse 2+ semanas o evidencia de que no jala.
export function flagForApuesta(item, today = new Date()) {
  const st = item?.betStatus;
  if (st === "died") return { color: "red", reason: "Evidencia de que no jala" };
  if (st === "advanced") return { color: "green", reason: "Avanzó: señal nueva esta semana" };

  // "stalled" o sin estado: revisar hace cuánto no se mueve
  const lastMoved = toDateSafe(item?.lastMovedAt);
  if (lastMoved) {
    const idleDays = daysBetween(today, lastMoved);
    if (idleDays >= 14) return { color: "red", reason: "Sin moverse 2+ semanas" };
  }
  return { color: "yellow", reason: "No se movió esta semana" };
}

// Dispatcher por ítem
export function computeItemFlag(item, today = new Date()) {
  switch (item?.measurementType) {
    case "hito":
      return flagForHito(item, today);
    case "tasa":
      return flagForTasa(item, today);
    case "apuesta":
      return flagForApuesta(item, today);
    default:
      return { color: "gray", reason: "Sin tipo de medición" };
  }
}

// ------------------ Roll-up del frente ------------------

// Bandera del frente = la peor de sus ítems (worst-of).
export function rollUpFrenteFlag(items, today = new Date()) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return { color: "gray", reason: "Sin ítems" };

  let worst = { color: "gray", reason: "Sin ítems" };
  for (const it of list) {
    const f = computeItemFlag(it, today);
    if (SEVERITY[f.color] > SEVERITY[worst.color]) worst = f;
  }
  return worst;
}

// Resumen concatenado para la banda del lunes: "Hitos 2/5 · Tasa 18/40 · 1 apuesta".
export function summarizeFrente(items) {
  const list = Array.isArray(items) ? items : [];
  const hitos = list.filter((i) => i.measurementType === "hito");
  const tasas = list.filter((i) => i.measurementType === "tasa");
  const apuestas = list.filter((i) => i.measurementType === "apuesta");

  const parts = [];
  if (hitos.length) {
    const done = hitos.filter((h) => h.status === "done").length;
    parts.push(`Hitos ${done}/${hitos.length}`);
  }
  for (const t of tasas) {
    const meta = Number(t.meta);
    const real = Number(t.real);
    if (Number.isFinite(meta) && Number.isFinite(real)) {
      parts.push(`${t.title || "Tasa"} ${real}/${meta}`);
    }
  }
  if (apuestas.length) {
    const stalled = apuestas.filter((a) => a.betStatus !== "advanced").length;
    parts.push(
      apuestas.length === 1
        ? `1 apuesta${stalled ? " estancada" : ""}`
        : `${apuestas.length} apuestas`
    );
  }
  return parts.join(" · ");
}

export const FLAG_EMOJI = { green: "🟢", yellow: "🟡", orange: "🟠", red: "🔴", gray: "⚪" };
