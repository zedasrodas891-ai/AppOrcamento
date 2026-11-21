import json
import math
import os
import unicodedata
from pathlib import Path
from flask import Flask, jsonify, render_template, request

_HERE = Path(__file__).resolve().parent
BASE_DIR = (
    _HERE
    if (_HERE / "data").exists() or (_HERE / "templates").exists()
    else _HERE.parent
)
DADOS_PATH = BASE_DIR / "data" / "sinapi_dados.json"

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "templates"),
    static_folder=str(BASE_DIR / "static"),
)

_cache_insumos: list[dict] = []
_cache_mtime: float | None = None


def normalizar_texto(texto: str) -> str:
    """Remove acentos e converte para minúsculas para facilitar a busca."""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def obter_insumos() -> list[dict]:
    """Carrega o JSON e recarrega automaticamente se o arquivo for modificado."""
    global _cache_insumos, _cache_mtime

    if not DADOS_PATH.exists():
        _cache_insumos = []
        _cache_mtime = None
        return _cache_insumos

    mtime_atual = DADOS_PATH.stat().st_mtime
    if _cache_mtime != mtime_atual:
        with open(DADOS_PATH, "r", encoding="utf-8") as f:
            dados = json.load(f)
        _cache_insumos = dados if isinstance(dados, list) else []
        _cache_mtime = mtime_atual

    return _cache_insumos


@app.route("/")
def index():
    insumos = obter_insumos()
    tipos = sorted({item.get("tipo", "").strip() for item in insumos if item.get("tipo")})
    return render_template("index.html", tipos=tipos)


@app.route("/api/insumos")
def buscar_insumos():
    insumos = obter_insumos()
    termo = normalizar_texto(request.args.get("q", ""))
    tipo_filtro = request.args.get("tipo", "Todos").strip()

    try:
        pagina = max(1, int(request.args.get("pagina", 1)))
    except ValueError:
        pagina = 1

    try:
        por_pagina = int(request.args.get("por_pagina", 50))
    except ValueError:
        por_pagina = 50
    por_pagina = min(max(por_pagina, 10), 200)

    resultados = []
    for item in insumos:
        if tipo_filtro != "Todos" and item.get("tipo", "").strip() != tipo_filtro:
            continue

        if termo:
            codigo_norm = normalizar_texto(item.get("codigo", ""))
            desc_norm = normalizar_texto(item.get("descricao", ""))
            if termo not in codigo_norm and termo not in desc_norm:
                continue

        resultados.append(item)

    total = len(resultados)
    total_paginas = max(1, math.ceil(total / por_pagina))
    pagina_atual = min(pagina, total_paginas)

    inicio = (pagina_atual - 1) * por_pagina
    fim = inicio + por_pagina

    return jsonify({
        "total": total,
        "pagina": pagina_atual,
        "por_pagina": por_pagina,
        "total_paginas": total_paginas,
        "itens": resultados[inicio:fim],
    })


if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=porta, debug=True)