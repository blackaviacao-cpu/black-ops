/* =========================================================
   DIARIAS-CORE — FASE 1
   Infraestrutura básica (upload + abas)
   SEM cálculo | SEM engine | SEM render
   ========================================================= */

import { calcularDiarias } from "./diarias-engine.js";
import { renderThead, renderTabela, resetRender } from "./diarias-render.js";

let diariasWorkbook   = null;
let diariasSheetName  = null;
let TRIP_CODES        = [];

// =========================
// ESTADO (snapshot impressão)
// =========================
let __RESULTADO_ATUAL = [];
let PRINT_DATA_DIARIAS = null;


/* =========================
   EXTRAÇÃO DA ABA (MATRIZ)
========================= */
function sheetToMatrix(workbook, sheetName){
  const sheet = workbook.Sheets[sheetName];
  if(!sheet) return null;

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,      // matriz pura (igual ao ASPX)
    defval: null,   // célula vazia vira null
    raw: true       // sem conversões automáticas
  });
}

/* =========================
   MAPA DE CABEÇALHOS
========================= */
function mapHeaders(headerRow){
  const map = {};
  headerRow.forEach((h, i) => {
    if(h !== null && h !== undefined){
      map[h.toString().trim().toUpperCase()] = i;
    }
  });
  return map;
}

/* =========================
   EXTRAIR TRIPULANTES (D..I)
   IGUAL AO diarias.aspx
========================= */
function extractTripulantes(headerRow){
  const trips = [];
  for(let col = 3; col <= 10; col++){
    const v = headerRow[col];
    if(v && v.toString().trim()){
      trips.push(v.toString().trim().toUpperCase());
    }
  }
  return trips;
}

// =========================
// ELEMENTOS
// =========================
const fileInput     = document.getElementById("fileInput");
const sheetPicker   = document.getElementById("sheetPicker");
const sheetInfo     = document.getElementById("sheetInfo");
const statusBox     = document.getElementById("statusBox");
const btnProcessar  = document.getElementById("btnProcessar");
const btnPrintDiarias = document.getElementById("btnPrintDiarias");
if(btnPrintDiarias) btnPrintDiarias.disabled = true;


/* =========================
   CONSTANTES
========================= */
const MESES_VALIDOS = [
  "JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO",
  "JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"
];

/* =========================
   UTILS
========================= */
function setStatus(msg, isError = false){
  statusBox.textContent = msg;
  statusBox.className =
    "text-xs mb-4 " + (isError ? "text-rose-400" : "text-slate-400");
}

function resetSelecao(){
  diariasWorkbook  = null;
  diariasSheetName = null;
  TRIP_CODES       = [];
  sheetPicker.innerHTML = "";
  sheetInfo.textContent = "";
  btnProcessar.disabled = true;
  resetRender(); // limpa tabela + resumo (igual ASPX)
}

/* =========================================================
   BUILDER — PRINT_DATA_DIARIAS (snapshot no clique)
========================================================= */
function buildPrintDataDiarias(){

  if(!__RESULTADO_ATUAL || !__RESULTADO_ATUAL.length){
    return null;
  }

  const data = {
    meta: {
      mes: diariasSheetName,
      geradoEm: new Date()
    },
    trips: {}
  };

  __RESULTADO_ATUAL.forEach(r => {

    const mat = r.MATRICULA || "—";

    TRIP_CODES.forEach(trip => {
      if(!r.trips || !r.trips[trip]) return;

      if(!data.trips[trip]){
        data.trips[trip] = {
          total: 0,
          porMatricula: {},
          registros: []
        };
      }

      const valor = r.Valor || 0;

      data.trips[trip].total += valor;
      data.trips[trip].porMatricula[mat] =
        (data.trips[trip].porMatricula[mat] || 0) + valor;

      data.trips[trip].registros.push({
  data: r.DATA,
  matricula: mat,
  origem: r.ORIGEM,
  destino: r.DESTINO,

  // ✅ ESTES DOIS CAMPOS FALTAVAM
  localStart: r.localStart || null,  // Acion.
  localEnd:   r.localEnd   || null,  // Corte

  tipoMissao: r.tipoMissao,

  // Flags de alimentação
  Cafe:   r.Cafe   ? 1 : 0,
  Almoco: r.Almoco ? 1 : 0,
  Jantar: r.Jantar ? 1 : 0,
  Ceia:   r.Ceia   ? 1 : 0,

  qtd: r.QtdDiarias,
  valor
});


    });
  });

  return data;
}


