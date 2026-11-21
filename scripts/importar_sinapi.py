import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

URL_BASE = "https://orcamentor.com/insumos/"
SAIDA_JSON = Path(__file__).resolve().parent.parent / "data" / "sinapi_dados.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
}


def limpar_preco(texto_preco: str) -> float:
    """Converte textos como 'R$ 1.250,50' ou 'R$ 95.00' em float."""
    if not texto_preco:
        return 0.0
    limpo = re.sub(r"[^\d.,]", "", texto_preco).strip()
    if not limpo:
        return 0.0

    # Se tiver vírgula e ponto, assume ponto como milhar e vírgula como decimal
    if "," in limpo and "." in limpo:
        limpo = limpo.replace(".", "").replace(",", ".")
    elif "," in limpo:
        limpo = limpo.replace(",", ".")

    try:
        return float(limpo)
    except ValueError:
        return 0.0


def parsear_linhas_tabela(html: str) -> list[dict]:
    """Extrai os insumos de uma página HTML."""
    soup = BeautifulSoup(html, "html.parser")
    itens = []

    for linha in soup.select("table tbody tr, table tr"):
        colunas = [td.get_text(" ", strip=True) for td in linha.find_all("td")]
        if len(colunas) >= 5:
            codigo, descricao, custo_txt, unidade, tipo = colunas[:5]
            if not codigo or codigo.lower() == "codigo":
                continue

            itens.append({
                "codigo": codigo,
                "descricao": descricao,
                "preco_unitario": limpar_preco(custo_txt),
                "unidade": unidade,
                "tipo": tipo,
            })

    return itens


def encontrar_proxima_url(soup: BeautifulSoup, url_atual: str, visitadas: set[str]) -> str | None:
    """Tenta localizar o link da próxima página na barra de paginação."""
    for link in soup.find_all("a", href=True):
        texto = link.get_text(" ", strip=True).lower()
        href_completa = urljoin(url_atual, link["href"])

        if href_completa in visitadas:
            continue

        if texto in {"próxima", "proxima", "next", ">", "»"}:
            return href_completa

    return None


def extrair_todas_paginas_requests(url_inicial: str, delay: float = 0.8) -> list[dict]:
    """Percorre páginas sequencialmente via requests + BeautifulSoup."""
    visitadas: set[str] = set()
    todos_itens: dict[str, dict] = {}
    url_atual: str | None = url_inicial
    pagina_num = 1

    with requests.Session() as session:
        session.headers.update(HEADERS)

        while url_atual and url_atual not in visitadas:
            print(f"[requests] Lendo página {pagina_num}: {url_atual}")
            resp = session.get(url_atual, timeout=25)
            resp.raise_for_status()

            visitadas.add(url_atual)
            itens_pagina = parsear_linhas_tabela(resp.text)

            if not itens_pagina:
                print(f"Nenhum item encontrado na página {pagina_num}. Encerrando loop.")
                break

            novos_na_pagina = 0
            for item in itens_pagina:
                chave = f"{item['codigo']}_{item['unidade']}"
                if chave not in todos_itens:
                    todos_itens[chave] = item
                    novos_na_pagina += 1

            print(f"  -> {len(itens_pagina)} linhas lidas ({novos_na_pagina} novos).")

            # Se uma página inteira não trouxer nenhum item novo, evita loop infinito
            if novos_na_pagina == 0 and pagina_num > 1:
                print("Página sem itens novos. Encerrando paginação.")
                break

            soup = BeautifulSoup(resp.text, "html.parser")
            url_atual = encontrar_proxima_url(soup, url_atual, visitadas)
            pagina_num += 1

            if url_atual:
                time.sleep(delay)

    return list(todos_itens.values())


def extrair_todas_paginas_playwright(url_inicial: str, delay: float = 1.0) -> list[dict]:
    """Fallback com navegador real (Playwright) caso a paginação dependa de JS."""
    from playwright.sync_api import sync_playwright

    todos_itens: dict[str, dict] = {}
    assinaturas_paginas: set[str] = set()
    pagina_num = 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url_inicial, wait_until="networkidle", timeout=60000)

        while True:
            page.wait_for_selector("table tr", timeout=15000)
            html = page.content()
            itens_pagina = parsear_linhas_tabela(html)

            if not itens_pagina:
                break

            # Cria uma assinatura simples para detectar se o clique não mudou a página
            assinatura = "|".join(f"{i['codigo']}:{i['preco_unitario']}" for i in itens_pagina[:5])
            if assinatura in assinaturas_paginas:
                print("Conteúdo repetido detectado. Fim das páginas.")
                break
            assinaturas_paginas.add(assinatura)

            novos = 0
            for item in itens_pagina:
                chave = f"{item['codigo']}_{item['unidade']}"
                if chave not in todos_itens:
                    todos_itens[chave] = item
                    novos += 1

            print(f"[playwright] Página {pagina_num}: {len(itens_pagina)} itens ({novos} novos).")

            # Procura botão ou link de "Próxima"
            botao_proxima = page.locator(
                "a, button",
                has_text=re.compile(r"^(próxima|proxima|next|›|»)$", re.I)
            ).first

            if botao_proxima.count() == 0 or not botao_proxima.is_enabled():
                print("Botão de próxima página não encontrado ou desabilitado.")
                break

            classes = (botao_proxima.get_attribute("class") or "").lower()
            if "disabled" in classes:
                print("Botão de próxima página marcado como disabled.")
                break

            botao_proxima.click()
            pagina_num += 1
            time.sleep(delay)
            page.wait_for_load_state("networkidle", timeout=20000)

        browser.close()

    return list(todos_itens.values())


def salvar_json(dados: list[dict], caminho: Path) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as arquivo:
        json.dump(dados, arquivo, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    dados_extraidos = extrair_todas_paginas_requests(URL_BASE, delay=0.8)

    # Se vier vazio (ex.: site carrega tabela via JS), tenta com Playwright
    if not dados_extraidos:
        print("Tentando extração com Playwright...")
        dados_extraidos = extrair_todas_paginas_playwright(URL_BASE, delay=1.0)

    # Só salva se vierem itens válidos; se falhar, preserva o JSON atual
    if not dados_extraidos:
        print("Aviso: nenhum item extraído. O arquivo 'sinapi_dados.json' atual foi mantido.")
    else:
        salvar_json(dados_extraidos, SAIDA_JSON)
        print(f"\nConcluído! Total de insumos salvos: {len(dados_extraidos)} em '{SAIDA_JSON}'.")