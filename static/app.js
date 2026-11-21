const campoBusca = document.getElementById("campo-busca");
const filtroTipo = document.getElementById("filtro-tipo");
const btnBuscar = document.getElementById("btn-buscar");
const btnLimpar = document.getElementById("btn-limpar");
const tabelaBody = document.getElementById("tabela-insumos");
const statusResultados = document.getElementById("status-resultados");
const paginacaoEl = document.getElementById("paginacao");

const painelAvaliacao = document.getElementById("painel-avaliacao");
const btnFecharAvaliacao = document.getElementById("btn-fechar-avaliacao");
const avCodigo = document.getElementById("av-codigo");
const avDescricao = document.getElementById("av-descricao");
const avTipo = document.getElementById("av-tipo");
const avUnidade = document.getElementById("av-unidade");
const avValorUnitario = document.getElementById("av-valor-unitario");
const avPrecoFormatado = document.getElementById("av-preco-formatado");
const avPercMaoObra = document.getElementById("av-perc-mao-obra");
const avValorMaterial = document.getElementById("av-valor-material");
const avValorMaoObra = document.getElementById("av-valor-mao-obra");
const avQuantitativo = document.getElementById("av-quantitativo");
const avSubMaterial = document.getElementById("av-sub-material");
const avSubMaoObra = document.getElementById("av-sub-mao-obra");
const avTotalItem = document.getElementById("av-total-item");
const btnAdicionarOrcamento = document.getElementById(
  "btn-adicionar-orcamento",
);

const tabelaOrcamento = document.getElementById("tabela-orcamento");
const btnLimparOrcamento = document.getElementById("btn-limpar-orcamento");
const totalGeralMaterialEl = document.getElementById("total-geral-material");
const totalGeralMaoObraEl = document.getElementById("total-geral-mao-obra");
const totalGeralOrcamentoEl = document.getElementById("total-geral-orcamento");

const CHAVE_STORAGE = "orcamento_sinapi_itens";
const ITENS_POR_PAGINA = 50;

let paginaAtual = 1;
let itensAtuais = [];
let insumoSelecionado = null;
let valorUnitarioAtual = 0;
let valorMaterialUnitario = 0;
let valorMaoObraUnitario = 0;
let quantitativoAtual = 1;
let subtotalMaterial = 0;
let subtotalMaoObra = 0;
let totalItemAtual = 0;
let itensOrcamento = carregarOrcamentoSalvo();

function carregarOrcamentoSalvo() {
  try {
    const salvo = localStorage.getItem(CHAVE_STORAGE);
    return salvo ? JSON.parse(salvo) : [];
  } catch {
    return [];
  }
}