/* =========================
   UPLOAD DO ARQUIVO
========================= */
fileInput.addEventListener("change", () => {

  resetSelecao();

  const files = fileInput.files;
  if(!files || files.length === 0){
    setStatus("Selecione a planilha de controle para iniciar.");
    return;
  }

  const file = files[0];
  setStatus("Lendo estrutura do arquivo Excel…");

  const reader = new FileReader();

  reader.onload = (e) => {
    try{
      const data = new Uint8Array(e.target.result);
      diariasWorkbook = XLSX.read(data, { type: "array" });

      const sheets = diariasWorkbook.SheetNames.filter(name =>
        MESES_VALIDOS.includes(name.toUpperCase())
      );

      if(sheets.length === 0){
        setStatus("Nenhuma aba mensal válida (JANEIRO…DEZEMBRO) encontrada.", true);
        return;
      }

      renderSheetPicker(sheets);
      setStatus("Arquivo carregado. Selecione o mês (aba).");

    } catch(err){
      console.error(err);
      setStatus("Erro ao ler o arquivo Excel.", true);
    }
  };

  reader.readAsArrayBuffer(file);
});

/* =========================
   RENDERIZAR ABAS
========================= */
function renderSheetPicker(sheetNames){

  sheetPicker.innerHTML = "";

  sheetNames.forEach(name => {

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = name;

    btn.className =
      "px-2.5 py-1 rounded-full text-[0.7rem] border border-slate-600/60 " +
      "text-slate-200 hover:bg-slate-800/80 transition";

    btn.addEventListener("click", () => {

      diariasSheetName = name;
      btnProcessar.disabled = false;

      Array.from(sheetPicker.children).forEach(b => {
        b.classList.remove("bg-sky-600/80","border-sky-400");
      });

      btn.classList.add("bg-sky-600/80","border-sky-400");

      sheetInfo.textContent = `Mês selecionado: ${name}`;
      setStatus(`Aba "${name}" pronta para processamento.`);
    });

    sheetPicker.appendChild(btn);
  });
}

/* =========================
   PROCESSAR
========================= */
btnProcessar.addEventListener("click", () => {

  if(!diariasWorkbook || !diariasSheetName){
    setStatus("Selecione a planilha e o mês antes de processar.", true);
    return;
  }

  try{
    setStatus("Processando diárias (motor original)…");
    resetRender();

    // 1) Excel → matriz
    const sheetData = sheetToMatrix(
      diariasWorkbook,
      diariasSheetName
    );

    if(!sheetData || sheetData.length < 2){
      setStatus("Aba selecionada não contém dados válidos.", true);
      return;
    }

    // 2) Header
    const headerIndex = 0;
    const headerRow   = sheetData[headerIndex];
    const headerMap   = mapHeaders(headerRow);

    // 3) Tripulantes (D..I)
    TRIP_CODES = extractTripulantes(headerRow);

    // 4) ENGINE
    const resultado = calcularDiarias({
      sheetData,
      headerIndex,
      headerMap,
      abaNome: diariasSheetName
    });

    // 5) RENDER
    renderThead(TRIP_CODES);
    renderTabela(resultado, TRIP_CODES);

    // =========================
    // SNAPSHOT PARA IMPRESSÃO
    // =========================
    __RESULTADO_ATUAL = resultado;
    PRINT_DATA_DIARIAS = null;
    if (btnPrintDiarias) btnPrintDiarias.disabled = false;

    console.group("🧾 RESULTADO BRUTO — DIÁRIAS");
    console.table(resultado);
    console.groupEnd();

    setStatus(
      `Processamento concluído. ${resultado.length} registros gerados.`
    );

  } catch(err){
    console.error(err);
    setStatus("Erro ao executar o motor de diárias.", true);
  }
});

/* =========================
   IMPRIMIR — SNAPSHOT
========================= */
if (btnPrintDiarias) {
  btnPrintDiarias.addEventListener("click", () => {

    PRINT_DATA_DIARIAS = buildPrintDataDiarias();

    if (!PRINT_DATA_DIARIAS || !Object.keys(PRINT_DATA_DIARIAS.trips).length) {
      alert("Nenhuma diária marcada para impressão.");
      return;
    }

    console.group("🖨️ PRINT_DATA_DIARIAS");
    console.log(PRINT_DATA_DIARIAS);
    console.groupEnd();

    // ✅ AGORA SIM IMPRIME
    imprimirDiarias();
  });
}

