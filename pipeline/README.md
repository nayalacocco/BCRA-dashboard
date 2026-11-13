# Pipeline de inflación

Python, corre en GitHub Actions (`.github/workflows/inflacion-pipeline.yml`). Descarga, valida y exporta JSON
versionado a `data/inflacion/`; la web solo lee esos archivos. Si un check bloqueante falla, no se escriben datos
y la web sigue con la última versión válida.

```bash
cd pipeline
pip install -r requirements.txt
python -m pytest -q tests                       # tests con paneles sintéticos
python -m inflacion.run --out ../data/inflacion  # descarga INDEC, valida, exporta (F1) y calcula difusión/rotación (F2)
python -m inflacion.difusion_export --data ../data/inflacion  # solo F2, sobre datos ya generados
python -m inflacion.byma_snapshot --out ../data/bonos
```

Metodología y fuentes: `docs/inflacion/`.