function salvarOrcamento() {
  localStorage.setItem(CHAVE_STORAGE, JSON.stringify(itensOrcamento));
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function paraCentavos(valor) {
  return Math.round((Number(valor) || 0) * 100);
}

function centavosParaReais(centavos) {
  return centavos / 100;
}

function escaparHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sugerirPercentualMaoObra(tipoInsumo) {
  const tipoNorm = String(tipoInsumo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (tipoNorm.includes("mao") || tipoNorm.includes("obra")) {
    return 100;
  }
  return 0;
}

function obterValorUnitarioAtual() {
  const valor = parseFloat(String(avValorUnitario.value).replace(",", "."));
  return Number.isNaN(valor) || valor < 0 ? 0 : valor;
}

function obterQuantitativoAtual() {
  const qtd = parseFloat(String(avQuantitativo.value).replace(",", "."));
  return Number.isNaN(qtd) || qtd < 0 ? 0 : qtd;
}

function atualizarCalculosAvaliacao() {
  valorUnitarioAtual = obterValorUnitarioAtual();
  avPrecoFormatado.textContent = formatarMoeda(valorUnitarioAtual);

  let percMaoObra = parseFloat(String(avPercMaoObra.value).replace(",", "."));
  if (Number.isNaN(percMaoObra)) percMaoObra = 0;
  percMaoObra = Math.min(100, Math.max(0, percMaoObra));

  valorMaoObraUnitario = Number(
    ((valorUnitarioAtual * percMaoObra) / 100).toFixed(4),
  );
  valorMaterialUnitario = Number(
    (valorUnitarioAtual - valorMaoObraUnitario).toFixed(4),
  );

  avValorMaterial.textContent = formatarMoeda(valorMaterialUnitario);
  avValorMaoObra.textContent = formatarMoeda(valorMaoObraUnitario);

  quantitativoAtual = obterQuantitativoAtual();

  const subMatCentavos = Math.round(
    valorMaterialUnitario * quantitativoAtual * 100,
  );
  const subMaoCentavos = Math.round(
    valorMaoObraUnitario * quantitativoAtual * 100,
  );
  const totalItemCentavos = subMatCentavos + subMaoCentavos;

  subtotalMaterial = centavosParaReais(subMatCentavos);
  subtotalMaoObra = centavosParaReais(subMaoCentavos);
  totalItemAtual = centavosParaReais(totalItemCentavos);

  avSubMaterial.textContent = formatarMoeda(subtotalMaterial);
  avSubMaoObra.textContent = formatarMoeda(subtotalMaoObra);
  avTotalItem.textContent = formatarMoeda(totalItemAtual);
}

function abrirAvaliacaoInsumo(item) {
  if (!item) return;

  insumoSelecionado = item;
  avCodigo.textContent = item.codigo || "-";
  avDescricao.textContent = item.descricao || "-";
  avTipo.textContent = item.tipo || "-";
  avUnidade.textContent = item.unidade || "-";

  avValorUnitario.value = Number(item.preco_unitario || 0).toFixed(2);
  avPercMaoObra.value = sugerirPercentualMaoObra(item.tipo);
  avQuantitativo.value = "1";

  atualizarCalculosAvaliacao();

  painelAvaliacao.style.display = "block";
  painelAvaliacao.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderizarListaOrcamento() {
  tabelaOrcamento.innerHTML = "";

  if (itensOrcamento.length === 0) {
    tabelaOrcamento.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: #666;">
          Nenhum item adicionado ao orçamento ainda.
        </td>
      </tr>
    `;
    totalGeralMaterialEl.textContent = formatarMoeda(0);
    totalGeralMaoObraEl.textContent = formatarMoeda(0);
    totalGeralOrcamentoEl.textContent = formatarMoeda(0);
    return;
  }

  let somaMaterialCentavos = 0;
  let somaMaoObraCentavos = 0;

  itensOrcamento.forEach((item, indice) => {
    somaMaterialCentavos += paraCentavos(item.subtotal_material);
    somaMaoObraCentavos += paraCentavos(item.subtotal_mao_obra);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escaparHtml(item.codigo)}</td>
      <td>${escaparHtml(item.descricao)}</td>
      <td>${escaparHtml(item.unidade)}</td>
      <td>${item.quantitativo}</td>
      <td>${formatarMoeda(item.subtotal_material)}</td>
      <td>${formatarMoeda(item.subtotal_mao_obra)}</td>
      <td><strong>${formatarMoeda(item.total)}</strong></td>
      <td><button type="button" class="perigo btn-remover-item" data-indice="${indice}">X</button></td>
    `;

    tr.querySelector(".btn-remover-item").addEventListener("click", () => {
      itensOrcamento.splice(indice, 1);
      salvarOrcamento();
      renderizarListaOrcamento();
    });

    tabelaOrcamento.appendChild(tr);
  });

  const somaGeralCentavos = somaMaterialCentavos + somaMaoObraCentavos;
  totalGeralMaterialEl.textContent = formatarMoeda(
    centavosParaReais(somaMaterialCentavos),
  );
  totalGeralMaoObraEl.textContent = formatarMoeda(
    centavosParaReais(somaMaoObraCentavos),
  );
  totalGeralOrcamentoEl.textContent = formatarMoeda(
    centavosParaReais(somaGeralCentavos),
  );
}

function criarBotaoPagina(
  texto,
  alvoPagina,
  { ativa = false, desabilitado = false } = {},
) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = texto;
  btn.className = ativa ? "btn-pagina ativa" : "btn-pagina";
  btn.disabled = desabilitado;

  if (!desabilitado && !ativa) {
    btn.addEventListener("click", () => {
      carregarInsumos(alvoPagina);
      tabelaBody.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return btn;
}

function renderizarPaginacao(pagina, totalPaginas, totalItens) {
  paginacaoEl.innerHTML = "";

  if (totalItens === 0 || totalPaginas <= 1) {
    return;
  }

  paginacaoEl.appendChild(
    criarBotaoPagina("Anterior", pagina - 1, {
      desabilitado: pagina <= 1,
    }),
  );

  const paginasVisiveis = new Set([
    1,
    totalPaginas,
    pagina - 2,
    pagina - 1,
    pagina,
    pagina + 1,
    pagina + 2,
  ]);

  const ordenadas = [...paginasVisiveis]
    .filter((p) => p >= 1 && p <= totalPaginas)
    .sort((a, b) => a - b);

  let anterior = 0;
  for (const p of ordenadas) {
    if (p - anterior > 1) {
      const span = document.createElement("span");
      span.className = "paginacao-reticencias";
      span.textContent = "...";
      paginacaoEl.appendChild(span);
    }

    paginacaoEl.appendChild(
      criarBotaoPagina(String(p), p, { ativa: p === pagina }),
    );
    anterior = p;
  }

  paginacaoEl.appendChild(
    criarBotaoPagina("Próximo", pagina + 1, {
      desabilitado: pagina >= totalPaginas,
    }),
  );
}

btnAdicionarOrcamento.addEventListener("click", () => {
  if (!insumoSelecionado) return;

  atualizarCalculosAvaliacao();

  if (quantitativoAtual <= 0) {
    alert("Informe um quantitativo maior que zero.");
    return;
  }

  itensOrcamento.push({
    codigo: insumoSelecionado.codigo,
    descricao: insumoSelecionado.descricao,
    unidade: insumoSelecionado.unidade,
    tipo: insumoSelecionado.tipo,
    valor_unitario: valorUnitarioAtual,
    quantitativo: quantitativoAtual,
    subtotal_material: subtotalMaterial,
    subtotal_mao_obra: subtotalMaoObra,
    total: totalItemAtual,
  });

  salvarOrcamento();
  renderizarListaOrcamento();

  painelAvaliacao.style.display = "none";
  insumoSelecionado = null;
});

btnLimparOrcamento.addEventListener("click", () => {
  if (itensOrcamento.length === 0) return;
  itensOrcamento = [];
  salvarOrcamento();
  renderizarListaOrcamento();
});

btnFecharAvaliacao.addEventListener("click", () => {
  painelAvaliacao.style.display = "none";
  insumoSelecionado = null;
});

avValorUnitario.addEventListener("input", atualizarCalculosAvaliacao);
avPercMaoObra.addEventListener("input", atualizarCalculosAvaliacao);
avQuantitativo.addEventListener("input", atualizarCalculosAvaliacao);

async function carregarInsumos(pagina = 1) {
  paginaAtual = pagina;
  const q = encodeURIComponent(campoBusca.value.trim());
  const tipo = encodeURIComponent(filtroTipo.value);

  const resposta = await fetch(
    `/api/insumos?q=${q}&tipo=${tipo}&pagina=${paginaAtual}&por_pagina=${ITENS_POR_PAGINA}`,
  );
  const dados = await resposta.json();

  paginaAtual = dados.pagina || 1;
  const totalPaginas = dados.total_paginas || 1;
  const totalItens = dados.total || 0;
  itensAtuais = dados.itens || [];

  tabelaBody.innerHTML = "";

  if (itensAtuais.length === 0) {
    tabelaBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #666;">
          Nenhum insumo encontrado para esse filtro.
        </td>
      </tr>
    `;
  } else {
    itensAtuais.forEach((item, indice) => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.innerHTML = `
        <td>${escaparHtml(item.codigo)}</td>
        <td>${escaparHtml(item.descricao)}</td>
        <td>${formatarMoeda(item.preco_unitario)}</td>
        <td>${escaparHtml(item.unidade)}</td>
        <td>${escaparHtml(item.tipo)}</td>
        <td><button type="button" class="btn-avaliar" data-indice="${indice}">Avaliar</button></td>
      `;

      tr.addEventListener("click", () => abrirAvaliacaoInsumo(item));

      const botaoAvaliar = tr.querySelector(".btn-avaliar");
      botaoAvaliar.addEventListener("click", (evento) => {
        evento.stopPropagation();
        abrirAvaliacaoInsumo(item);
      });

      tabelaBody.appendChild(tr);
    });
  }

  if (totalItens === 0) {
    statusResultados.textContent = "0 insumos encontrados.";
  } else {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
    const fim = inicio + itensAtuais.length - 1;
    statusResultados.textContent = `Exibindo ${inicio}–${fim} de ${totalItens} insumos (Página ${paginaAtual} de ${totalPaginas}).`;
  }

  renderizarPaginacao(paginaAtual, totalPaginas, totalItens);
}

btnBuscar.addEventListener("click", () => carregarInsumos(1));
filtroTipo.addEventListener("change", () => carregarInsumos(1));
campoBusca.addEventListener("input", () => carregarInsumos(1));

btnLimpar.addEventListener("click", () => {
  campoBusca.value = "";
  filtroTipo.value = "Todos";
  carregarInsumos(1);
});

carregarInsumos(1);
renderizarListaOrcamento();
