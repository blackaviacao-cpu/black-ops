// KM-CORE — SPA SAFE
// - initKmCore() só roda quando o partial está no DOM
// - evita duplicar event listeners se clicar KM duas vezes

window.initKmCore = function initKmCore(){
  const root = document.getElementById("blaq-km");
  if(!root) return;

  // evita dupla inicialização
  if(root.dataset.inited === "1") return;
  root.dataset.inited = "1";

    // ==========================
  // DADOS PARA IMPRESSÃO
  // ==========================
  let PRINT_DATA = {};

  /* ==========================
     CONFIGURAÇÕES
  ========================== */
  const TAR30 = 0.30; // 06–18
  const TAR60 = 0.60; // 18–06
  const TAR90 = 0.90; // domingo/feriado

  const COL_DATA       = 0;   // A
  const COL_MATRICULA  = 2;   // C
  const COL_ORIGEM     = 10;  // K
  const COL_DESTINO    = 11;  // L
  const COL_DIST_KM    = 12;  // M
  const COL_DECOL_ZULU = 14;  // O
  const COL_POUSO_ZULU = 15;  // P

  const FERIADOS_JSON_URL = "/assets/feriados.json";

  /* ==========================
     ELEMENTOS
  ========================== */
  const fileVoos      = document.getElementById("fileVoos");
  const feriadosInfo  = document.getElementById("feriadosInfo");
  const btnProcessar  = document.getElementById("btnProcessar");
  const statusBox     = document.getElementById("statusBox");
  const sheetPicker   = document.getElementById("sheetPicker");
  const sheetInfo     = document.getElementById("sheetInfo");
const btnPrint      = document.getElementById("btnPrint");
if(btnPrint) btnPrint.disabled = true;

  const tbodyVoos     = document.getElementById("tbodyVoos");
  const totaisTrip    = document.getElementById("totaisTrip");
  const totaisMat     = document.getElementById("totaisMat");

  let workbookVoos   = null;
  let selectedSheet  = null;
  let FERIADOS_SET   = new Set();

  /* ==========================
     UTILS
  ========================== */
  function setStatus(text, isError=false){
    statusBox.textContent = text;
    statusBox.className = "text-xs mb-3 " + (isError ? "text-rose-400" : "text-slate-400");
  }

  function formatDateBR(d){ return d.toLocaleDateString("pt-BR"); }
  function fmtMoney(v){ return (v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
  function fmtNum(v, dec){ return (v||0).toLocaleString("pt-BR",{minimumFractionDigits:dec, maximumFractionDigits:dec}); }

  function addDays(d,n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()+n); }
  function dateOnly(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addMinutes(dt, mins){ return new Date(dt.getTime() + mins*60000); }

  function isBrazil(icao){
    if(!icao) return false;
    const pfx = ["SB","SD","SI","SJ","SN","SW","SS"];
    const up = String(icao).trim().toUpperCase();
    return pfx.some(p => up.startsWith(p));
  }

  function convertZuluToLocal(utcDate, icao){
    if(!utcDate) return null;
    if(!isBrazil(icao)) return utcDate;
    let offset = -3;
    if(String(icao).trim().toUpperCase()==="SBFN") offset = -2;

    const y  = utcDate.getUTCFullYear();
    const m  = utcDate.getUTCMonth();
    const d  = utcDate.getUTCDate();
    const hh = utcDate.getUTCHours() + offset;
    const mm = utcDate.getUTCMinutes();
    const ss = utcDate.getUTCSeconds();

    return new Date(y, m, d, hh, mm, ss);
  }

  function parseExcelDate(v){
    if(!v) return null;
    if(v instanceof Date){
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }
    if(typeof v === "number"){
      const excelEpoch = new Date(Date.UTC(1899,11,30));
      const d  = new Date(excelEpoch.getTime() + v*86400000);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    if(typeof v === "string"){
      const raw = v.split("T")[0].split(" ")[0];
      const parts = raw.split(/[\/\-]/);
      if(parts.length===3){
        let y,m,d;
        if(parts[0].length===4){ y=+parts[0]; m=+parts[1]; d=+parts[2]; }
        else { d=+parts[0]; m=+parts[1]; y=+parts[2]; }
        return new Date(y, m-1, d);
      }
      const tentative = new Date(v);
      if(!isNaN(tentative)) return new Date(tentative.getFullYear(), tentative.getMonth(), tentative.getDate());
    }
    return null;
  }

  function parseHora(h){
    if(!h) return {h:0,m:0,s:0};
    if(h instanceof Date){
      return {h:h.getUTCHours(), m:h.getUTCMinutes(), s:h.getUTCSeconds()};
    }
    if(typeof h==="number"){
      const total = Math.round(h * 86400);
      return { h:Math.floor(total/3600), m:Math.floor((total%3600)/60), s:total%60 };
    }
    if(typeof h==="string"){
      const m = h.trim().match(/(\d{1,2}:\d{2}(?::\d{2})?)$/);
      const str = m ? m[1] : h;
      const p = str.split(":");
      return { h:parseInt(p[0]||"0",10), m:parseInt(p[1]||"0",10), s:parseInt(p[2]||"0",10) };
    }
    return {h:0,m:0,s:0};
  }

  /* ==========================
     FERIADOS
  ========================== */
  function keyDate(d){
    return d.getFullYear() + "-" +
           String(d.getMonth()+1).padStart(2,"0") + "-" +
           String(d.getDate()).padStart(2,"0");
  }
  function isHoliday(d){
    return FERIADOS_SET.has(keyDate(d));
  }

  async function carregarFeriadosAutomatico(){
    feriadosInfo.textContent = "Carregando feriados…";

    try{
      const r = await fetch(
        FERIADOS_JSON_URL + "?v=" + Date.now(),
        { cache:"no-store", credentials:"omit" }
      );

      if(!r.ok) throw new Error("HTTP " + r.status);

      const txt = (await r.text()).replace(/^\uFEFF/, "");
      let lista = JSON.parse(txt);

      if(!Array.isArray(lista)) throw new Error("Formato inválido de feriados");

      FERIADOS_SET = new Set(lista);
      feriadosInfo.textContent = `Feriados carregados: ${FERIADOS_SET.size} data(s).`;

    }catch(err){
      console.error("✖ Erro ao carregar feriados:", err);
      feriadosInfo.textContent = "Falha ao carregar feriados (cálculo seguirá sem feriados).";
      FERIADOS_SET = new Set();
    }
  }

  /* ==========================
     MOTOR DE TARIFA
  ========================== */
  function calcularRemuneracaoKm(startLocal, endLocal, distKm){
    const totalMin = (endLocal - startLocal)/60000;
    if(totalMin <= 0 || !isFinite(totalMin) || distKm <= 0){
      return { km30:0, km60:0, km90:0, val30:0, val60:0, val90:0, valorTotal:0 };
    }

    let km30 = 0, km60 = 0, km90 = 0;
    let cursor = new Date(startLocal);

    while(cursor < endLocal){
      const dia = dateOnly(cursor);
      const isDomingo = (dia.getDay() === 0);
      const feriado   = isHoliday(dia);

      const meiaNoite = addDays(dia,1);
      const limiteDia = meiaNoite < endLocal ? meiaNoite : endLocal;

      if(isDomingo || feriado){
        const minutos = (limiteDia - cursor)/60000;
        const frac = minutos / totalMin;
        km90 += distKm * frac;
        cursor = limiteDia;
        continue;
      }

      const t06 = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 6,0,0);
      const t18 = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 18,0,0);

      const acumular = (ini, fim, tipoTarifa) => {
        const inicio = ini < cursor ? cursor : ini;
        const fimEf  = fim > limiteDia ? limiteDia : fim;
        if(fimEf <= inicio) return;
        const minutos = (fimEf - inicio)/60000;
        const frac = minutos / totalMin;
        const km = distKm * frac;
        if(tipoTarifa === "30") km30 += km;
        else if(tipoTarifa === "60") km60 += km;
        else km90 += km;
      };

      acumular(dia, t06, "60");
      acumular(t06, t18, "30");
      acumular(t18, limiteDia, "60");

      cursor = limiteDia;
    }

    const val30 = km30 * TAR30;
    const val60 = km60 * TAR60;
    const val90 = km90 * TAR90;
    const valorTotal = val30 + val60 + val90;

    return { km30, km60, km90, val30, val60, val90, valorTotal };
  }

  /* ==========================
     LEITURA DO EXCEL + ABAS
  ========================== */
  fileVoos.addEventListener("change", () => {
    workbookVoos = null;
    selectedSheet = null;

    sheetPicker.innerHTML = "";
    sheetInfo.textContent = "";
    btnProcessar.disabled = true;

    tbodyVoos.innerHTML = `
      <tr>
        <td colspan="11" class="px-3 py-6 text-center text-xs text-slate-400">
          Selecione o mês (aba) para processar.
        </td>
      </tr>`;
    totaisTrip.innerHTML = "";
    totaisMat.innerHTML = "";

    const files = fileVoos.files;
    if(!files || files.length===0){
      setStatus("Selecione a planilha de voos para continuar.");
      return;
    }

    const file = files[0];
    setStatus("Lendo estrutura do arquivo Excel…");

    const reader = new FileReader();
    reader.onload = (e) => {
      try{
        const data = new Uint8Array(e.target.result);
        workbookVoos = XLSX.read(data, {type:"array"});

        const mesesAlvo = [
          "JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO",
          "JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"
        ];

        const sheets = workbookVoos.SheetNames.filter(n =>
          mesesAlvo.includes(String(n).toUpperCase())
        );

        if(sheets.length === 0){
          setStatus("Nenhuma aba mensal (JANEIRO…DEZEMBRO) encontrada no arquivo.", true);
          return;
        }

        sheetPicker.innerHTML = "";
        sheets.forEach(name => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className =
            "px-2.5 py-1 rounded-full text-[0.7rem] border border-slate-600/60 " +
            "text-slate-200 hover:bg-slate-800/80";
          btn.textContent = name;

          btn.addEventListener("click", () => {
            selectedSheet = name;
            sheetInfo.textContent = "Mês selecionado: " + name;
            Array.from(sheetPicker.children).forEach(c=>{
              c.classList.remove("bg-sky-600/80","border-sky-400");
            });
            btn.classList.add("bg-sky-600/80","border-sky-400");
            btnProcessar.disabled = false;
            setStatus(`Aba "${name}" pronta. Clique em Processar remuneração.`);
          });

          sheetPicker.appendChild(btn);
        });

        setStatus("Arquivo lido. Escolha o mês (aba) para processar.");
      }catch(err){
        console.error(err);
        setStatus("Erro ao ler o arquivo Excel.", true);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  /* ==========================
     PROCESSAR
  ========================== */
  btnProcessar.addEventListener("click", () => {
    if(!workbookVoos || !selectedSheet){
      alert("Selecione a planilha de voos e o mês (aba) antes de processar.");
      return;
    }

    tbodyVoos.innerHTML = `
      <tr>
        <td colspan="11" class="px-3 py-6 text-center text-xs text-slate-400">
          Processando aba "${selectedSheet}"…
        </td>
      </tr>`;
    btnProcessar.disabled = true;

    totaisTrip.innerHTML = "";
    totaisMat.innerHTML = "";
    setStatus(`Processando aba "${selectedSheet}"…`);

    // ==========================
// RESET impressão
// ==========================
PRINT_DATA = {
  meta: {
    sheet: selectedSheet,
    geradoEm: new Date()
  },
  trips: {} // por tripulante
};

    try{
      const ws  = workbookVoos.Sheets[selectedSheet];
      const aoa = XLSX.utils.sheet_to_json(ws, {header:1, defval:""});

      if(!aoa || aoa.length < 2){
        setStatus("Aba sem dados suficientes.", true);
        btnProcessar.disabled = false;
        return;
      }

      const header = aoa[0] || [];

      // Tripulantes: entre D..I (3..8)
      const TRIP_CODES = [];
      const TRIP_COLS  = [];
      for(let col=3; col<=8; col++){
        const v = (header[col] || "").toString().trim();
        if(v){
          TRIP_CODES.push(v);
          TRIP_COLS.push({code:v, col});
        }
      }

      const porTrip = {};
      const porMatTrip = {};
      TRIP_CODES.forEach(t => porTrip[t] = 0);

      tbodyVoos.innerHTML = "";
      const frag = document.createDocumentFragment();

      for(let i=1; i<aoa.length; i++){
        const r = aoa[i];
        if(!r) continue;

        if(!r[COL_DATA] || !r[COL_DECOL_ZULU] || !r[COL_POUSO_ZULU]) continue;

        const valData = r[COL_DATA];
        const o = (r[COL_ORIGEM]  || "").toString().trim().toUpperCase();
        const d = (r[COL_DESTINO] || "").toString().trim().toUpperCase();
        const mat = (r[COL_MATRICULA] || "").toString().trim() || "(sem matrícula)";

        let km = r[COL_DIST_KM];
        km = parseFloat(String(km).replace(",", "."));
        if(!isFinite(km) || km <= 0) continue;

        const dataBase = parseExcelDate(valData);
        if(!dataBase) continue;

        const tDec = parseHora(r[COL_DECOL_ZULU]);
        const tPou = parseHora(r[COL_POUSO_ZULU]);

        let zStart = new Date(Date.UTC(
          dataBase.getFullYear(), dataBase.getMonth(), dataBase.getDate(),
          tDec.h, tDec.m, tDec.s
        ));
        let zEnd = new Date(Date.UTC(
          dataBase.getFullYear(), dataBase.getMonth(), dataBase.getDate(),
          tPou.h, tPou.m, tPou.s
        ));
        if(zEnd <= zStart) zEnd = addMinutes(zEnd, 1440);

        const start = convertZuluToLocal(zStart, o);
        const end   = convertZuluToLocal(zEnd,   d);

        // validação de tripulação (exatamente 2)
        const tripMarcados = TRIP_COLS.filter(tc => String(r[tc.col]||"").trim().toUpperCase() === "X");
        if(tripMarcados.length !== 2){
          const tr = document.createElement("tr");
          tr.className = "bg-rose-900/40 text-rose-200";
          tr.innerHTML = `
            <td class="px-3 py-1.5">${formatDateBR(parseExcelDate(r[COL_DATA]) || new Date())}</td>
            <td class="px-3 py-1.5">${o}</td>
            <td class="px-3 py-1.5">${d}</td>
            <td colspan="8" class="px-3 py-1.5 text-left font-semibold">
              ❌ ERRO DE TRIPULAÇÃO — ${tripMarcados.length} tripulante(s) marcado(s)
            </td>
          `;
          frag.appendChild(tr);
          continue;
        }

        const res = calcularRemuneracaoKm(start, end, km);
// ==========================
// Guarda dados p/ impressão (por tripulante)
// ==========================
tripMarcados.forEach(tc => {
  const nome = tc.code;

  if(!PRINT_DATA.trips[nome]){
    PRINT_DATA.trips[nome] = {
      total: 0,
      porMatricula: {},
      voos: []
    };
  }

  PRINT_DATA.trips[nome].voos.push({
    data: formatDateBR(dateOnly(start)),
    origem: o,
    destino: d,
    matricula: mat,
    km: km,
    km30: res.km30,
    km60: res.km60,
    km90: res.km90,
    val30: res.val30,
    val60: res.val60,
    val90: res.val90,
    total: res.valorTotal
  });

  PRINT_DATA.trips[nome].total += res.valorTotal;
  PRINT_DATA.trips[nome].porMatricula[mat] =
    (PRINT_DATA.trips[nome].porMatricula[mat] || 0) + res.valorTotal;
});

        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-900/70";
        tr.innerHTML = `
          <td class="px-3 py-1.5">${formatDateBR(dateOnly(start))}</td>
          <td class="px-3 py-1.5">${o}</td>
          <td class="px-3 py-1.5">${d}</td>
          <td class="px-3 py-1.5 text-right">${fmtNum(km,1)}</td>
          <td class="px-3 py-1.5 text-right">${fmtNum(res.km30,1)}</td>
          <td class="px-3 py-1.5 text-right">${fmtNum(res.km60,1)}</td>
          <td class="px-3 py-1.5 text-right">${fmtNum(res.km90,1)}</td>
          <td class="px-3 py-1.5 text-right text-emerald-300">${fmtMoney(res.val30)}</td>
          <td class="px-3 py-1.5 text-right text-sky-300">${fmtMoney(res.val60)}</td>
          <td class="px-3 py-1.5 text-right text-amber-300">${fmtMoney(res.val90)}</td>
          <td class="px-3 py-1.5 text-right text-slate-50 font-semibold">${fmtMoney(res.valorTotal)}</td>
        `;
        frag.appendChild(tr);

        TRIP_COLS.forEach(tc => {
          const mark = (r[tc.col] || "").toString().trim().toUpperCase();
          if(mark !== "X") return;

          porTrip[tc.code] = (porTrip[tc.code] || 0) + res.valorTotal;
          porMatTrip[tc.code] ??= {};
          porMatTrip[tc.code][mat] = (porMatTrip[tc.code][mat] || 0) + res.valorTotal;
        });
      }

      tbodyVoos.appendChild(frag);

      // render totais
      totaisTrip.innerHTML = "";
      totaisMat.innerHTML = "";

      const tripList = Object.keys(porTrip).filter(t => porTrip[t] > 0);

      if(tripList.length === 0){
        totaisTrip.innerHTML = `<span class="text-slate-400 text-xs">Nenhum tripulante marcado (X) nas colunas D..I.</span>`;
        totaisMat.innerHTML  = `<span class="text-slate-400 text-xs">—</span>`;
      } else {
        tripList.forEach(t => {
          const chip = document.createElement("div");
          chip.className = "px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-[0.78rem]";
          chip.innerHTML = `<span class="font-semibold text-slate-100">${t}</span> — <span class="text-emerald-300">${fmtMoney(porTrip[t])}</span>`;
          totaisTrip.appendChild(chip);

          let block = `<div class="rounded-xl bg-slate-900/60 border border-slate-700/60 p-2">
            <div class="font-semibold text-slate-100 mb-1">${t}</div>`;
          const mats = porMatTrip[t] || {};
          Object.keys(mats).sort().forEach(m => {
            block += `<div class="ml-2 text-[0.75rem] text-slate-200">${m}: <span class="text-emerald-300 font-semibold">${fmtMoney(mats[m])}</span></div>`;
          });
          block += `</div>`;
          totaisMat.innerHTML += block;
        });
      }

      setStatus(`Processamento concluído (${selectedSheet}).`);
      // habilita impressão se houver dados
if(btnPrint && PRINT_DATA && PRINT_DATA.trips && Object.keys(PRINT_DATA.trips).length > 0){
  btnPrint.disabled = false;
}
    }catch(err){
      console.error(err);
      setStatus("Erro ao processar a aba selecionada.", true);
      tbodyVoos.innerHTML = `
        <tr>
          <td colspan="11" class="px-3 py-6 text-center text-xs text-rose-400">
            Erro ao processar a aba. Verifique o arquivo e tente novamente.
          </td>
        </tr>`;
    }finally{
      btnProcessar.disabled = false;
    }
  });
/* ==========================
   IMPRESSÃO — por tripulante
========================== */
if(btnPrint){
  btnPrint.addEventListener("click", () => {
    const trips = PRINT_DATA?.trips ? Object.keys(PRINT_DATA.trips) : [];
    if(!trips.length){
      alert("Nada para imprimir. Processe uma aba primeiro.");
      return;
    }

    const win = window.open("", "_blank");
    const title = "Relatório — Remuneração por KM (por Tripulante)";
    const metaSheet = PRINT_DATA?.meta?.sheet || "";
    const geradoEm = PRINT_DATA?.meta?.geradoEm
      ? new Date(PRINT_DATA.meta.geradoEm).toLocaleString("pt-BR")
      : "";

    const logoUrl = new URL("/assets/logo-black-ops2.png", window.location.href).href;

    win.document.write(`
      <html>
      <head>
        <meta charset="utf-8"/>
        <base href="${window.location.href}">
        <title>${title}</title>

        <style>
          body{
            font-family: Arial, sans-serif;
            margin:28px;
            color:#111;
          }

          /* ===== CABEÇALHO PADRÃO (IGUAL DIÁRIAS) ===== */
          .header{
            display:flex;
            justify-content:space-between;
            align-items:flex-end;
            border-bottom:3px solid #111;
            padding-bottom:8px;
            margin-bottom:22px;
          }

          .logo{
            height:30px;
          }

          .title{
            font-size:20px;
            font-weight:bold;
            margin:0;
          }

          .meta{
            font-size:12px;
            text-align:right;
          }

          h2{ font-size:15px; margin:26px 0 8px; }
          h3{ font-size:13px; margin:14px 0 6px; }

          table{
            width:100%;
            border-collapse:collapse;
            margin-top:8px;
            font-size:11px;
          }

          th,td{
            border:1px solid #bbb;
            padding:6px;
          }

          th{
            background:#f2f2f2;
            text-align:left;
          }

          td.num{
            text-align:right;
            white-space:nowrap;
          }

          .total{
            font-weight:bold;
            background:#fafafa;
          }

          .page-break{
            page-break-before:always;
          }
        </style>
      </head>
      <body>
    `);

    trips.sort().forEach((trip, idx) => {
      const data = PRINT_DATA.trips[trip];
      if(idx > 0) win.document.write(`<div class="page-break"></div>`);

      /* ===== CABEÇALHO ===== */
      win.document.write(`
        <div class="header">
          <img src="${logoUrl}" class="logo" alt="BLACK OPS"/>

          <div>
            <div class="title">${title} — ${trip}</div>
            <div class="meta">
              Mês de referência: ${metaSheet}<br/>
              Gerado: ${geradoEm}
            </div>
          </div>
        </div>
      `);

      /* ===== TOTAL POR MATRÍCULA ===== */
      win.document.write(`<h3>Total por Matrícula</h3>`);
      win.document.write(`<table><thead><tr><th>Matrícula</th><th class="num">Total</th></tr></thead><tbody>`);

      Object.keys(data.porMatricula).sort().forEach(m => {
        win.document.write(`
          <tr>
            <td>${m}</td>
            <td class="num">
              ${(data.porMatricula[m]||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
            </td>
          </tr>
        `);
      });

      win.document.write(`
        <tr class="total">
          <td>TOTAL</td>
          <td class="num">
            ${(data.total||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
          </td>
        </tr>
        </tbody>
      </table>
      `);

      /* ===== VOOS ===== */
      win.document.write(`<h3>Voos</h3>`);
      win.document.write(`
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Origem</th>
              <th>Destino</th>
              <th>Matrícula</th>
              <th class="num">KM</th>
              <th class="num">R$ 0,30</th>
              <th class="num">R$ 0,60</th>
              <th class="num">R$ 0,90</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
      `);

      data.voos.forEach(v => {
        win.document.write(`
          <tr>
            <td>${v.data}</td>
            <td>${v.origem}</td>
            <td>${v.destino}</td>
            <td>${v.matricula}</td>
            <td class="num">${(v.km||0).toLocaleString("pt-BR",{minimumFractionDigits:1, maximumFractionDigits:1})}</td>
            <td class="num">${(v.val30||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
            <td class="num">${(v.val60||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
            <td class="num">${(v.val90||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
            <td class="num">${(v.total||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
          </tr>
        `);
      });

      win.document.write(`
        <tr class="total">
          <td colspan="8">TOTAL TRIPULANTE</td>
          <td class="num">
            ${(data.total||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
          </td>
        </tr>
        </tbody>
        </table>
      `);
    });

    win.document.write(`</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  });
}

  /* INIT */
  carregarFeriadosAutomatico();
};
