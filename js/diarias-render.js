/* =========================================================
   DIARIAS RENDER — TABELA DE RESULTADOS
   Responsável APENAS por renderizar o output do engine
   (fiel ao diarias.aspx)
   ========================================================= */

/* =========================
   FORMATADORES
========================= */
function formatDateBR(d){
  return d instanceof Date ? d.toLocaleDateString("pt-BR") : "";
}

function formatTimeHM(d){
  return d instanceof Date
    ? d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })
    : "";
}

function formatCurrencyBR(v){
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

/* =========================
   ESTADO GLOBAL
========================= */
let __ultimoResultado = [];
let __tripCodesAtivos = [];
let __filtroMatricula = "TODAS";

function criarTripsVazio(tripCodes){
  const o = {};
  (tripCodes || []).forEach(c => o[c] = 0);
  return o;
}


/* =========================
   RESET VISUAL
========================= */
export function resetRender(){

  __ultimoResultado = [];
  __tripCodesAtivos = [];

  const tbody = document.getElementById("tbodyResultado");
  if(tbody){
    tbody.innerHTML = `
      <tr>
        <td colspan="30" class="px-4 py-6 text-center text-xs text-slate-400">
          Aguardando arquivo e seleção de mês…
        </td>
      </tr>`;
  }

  const resumo = document.getElementById("resumoTotais");
  if(resumo){
    resumo.innerHTML = "";
    resumo.classList.add("hidden");
  }
}

/* =========================
   CLASSES VISUAIS — MISSÃO
========================= */
function tipoToClass(tipo){
  if(tipo === "Base SBBH — mesmo dia") return "base";
  if(tipo === "Partida SBBH")          return "partida";
  if(tipo === "Retorno a SBBH")        return "retorno";
  if(tipo === "Fora de base")          return "forabase";
  if(tipo === "GAP — Fora de base")    return "gap";
  return "";
}

function popularFiltroMatriculas(lista){
  const sel = document.getElementById("filtroMatricula");
  if(!sel) return;

  const atual = __filtroMatricula;


  // limpa e recria
  sel.innerHTML = `<option value="TODAS">Todas</option>`;

  const set = new Set();

  lista.forEach(r=>{
    if(r.MATRICULA) set.add(r.MATRICULA);
  });

  [...set].sort().forEach(m=>{
  const op = document.createElement("option");
  op.value = m;
  op.textContent = m;
  op.selected = (m === atual);
  sel.appendChild(op);
});

}


/* =========================================================
   <thead> — igual diarias.aspx
========================================================= */
/* SUBSTITUA O BLOCO renderThead POR ESTE: */
export function renderThead(tripCodes){
  const thead = document.getElementById("theadDiarias");
  if(!thead) throw new Error("theadDiarias não encontrado");

  let html = `
    <tr class="text-slate-300 text-xs">
      <th class="w-8"></th> <th>Data</th>
      <th>Matrícula</th>
      <th>Origem</th>
      <th>Destino</th>
      <th>Acion.</th>
      <th>Corte</th>
      <th>Missão</th>
      <th class="text-center">C</th>
      <th class="text-center">A</th>
      <th class="text-center">J</th>
      <th class="text-center">Ce</th>
      <th class="text-center">Qtd</th>
      <th class="text-right">Valor</th>
  `;

  tripCodes.forEach(c=>{
    html += `<th class="text-center">${c}</th>`;
  });

  html += `</tr>`;
  thead.innerHTML = html;
}

/* =========================================================
   <tbody>
========================================================= */
export function renderTabela(resultado, tripCodes){

  const tbody = document.getElementById("tbodyResultado");
  if(!tbody) throw new Error("tbodyResultado não encontrado");

  __ultimoResultado = resultado || [];
  __ultimoResultado.forEach((r, i)=>{
  if(!r.__id) r.__id = crypto.randomUUID();
  });

  __tripCodesAtivos = tripCodes || [];
  __ultimoResultado.forEach(r=>{
  if(!r.trips) r.trips = criarTripsVazio(__tripCodesAtivos);
});


  popularFiltroMatriculas(__ultimoResultado);


  tbody.innerHTML = "";

  if(!__ultimoResultado.length){
    tbody.innerHTML = `
      <tr>
        <td colspan="30" class="px-4 py-6 text-center text-xs text-slate-400">
          Nenhum resultado
        </td>
      </tr>`;
    return;
  }

  const frag = document.createDocumentFragment();

  __ultimoResultado
  .filter(r =>
    __filtroMatricula === "TODAS" ||
    r.MATRICULA === __filtroMatricula
  )
  .forEach((r, idx)=>{


    let colsTrips = "";
    __tripCodesAtivos.forEach(code=>{
      const checked = r.trips && r.trips[code] ? "checked" : "";
      colsTrips += `
        <td class="text-center">
          <input type="checkbox"
                 class="chk-trip accent-sky-500"
                 data-id="${r.__id}"
                 data-trip="${code}"
                 ${checked}>
        </td>`;
    });

    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-800 hover:bg-slate-900/60";

const isManual = r.tipoMissao === "Manual";

tr.innerHTML = `
      <td class="text-center">
        ${isManual ? 
          `<button onclick="window.removerLinhaManual('${r.__id}')" title="Excluir" class="text-slate-500 hover:text-red-400 transition-colors">
            🗑️
          </button>` 
          : ''}
      </td>

      <td class="whitespace-nowrap">
        ${isManual ? `<input type="date" class="bg-slate-800 border border-slate-700 text-[10px] rounded p-1 text-white" onchange="window.updateManualField('${r.__id}', 'DATA', new Date(this.value))">` : formatDateBR(r.DATA)}
      </td>
      <td class="font-medium">
        ${isManual ? `<input type="text" class="w-16 bg-slate-800 border border-slate-700 rounded p-1 uppercase text-white" placeholder="Matr." onblur="window.updateManualField('${r.__id}', 'MATRICULA', this.value.toUpperCase())">` : r.MATRICULA}
      </td>
      <td>
        ${isManual ? `<input type="text" class="w-12 bg-slate-800 border border-slate-700 rounded p-1 uppercase text-white" placeholder="Orig" onblur="window.updateManualField('${r.__id}', 'ORIGEM', this.value.toUpperCase())">` : r.ORIGEM}
      </td>
      <td>
        ${isManual ? `<input type="text" class="w-12 bg-slate-800 border border-slate-700 rounded p-1 uppercase text-white" placeholder="Dest" onblur="window.updateManualField('${r.__id}', 'DESTINO', this.value.toUpperCase())">` : r.DESTINO}
      </td>
      <td>${formatTimeHM(r.localStart)}</td>
      <td>${formatTimeHM(r.localEnd)}</td>

      <td>
        <span class="badge-missao ${tipoToClass(r.tipoMissao)}">
          <span class="dot"></span>
          ${r.tipoMissao}
        </span>
      </td>

      <td class="text-center">${r.Cafe   ? 1 : 0}</td>
      <td class="text-center">${r.Almoco ? 1 : 0}</td>
      <td class="text-center">${r.Jantar ? 1 : 0}</td>
      <td class="text-center">${r.Ceia   ? 1 : 0}</td>
      
      <td class="text-center font-medium">
        ${isManual ? `<input type="number" class="w-10 bg-slate-800 border border-slate-700 rounded p-1 text-center text-white" value="${r.QtdDiarias}" oninput="window.updateManualField('${r.__id}', 'QtdDiarias', this.value)">` : r.QtdDiarias}
      </td>

      <td class="text-right text-sky-300 font-medium">
        ${isManual ? 
          `<input type="number" class="w-20 bg-slate-800 border border-sky-900 text-right text-sky-300 rounded p-1" placeholder="0,00" oninput="window.updateManualField('${r.__id}', 'Valor', this.value)">` 
          : formatCurrencyBR(r.Valor)}
      </td>
      
      ${colsTrips}
    `;
   
/* Listener dos checkboxes (igual ASPX) */
tr.querySelectorAll(".chk-trip").forEach((chk) => {
  chk.addEventListener("change", (e) => {

    const id   = e.target.dataset.id;
    const trip = e.target.dataset.trip;
    const on   = e.target.checked ? 1 : 0;

    const rowObj = __ultimoResultado.find(r => r.__id === id);

    if(rowObj?.trips){
      rowObj.trips[trip] = on;
      renderResumo();

      
      document.dispatchEvent(new CustomEvent("diarias:tripToggle", {
        detail: { id, trip, on }
      }));
    }

  });
});




    frag.appendChild(tr);
  });

  tbody.appendChild(frag);
  renderResumo();

  }

/* =========================================================
   RESUMO — TOTAIS POR TRIPULANTE
========================================================= */
export function renderResumo(){

  const box = document.getElementById("resumoTotais");
  if(!box) return;

    const totais = {};
  const totaisPorMatricula = {};

  __tripCodesAtivos.forEach(c => {
    totais[c] = 0;
    totaisPorMatricula[c] = {};
  });

  __ultimoResultado.forEach(r=>{
    const mat = r.MATRICULA || "—";

    __tripCodesAtivos.forEach(c=>{
      if(r.trips && r.trips[c]){
        const v = r.Valor || 0;

        totais[c] += v;

        if(!totaisPorMatricula[c][mat]){
          totaisPorMatricula[c][mat] = 0;
        }
        totaisPorMatricula[c][mat] += v;
      }
    });
  });


  const totalGeral = Object.values(totais).reduce((a,b)=>a+b,0);

  let html = `
    <div class="flex justify-between items-center mb-3">
      <span class="text-sm text-slate-300">
        Totais por tripulante (missões marcadas)
      </span>
      <strong class="text-sky-300">
        Total geral: ${formatCurrencyBR(totalGeral)}
      </strong>
    </div>

    <div class="flex flex-wrap gap-2">
  `;

  __tripCodesAtivos.forEach(c=>{
  html += `
    <div class="rounded-xl bg-slate-900/60 border border-slate-700/60 p-3 min-w-[180px]">
      <div class="flex justify-between items-center mb-1">
        <strong class="text-slate-100">${c}</strong>
        <span class="text-emerald-300 font-semibold">
          ${formatCurrencyBR(totais[c])}
        </span>
      </div>
  `;

  const mats = totaisPorMatricula[c] || {};
  Object.keys(mats).forEach(m => {
    html += `
      <div class="ml-1 text-[0.75rem] text-slate-300 flex justify-between">
        <span>${m}</span>
        <span class="text-emerald-300 font-medium">
          ${formatCurrencyBR(mats[m])}
        </span>
      </div>
    `;
  });


  html += `</div>`;
});


  html += `</div>`;

  box.innerHTML = html;
  box.classList.remove("hidden");
}

document.addEventListener("change", e=>{
  if(e.target.id === "filtroMatricula"){
    __filtroMatricula = e.target.value;
    renderTabela(__ultimoResultado, __tripCodesAtivos);
  }
});

// ===============================
// BOTÃO LINHA MANUAL (GLOBAL)
// ===============================
/* Substitua o bloco DOMContentLoaded antigo por este */
function inicializarBotaoManual() {
  const btnManual = document.getElementById("btnAddLinhaManual");
  if (!btnManual) {
    // Se não achou agora, tenta de novo em 500ms (útil se o HTML demorar a carregar)
    setTimeout(inicializarBotaoManual, 500);
    return;
  }

  // Remove listeners antigos para não duplicar se a função rodar duas vezes
  btnManual.replaceWith(btnManual.cloneNode(true));
  
  // Pega a nova referência após o clone
  const novoBtn = document.getElementById("btnAddLinhaManual");
  
  novoBtn.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Botão manual clicado!"); // Debug para você ver no F12

 const novo = {
  __id: crypto.randomUUID(),
  DATA: new Date(),
  MATRICULA: "",
  ORIGEM: "",
  DESTINO: "",
  localStart: null,
  localEnd: null,
  tipoMissao: "Manual",
  Cafe: 0, Almoco: 0, Jantar: 0, Ceia: 0,
  QtdDiarias: 0,
  Valor: 0,
  // Garante que os trips sejam criados com base no estado atual do sistema
  trips: criarTripsVazio(__tripCodesAtivos) 
};

    __ultimoResultado.unshift(novo);
    renderTabela(__ultimoResultado, __tripCodesAtivos);
  });
}

// Inicia a tentativa de bind
inicializarBotaoManual();

/* Insira no final do arquivo */
window.updateManualField = (id, field, value) => {
  const row = __ultimoResultado.find(r => r.__id === id);
  if (row) {
    if (field === 'Valor') {
      row[field] = parseFloat(value) || 0;
      renderResumo(); // Recalcula os cards de dinheiro na hora
    } else {
      row[field] = value;
    }
  }
};

/* Adicione ao final do arquivo */
window.removerLinhaManual = (id) => {
  if (confirm("Deseja realmente remover esta linha manual?")) {
    // Filtra o array removendo o item com o id correspondente
    __ultimoResultado = __ultimoResultado.filter(r => r.__id !== id);
    
    // Renderiza a tabela novamente com os dados atualizados
    renderTabela(__ultimoResultado, __tripCodesAtivos);
  }
};

