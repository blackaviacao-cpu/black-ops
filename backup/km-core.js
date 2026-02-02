/* =====================================================
   KM CORE — BLACK OPS
   Motor único de cálculo (Node + Browser)
===================================================== */

/* =========================
   TARIFAS
========================= */
const TARIFA_30 = 0.30; // 06–18
const TARIFA_60 = 0.60; // 18–06
const TARIFA_90 = 0.90; // domingo / feriado

/* =========================
   DATAS
========================= */
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/* =========================
   FERIADOS
========================= */
function keyDate(d) {
  return (
    d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function isHoliday(d, feriadosSet) {
  return feriadosSet && feriadosSet.has(keyDate(d));
}

/* =========================
   CORE — REMUNERAÇÃO KM
========================= */
function calcularRemuneracaoKm(startLocal, endLocal, distKm, feriadosSet) {

  const totalMin = (endLocal - startLocal) / 60000;
  if (totalMin <= 0 || distKm <= 0) {
    return zero();
  }

  let km30 = 0;
  let km60 = 0;
  let km90 = 0;

  let cursor = new Date(startLocal);

  while (cursor < endLocal) {
    const dia = dateOnly(cursor);
    const limiteDia =
      addDays(dia, 1) < endLocal ? addDays(dia, 1) : endLocal;

    const domingo = dia.getDay() === 0;
    const feriado = isHoliday(dia, feriadosSet);

    // Domingo ou feriado → tudo 0,90
    if (domingo || feriado) {
      const minutos = (limiteDia - cursor) / 60000;
      km90 += distKm * (minutos / totalMin);
      cursor = limiteDia;
      continue;
    }

    // Dia útil / sábado
    const t06 = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 6, 0);
    const t18 = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 18, 0);

    acumular(dia, t06, limiteDia, "60");
    acumular(t06, t18, limiteDia, "30");
    acumular(t18, limiteDia, limiteDia, "60");

    cursor = limiteDia;
  }

  const val30 = km30 * TARIFA_30;
  const val60 = km60 * TARIFA_60;
  const val90 = km90 * TARIFA_90;

  return {
    km30,
    km60,
    km90,
    val30,
    val60,
    val90,
    valorTotal: val30 + val60 + val90
  };

  /* ---------- helpers ---------- */

  function acumular(inicio, fim, limiteDia, tipo) {
    const ini = inicio < cursor ? cursor : inicio;
    const fimEf = fim > limiteDia ? limiteDia : fim;
    if (fimEf <= ini) return;

    const minutos = (fimEf - ini) / 60000;
    const km = distKm * (minutos / totalMin);

    if (tipo === "30") km30 += km;
    else km60 += km;
  }

  function zero() {
    return {
      km30: 0,
      km60: 0,
      km90: 0,
      val30: 0,
      val60: 0,
      val90: 0,
      valorTotal: 0
    };
  }
}

/* =========================
   EXPORT UNIVERSAL
========================= */
// Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = { calcularRemuneracaoKm };
}

// Browser
if (typeof window !== "undefined") {
  window.calcularRemuneracaoKm = calcularRemuneracaoKm;
}
