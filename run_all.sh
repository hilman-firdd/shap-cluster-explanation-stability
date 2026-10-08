#!/usr/bin/env bash
# Full pipeline. Run from the repository root. Outputs are written to the root (see .gitignore);
# the copies used in the paper are in results/.
set -euo pipefail

# 0. (optional) rebuild D1a/D1b from the raw Mendeley xlsx files (data/d1a.csv and data/d1b.csv are already included)
# python -I prepare_d1.py <folder_with_33_xlsx> data/bps_population_sp2020_province.csv data

# 1. choose k (silhouette + gap statistic)
python select_k.py data/d1a.csv --id-col province --log1p
python select_k.py data/d1b.csv --id-col id --log1p
python select_k.py wine

# 2. experiments: OFAT (RQ1, RQ3) + 180-run factorial (RQ2) + aggregation curve
python -u shap_cluster_multiplicity.py --data data/d1a.csv --id-col province --log1p --k 2 --reps 30 --mode both
python -u shap_cluster_multiplicity.py --data data/d1b.csv --id-col id --log1p --k 2 --reps 30 --mode both
python -u shap_cluster_multiplicity.py --data wine --k 3 --reps 30 --mode both
# robustness: 10 k-means restarts per clustering seed (D1a)
python -u shap_cluster_multiplicity.py --data data/d1a.csv --id-col province --log1p --k 2 --mode factorial --n-init 10 --tag _ninit10

# 3. RQ4: aggregated SHAP vs IMM threshold tree
python rq4_imm.py data/d1a.csv 2 --id-col province --log1p
python rq4_imm.py data/d1a.csv 2 --id-col province --log1p --tag _ninit10
python rq4_imm.py wine 3

# 4. collect reported numbers and draw figures
python compute_results.py
python make_figures_all.py d1a d1b wine

# 5. (optional) rebuild the manuscript .docx (needs Node.js and `npm install docx`)
# node manuscript/build_manuscript.js out && python manuscript/post.py out/ADCAIJ_manuscript_cluster_explanation_stability.docx
