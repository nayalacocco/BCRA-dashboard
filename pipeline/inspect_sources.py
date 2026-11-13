"""Diagnóstico de estructura de fuentes (solo para desarrollo de F1)."""
import io, sys
import requests, xlrd

UA = {"User-Agent": "Mozilla/5.0 (atlas-bcra-dashboard pipeline)"}
url = "https://www.indec.gob.ar/ftp/cuadros/economia/ponderadores_ipc.xls"
r = requests.get(url, headers=UA, timeout=60)
print("status", r.status_code, "bytes", len(r.content))
wb = xlrd.open_workbook(file_contents=r.content)
for sh in wb.sheets():
    print(f"\n=== SHEET '{sh.name}' rows={sh.nrows} cols={sh.ncols}")
    for i in range(sh.nrows):
        row = [sh.cell_value(i, j) for j in range(sh.ncols)]
        print(i, " | ".join(str(x)[:60] for x in row))

for f in ["serie_ipc_aperturas.csv", "serie_ipc_divisiones.csv"]:
    r = requests.get("https://www.indec.gob.ar/ftp/cuadros/economia/" + f, headers=UA, timeout=60)
    print(f, r.status_code, len(r.content))
