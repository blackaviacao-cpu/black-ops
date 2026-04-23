/* =========================================================
   DIARIAS ENGINE — MOTOR PURO (fiel ao diarias.aspx)
   Entrada: calcularDiarias({ sheetData, headerIndex, headerMap, abaNome })
   Saída: array de registros (pronto p/ render do diarias-render.js)
   ========================================================= */

export const VALOR_DIARIA = 72.70;
export const BASE_CODIGO  = "SBBH";

/* =========================
   UTILS — datas/horas
========================= */
function addMinutes(dt, mins){ return new Date(dt.getTime() + mins * 60000); }
function addDays(d, n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function overlaps(a, b, c, d){ return a < d && b > c; }
function formatDateBR(d){ return d instanceof Date ? d.toLocaleDateString("pt-BR") : ""; }

/* =========================
   SAFE GETTERS
========================= */
function getIdx(headerMap, name){
  if(!headerMap) return -1;
  const k = String(name || "").trim().toUpperCase();
  return Number.isInteger(headerMap[k]) ? headerMap[k] : -1;
}
function getCell(row, headerMap, names){
  if(!Array.isArray(row)) return null;
  for(const nm of names){
    const idx = getIdx(headerMap, nm);
    if(idx >= 0){
      const v = row[idx];
      if(v !== null && v !== undefined && v !== "") return v;
    }
  }
  return null;
}
function toStr(v){ return (v === null || v === undefined) ? "" : String(v).trim(); }
function toUpperStr(v){ return toStr(v).toUpperCase(); }

/* =========================
   PARSERS (excel / texto)
========================= */
function parseExcelDate(v){
  if(v === null || v === undefined || v === "") return null;

  if(v instanceof Date){
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }

  if(typeof v === "number" && isFinite(v)){
  const excelEpochUTC = new Date(Date.UTC(1899, 11, 30));
  const ms = excelEpochUTC.getTime() + v * 86400000;
  const d = new Date(ms);

  // ✅ usa componentes UTC (não sofre -03)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}


  if(typeof v === "string"){
    const raw = v.trim().split("T")[0].split(" ")[0];
    const p = raw.split(/[\/\-]/).map(s => s.trim());
    if(p.length === 3){
      if(p[0].length === 4){
        const y = +p[0], m = +p[1], d = +p[2];
        if(isFinite(y) && isFinite(m) && isFinite(d)) return new Date(y, m-1, d);
      }
      const d = +p[0], m = +p[1], y = +p[2];
      if(isFinite(y) && isFinite(m) && isFinite(d)) return new Date(y, m-1, d);
    }
  }
  return null;
}

function parseHora(h){
  if(h === null || h === undefined || h === "") return {h:0,m:0,s:0};

  if(h instanceof Date){
    return { h: h.getUTCHours(), m: h.getUTCMinutes(), s: h.getUTCSeconds() };
  }

  if(typeof h === "number" && isFinite(h)){
    const t = Math.round(h * 86400);
    return {
      h: Math.floor(t / 3600),
      m: Math.floor((t % 3600) / 60),
      s: t % 60
    };
  }

  if(typeof h === "string"){
    const s = h.trim();
    const m = s.match(/(\d{1,2}:\d{2}(?::\d{2})?)$/);
    const p = (m ? m[1] : s).split(":");
    const hh = +p[0], mm = +p[1], ss = +(p[2] || 0);
    return {
      h: isFinite(hh) ? hh : 0,
      m: isFinite(mm) ? mm : 0,
      s: isFinite(ss) ? ss : 0
    };
  }

  return {h:0,m:0,s:0};
}

/* =========================
   LOCAL/ZULU (Brasil)
========================= */
function isBrazil(icao){
  if(!icao) return false;
  const pfx = ["SB","SD","SI","SJ","SN","SW","SS"];
  const up = icao.toUpperCase();
  return pfx.some(p => up.startsWith(p));
}

function convertZuluToLocal(utcDate, icao){
  if(!isBrazil(icao)) return utcDate;

  const up = (icao || "").toUpperCase();
  const offset = (up === "SBFN") ? -2 : -3;

  return new Date(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate(),
    utcDate.getUTCHours() + offset,
    utcDate.getUTCMinutes(),
    utcDate.getUTCSeconds()
  );
}

/* =========================
   REGRAS / CLASSIFICAÇÃO
========================= */
function classificarMissao(origem, destino){
  if(origem === BASE_CODIGO && destino === BASE_CODIGO) return "Base SBBH — mesmo dia";
  if(origem === BASE_CODIGO && destino !== BASE_CODIGO) return "Partida SBBH";
  if(origem !== BASE_CODIGO && destino === BASE_CODIGO) return "Retorno a SBBH";
  return "Fora de base";
}

function mealWindows(d){
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0);
  return {
    Cafe:   [addMinutes(base, 300), addMinutes(base, 480)],  // 05–08
    Almoco: [addMinutes(base, 660), addMinutes(base, 780)],  // 11–13
    Ceia:   [addMinutes(base,   0), addMinutes(base,  60)]   // 00–01
  };
}

/* =========================
   TRIPULANTES (OFICIAL diarias.aspx)
========================= */
function getTripColsFromHeader(headerRow){
  const codes = [];
  const cols  = [];
  for(let col=3; col<=8; col++){
    const v = (headerRow[col] || "").toString().trim();
    if(v){
      const code = v.toUpperCase();
      codes.push(code);
      cols.push({ code, col });
    }
  }
  return { codes, cols };
}

function buildTripsMap(row, tripCodes, tripCols){
  const trips = {};
  tripCodes.forEach(c => trips[c] = 0);

  tripCols.forEach(tc => {
    const mark = (row[tc.col] || "").toString().trim().toUpperCase();
    trips[tc.code] = (mark === "X") ? 1 : 0;
  });

  return trips;
}

function firstTripOnRow(row, tripCols){
  for(const tc of tripCols){
    const mark = (row[tc.col] || "").toString().trim();
    if(mark === "X" || mark === "x") return tc.code;
  }
  return "";
}

/* =========================
   GAP — igual ao diarias.aspx
========================= */
function criarLinhaGap(dataGap, rowAntes, TRIP_CODES){
  const localStart = new Date(dataGap.getFullYear(), dataGap.getMonth(), dataGap.getDate(), 8, 0, 0);
  const localEnd   = new Date(dataGap.getFullYear(), dataGap.getMonth(), dataGap.getDate(), 20, 0, 0);

  const cafe=0, almoco=1, jantar=1, ceia=0;

  const valor =
    (cafe   ? VALOR_DIARIA * 0.25 : 0) +
    (almoco ? VALOR_DIARIA        : 0) +
    (jantar ? VALOR_DIARIA        : 0) +
    (ceia   ? VALOR_DIARIA        : 0);

  const trips = {};
  TRIP_CODES.forEach(c => {
    trips[c] = (rowAntes && rowAntes.trips && rowAntes.trips[c]) ? 1 : 0;
  });

  return {
    Aba: rowAntes.Aba || "",
    DATA: dataGap,
    MATRICULA: rowAntes.MATRICULA,
    ORIGEM: rowAntes.DESTINO,
    DESTINO: rowAntes.DESTINO,
    localStart,
    localEnd,
    tipoMissao: "GAP — Fora de base",
    Cafe: cafe,
    Almoco: almoco,
    Jantar: jantar,
    Ceia: ceia,
    QtdDiarias: cafe + almoco + jantar + ceia,
    Valor: valor,
    trips
  };
}

function inserirGaps(resultado, TRIP_CODES){
  if(!resultado || resultado.length === 0) return resultado;

  const porMat = {};
  resultado.forEach(r => {
    if(!porMat[r.MATRICULA]) porMat[r.MATRICULA] = [];
    porMat[r.MATRICULA].push(r);
  });

  const gaps = [];

  Object.keys(porMat).forEach(mat => {
    const arr = porMat[mat].slice().sort((a,b)=> a.DATA - b.DATA);

    let anterior = null;
    arr.forEach(row => {
      if(!anterior){ anterior = row; return; }

      const d1 = new Date(anterior.DATA.getFullYear(), anterior.DATA.getMonth(), anterior.DATA.getDate());
      const d2 = new Date(row.DATA.getFullYear(),     row.DATA.getMonth(),     row.DATA.getDate());
      const diff = Math.round((d2 - d1) / 86400000);

      if(diff > 1){
        const destAntes  = toUpperStr(anterior.DESTINO);
        const origDepois = toUpperStr(row.ORIGEM);

        const foraAntes  = destAntes  !== BASE_CODIGO;
        const foraDepois = origDepois !== BASE_CODIGO;

        if(foraAntes && foraDepois){
          for(let k=1; k<diff; k++){
            const dataGap = addDays(d1, k);
            gaps.push(criarLinhaGap(dataGap, anterior, TRIP_CODES));
          }
        }
      }

      anterior = row;
    });
  });

  const combinado = resultado.concat(gaps);
  combinado.sort((a,b)=>{
    if(a.DATA - b.DATA !== 0) return a.DATA - b.DATA;
    if(a.MATRICULA < b.MATRICULA) return -1;
    if(a.MATRICULA > b.MATRICULA) return 1;
    return a.localStart - b.localStart;
  });

  return combinado;
}

/* =========================================================
   ENGINE PRINCIPAL — fiel ao diarias.aspx
========================================================= */
export function calcularDiarias({
  sheetData,
  headerIndex = 0,
  headerMap,
  abaNome
}){

  if(!Array.isArray(sheetData) || sheetData.length === 0){
    throw new Error("sheetData inválido (esperava matriz).");
  }
  if(!headerMap || typeof headerMap !== "object"){
    throw new Error("headerMap inválido (Fase 2 exige headerMap).");
  }

  const headerRow = sheetData[headerIndex] || [];
  const { codes: TRIP_CODES, cols: TRIP_COLS } = getTripColsFromHeader(headerRow);

  const jornadas     = {}; // chaveDia||mat||trip => { startDia, endDia }
  const refeicoesDia = {}; // chaveDia||mat||trip => { cafe, almoco, jantar, ceia }
  const ultimoLocal  = {};
  const resultado    = [];

  // aliases de colunas (flexível)
  const COL_DATA   = ["DATA","DATE"];
  const COL_MAT    = ["MATRÍCULA","MATRICULA","AERONAVE","MATRICULA / AERONAVE","MATRÍCULA / AERONAVE"];
  const COL_ORG    = ["ORIGEM","ORIGEM ICAO","ORIGEM (ICAO)"];
  const COL_DST    = ["DESTINO","DESTINO ICAO","DESTINO (ICAO)"];
  const COL_ACIO   = ["ACIONAMENTO","ACIONAMENTO (Z)","ACIONAMENTO Z","DEP","DECOLAGEM","SAIDA","OFFBLOCK"];
  const COL_CORTE  = ["CORTE","CORTE (Z)","CORTE Z","ARR","POUSO","CHEGADA","ONBLOCK"];

  // Scan por dia+mat (pra “dia puro fora”, primeiro voo do dia etc.)
  const flightsByDayMat = {};
  const parsed = [];

  for(let i = headerIndex + 1; i < sheetData.length; i++){
    const row = sheetData[i];
    if(!Array.isArray(row) || row.length === 0) continue;

    const rawDATA = getCell(row, headerMap, COL_DATA);
    const rawMAT  = getCell(row, headerMap, COL_MAT);
    const rawORG  = getCell(row, headerMap, COL_ORG);
    const rawDST  = getCell(row, headerMap, COL_DST);
    const rawACIO = getCell(row, headerMap, COL_ACIO);
    const rawCORT = getCell(row, headerMap, COL_CORTE);

    const DATA = parseExcelDate(rawDATA);
    const MAT  = toStr(rawMAT);
    const ORG  = toUpperStr(rawORG);
    const DST  = toUpperStr(rawDST);

    if(!DATA || !MAT || !ORG || !DST || rawACIO === null || rawCORT === null) continue;

    const tA = parseHora(rawACIO);
    const tC = parseHora(rawCORT);

    let zStart = new Date(Date.UTC(DATA.getFullYear(), DATA.getMonth(), DATA.getDate(), tA.h, tA.m, tA.s));
    let zEnd   = new Date(Date.UTC(DATA.getFullYear(), DATA.getMonth(), DATA.getDate(), tC.h, tC.m, tC.s));
    if(zEnd <= zStart) zEnd = addMinutes(zEnd, 1440);

    // -30 / +30
    const zStartAdj = addMinutes(zStart, -30);
    const zEndAdj   = addMinutes(zEnd,   30);

    const localStart = convertZuluToLocal(zStartAdj, ORG);
    const localEnd   = convertZuluToLocal(zEndAdj,   DST);

    // =========================================================
    // FIX: o "DIA" da linha é a DATA DA PLANILHA (diarias.aspx),
    //      não a data derivada de localStart (que pode cair no dia anterior
    //      por causa de -30min + conversão Zulu→Local).
    // =========================================================
    const diaRef = new Date(DATA.getFullYear(), DATA.getMonth(), DATA.getDate());

    const tipo = classificarMissao(ORG, DST);

    const trips = buildTripsMap(row, TRIP_CODES, TRIP_COLS);
    const tripLinha = firstTripOnRow(row, TRIP_COLS);

    const dayMatKey = `${formatDateBR(diaRef)}||${MAT}`;

    const obj = {
      idx: i,
      row,
      Aba: abaNome || "",
      DATA: diaRef,              // ✅ âncora do dia (corrigido)
      MATRICULA: MAT,
      ORIGEM: ORG,
      DESTINO: DST,
      localStart,
      localEnd,
      tipoMissao: tipo,
      trips,
      tripLinha,
      zStartAdj,
      zEndAdj
    };

    parsed.push(obj);

    if(!flightsByDayMat[dayMatKey]) flightsByDayMat[dayMatKey] = [];
    flightsByDayMat[dayMatKey].push(obj);
  }

  Object.keys(flightsByDayMat).forEach(k => {
    flightsByDayMat[k].sort((a,b)=> a.zStartAdj - b.zStartAdj);
  });

  for(let p = 0; p < parsed.length; p++){

    const f = parsed[p];

    const diaLocal = f.DATA; // ✅ agora é a data da planilha
    const MAT      = f.MATRICULA;
    const ORG      = f.ORIGEM;
    const DST      = f.DESTINO;
    const tipo     = f.tipoMissao;

    const chaveDia = `${formatDateBR(diaLocal)}||${MAT}||${f.tripLinha}`;

    if(!jornadas[chaveDia]){
      jornadas[chaveDia] = { startDia: f.localStart, endDia: f.localEnd };
    }else{
      if(f.localStart < jornadas[chaveDia].startDia) jornadas[chaveDia].startDia = f.localStart;
      if(f.localEnd   > jornadas[chaveDia].endDia)   jornadas[chaveDia].endDia   = f.localEnd;
    }

    if(!refeicoesDia[chaveDia]){
      refeicoesDia[chaveDia] = { cafe:0, almoco:0, jantar:0, ceia:0 };
    }

    const prev = refeicoesDia[chaveDia];

    const S = new Date(diaLocal.getFullYear(), diaLocal.getMonth(), diaLocal.getDate(), 0,0,0);
    const E = addDays(S, 1);

    let sClip = jornadas[chaveDia].startDia;
    let eClip = jornadas[chaveDia].endDia;

    if(sClip < S) sClip = S;
    if(eClip > E) eClip = E;

    const wins = mealWindows(diaLocal);

    let cafe=0, almoco=0, jantar=0, ceia=0;

    const dayMatKey = `${formatDateBR(diaLocal)}||${MAT}`;
    const listaDia = flightsByDayMat[dayMatKey] || [];

    const cruzouCafe   = overlaps(sClip,eClip,wins.Cafe[0],wins.Cafe[1]);
    const cruzouAlmoco = overlaps(sClip,eClip,wins.Almoco[0],wins.Almoco[1]);
    const cruzouCeia   = overlaps(sClip,eClip,wins.Ceia[0],wins.Ceia[1]);

    const J0 = new Date(diaLocal.getFullYear(), diaLocal.getMonth(), diaLocal.getDate(), 19,0,0);
    const J1 = new Date(diaLocal.getFullYear(), diaLocal.getMonth(), diaLocal.getDate(), 20,0,0);
    const cruzouJantar = overlaps(sClip,eClip,J0,J1);

    if(tipo === "Fora de base"){

      let temPartida = false;
      let temRetorno = false;
      let temOutro   = false;

      for(const x of listaDia){
        const t2 = x.tipoMissao;
        if(t2 === "Partida SBBH") temPartida = true;
        if(t2 === "Retorno a SBBH") temRetorno = true;
        if(t2 !== "Fora de base") temOutro = true;
      }

      const diaPuroFora = !temPartida && !temRetorno && !temOutro;

      if(diaPuroFora){
        cafe   = (!prev.cafe  && cruzouCafe) ? 1 : 0;
        ceia   = (!prev.ceia  && cruzouCeia) ? 1 : 0;

        almoco = prev.almoco ? 0 : 1;
        jantar = prev.jantar ? 0 : 1;
      }else{

        let retornoPosteriorNoDia = false;
        let primeiroVooDia = true;

        if(listaDia.length){
          const first = listaDia[0];
          if(first !== f) primeiroVooDia = false;
        }

        for(const x of listaDia){
          if(x.zStartAdj > f.zStartAdj && x.tipoMissao === "Retorno a SBBH"){
            retornoPosteriorNoDia = true;
            break;
          }
        }

        const jaCafe   = prev.cafe   ? 1 : 0;
        const jaAlmoco = prev.almoco ? 1 : 0;
        const jaJantar = prev.jantar ? 1 : 0;
        const jaCeia   = prev.ceia   ? 1 : 0;

        if(primeiroVooDia){
          cafe = (!jaCafe && cruzouCafe) ? 1 : 0;

          if(retornoPosteriorNoDia){
            almoco = 0;
            jantar = 0;
          }else{
            almoco = (!jaAlmoco && cruzouAlmoco) ? 1 : 0;
            jantar = (!jaJantar && cruzouJantar) ? 1 : 0;
          }

          ceia = (!jaCeia && cruzouCeia) ? 1 : 0;
        }else{
          cafe   = (!jaCafe   && cruzouCafe)   ? 1 : 0;
          almoco = (!jaAlmoco && cruzouAlmoco) ? 1 : 0;
          jantar = (!jaJantar && cruzouJantar) ? 1 : 0;
          ceia   = (!jaCeia   && cruzouCeia)   ? 1 : 0;
        }
      }
    }

    else if(tipo === "Retorno a SBBH"){

      let origemPrimeiroVooDia = null;
      let horaPrimeiroVooDia = null;

      for(const x of listaDia){
        if(horaPrimeiroVooDia === null || x.zStartAdj < horaPrimeiroVooDia){
          horaPrimeiroVooDia = x.zStartAdj;
          origemPrimeiroVooDia = x.ORIGEM;
        }
      }

      const h11 = new Date(diaLocal.getFullYear(), diaLocal.getMonth(), diaLocal.getDate(), 11,0,0);
      const amanheceuFora =
        origemPrimeiroVooDia &&
        origemPrimeiroVooDia !== BASE_CODIGO &&
        jornadas[chaveDia].endDia >= h11;

      const jaCafe   = prev.cafe   ? 1 : 0;
      const jaAlmoco = prev.almoco ? 1 : 0;
      const jaJantar = prev.jantar ? 1 : 0;
      const jaCeia   = prev.ceia   ? 1 : 0;

      cafe = (!jaCafe && cruzouCafe) ? 1 : 0;

      if(jaAlmoco){
        almoco = 0;
      }else{
        if(cruzouAlmoco) almoco = 1;
        else if(amanheceuFora) almoco = 1;
        else almoco = 0;
      }

      if(jaJantar){
        jantar = 0;
      }else{
        const passouDas19 = eClip > J0;
        jantar = (cruzouJantar || passouDas19) ? 1 : 0;
      }

      ceia = (!jaCeia && cruzouCeia) ? 1 : 0;
    }

    else{
      if(cruzouCafe && (tipo === "Partida SBBH" || tipo === "Retorno a SBBH" || tipo === "Base SBBH — mesmo dia")){
        cafe = 1;
      }else{
        cafe = 0;
      }

      almoco = cruzouAlmoco ? 1 : 0;
      jantar = overlaps(sClip,eClip,J0,J1) ? 1 : 0;
      ceia   = cruzouCeia ? 1 : 0;

      if(tipo === "Retorno a SBBH" && jornadas[chaveDia].endDia < wins.Almoco[0]){
        almoco = 0;
      }
    }

    if(tipo === "Partida SBBH"){
      const destinoFora = DST !== BASE_CODIGO;
      if(destinoFora){

        let retornoAntesDoAlmoco = false;
        for(const x of listaDia){
          if(x.zStartAdj <= f.zStartAdj) continue;
          if(x.tipoMissao !== "Retorno a SBBH") continue;

          const h11 = new Date(diaLocal.getFullYear(), diaLocal.getMonth(), diaLocal.getDate(), 11,0,0);
          if(x.localEnd < h11){
            retornoAntesDoAlmoco = true;
            break;
          }
        }

        if(!retornoAntesDoAlmoco){
          if(jornadas[chaveDia].endDia < wins.Almoco[1] && !prev.almoco){
            almoco = 1;
          }
        }

        const h19 = new Date(diaLocal.getFullYear(), diaLocal.getMonth(), diaLocal.getDate(), 19,0,0);
        if(jornadas[chaveDia].endDia < h19 && !prev.jantar){
          jantar = 1;
        }
      }
    }

    if(tipo === "Partida SBBH" && jantar === 1){
      const h19 = new Date(diaLocal.getFullYear(), diaLocal.getMonth(), diaLocal.getDate(), 19,0,0);
      for(const x of listaDia){
        if(x.zStartAdj <= f.zStartAdj) continue;
        if(x.tipoMissao !== "Retorno a SBBH") continue;
        if(x.localEnd < h19){
          jantar = 0;
          break;
        }
      }
    }

    if(prev.cafe)   cafe = 0;
    if(prev.almoco) almoco = 0;
    if(prev.jantar) jantar = 0;
    if(prev.ceia)   ceia = 0;

    prev.cafe   ||= cafe;
    prev.almoco ||= almoco;
    prev.jantar ||= jantar;
    prev.ceia   ||= ceia;

    const valor =
      (cafe   ? VALOR_DIARIA * 0.25 : 0) +
      (almoco ? VALOR_DIARIA        : 0) +
      (jantar ? VALOR_DIARIA        : 0) +
      (ceia   ? VALOR_DIARIA        : 0);

    resultado.push({
      Aba: f.Aba,
      DATA: diaLocal,          // ✅ agora fixo pela data da planilha
      MATRICULA: MAT,
      ORIGEM: ORG,
      DESTINO: DST,
      localStart: f.localStart,
      localEnd:   f.localEnd,
      tipoMissao: tipo,
      Cafe: cafe,
      Almoco: almoco,
      Jantar: jantar,
      Ceia: ceia,
      QtdDiarias: cafe + almoco + jantar + ceia,
      Valor: valor,
      trips: f.trips
    });

    ultimoLocal[MAT] = DST;
  }

  resultado.sort((a,b)=>{
    if(a.DATA - b.DATA !== 0) return a.DATA - b.DATA;
    if(a.MATRICULA < b.MATRICULA) return -1;
    if(a.MATRICULA > b.MATRICULA) return 1;
    return a.localStart - b.localStart;
  });

  return inserirGaps(resultado, TRIP_CODES);
}