function imprimirDiarias(){

  if(!PRINT_DATA_DIARIAS || !Object.keys(PRINT_DATA_DIARIAS.trips).length){
    alert("Nada para imprimir.");
    return;
  }

  const win = window.open("", "_blank");
  const { meta, trips } = PRINT_DATA_DIARIAS;

  const logoUrl = new URL("/assets/logo-black-ops2.png", window.location.href).href;
  const geradoEm = meta.geradoEm.toLocaleString("pt-BR");

  win.document.write(`
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>Relatório de Diárias</title>

    <style>
      body{
        font-family: Arial, sans-serif;
        margin: 28px;
        color:#111;
      }

      /* ===== Cabeçalho padrão KM ===== */
      .header{
        display:flex;
        justify-content:space-between;
        align-items:flex-end;
        border-bottom:3px solid #111;
        padding-bottom:8px;
        margin-bottom:22px;
      }
      .logo{ height:30px; }

      .title{
        font-size:20px;
        font-weight:bold;
        margin:0;
      }
      .meta{
        font-size:12px;
        text-align:right;
      }

      h3{
        font-size:14px;
        margin:18px 0 6px;
      }

      /* ===== Tabelas ===== */
      table{
        width:100%;
        border-collapse:collapse;
        font-size:10.5px;
        margin-bottom:14px;
      }
      th, td{
        border:1px solid #bbb;
        padding:4px 6px;
      }
      th{
        background:#f2f2f2;
        font-weight:bold;
      }
      td.num{ text-align:right; }
      td.center{ text-align:center; }

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

  Object.keys(trips).sort().forEach((trip, idx) => {

    const t = trips[trip];
    if(idx > 0) win.document.write(`<div class="page-break"></div>`);

    /* ===== Cabeçalho ===== */
    win.document.write(`
      <div class="header">
        <img src="${logoUrl}" class="logo"/>
        <div>
          <div class="title">Relatório - Remuneração de Diárias (por Tripulante) — ${trip}</div>
          <div class="meta">
            Mês de referência: ${meta.mes}<br/>
            Gerado: ${geradoEm}
          </div>
        </div>
      </div>
    `);

    /* ===== Total por matrícula ===== */
    win.document.write(`
      <h3>Total por Matrícula</h3>
      <table>
        <thead>
          <tr>
            <th>Matrícula</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
    `);

    Object.keys(t.porMatricula).forEach(mat=>{
      win.document.write(`
        <tr>
          <td>${mat}</td>
          <td class="num">${t.porMatricula[mat].toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
        </tr>
      `);
    });

    win.document.write(`
        <tr class="total">
          <td>TOTAL</td>
          <td class="num">${t.total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
        </tr>
        </tbody>
      </table>
    `);

    /* ===== Registros ===== */
    win.document.write(`
      <h3>Registros</h3>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Matrícula</th>
            <th>Origem</th>
            <th>Destino</th>
            <th>Acion.</th>
            <th>Corte</th>
            <th>Missão</th>
            <th class="center">C</th>
            <th class="center">A</th>
            <th class="center">J</th>
            <th class="center">CE</th>
            <th class="num">Valor</th>
          </tr>
        </thead>
        <tbody>
    `);

t.registros.forEach(r => {
  win.document.write(`
    <tr>
      <td>${new Date(r.data).toLocaleDateString("pt-BR")}</td>
      <td>${r.matricula}</td>
      <td>${r.origem}</td>
      <td>${r.destino}</td>

      <td class="center">
        ${r.localStart
          ? new Date(r.localStart).toLocaleTimeString("pt-BR",{ hour:"2-digit", minute:"2-digit" })
          : ""}
      </td>

      <td class="center">
        ${r.localEnd
          ? new Date(r.localEnd).toLocaleTimeString("pt-BR",{ hour:"2-digit", minute:"2-digit" })
          : ""}
      </td>

      <td>${r.tipoMissao}</td>

      <td class="center">${r.Cafe   ? "1" : ""}</td>
      <td class="center">${r.Almoco ? "1" : ""}</td>
      <td class="center">${r.Jantar ? "1" : ""}</td>
      <td class="center">${r.Ceia   ? "1" : ""}</td>

      <td class="num">
        ${(r.valor || 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL"
        })}
      </td>
    </tr>
  `);
});


    win.document.write(`
        <tr class="total">
          <td colspan="11">TOTAL TRIPULANTE</td>
          <td class="num">${t.total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
        </tr>
        </tbody>
      </table>
    `);
  });

  win.document.write(`</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
