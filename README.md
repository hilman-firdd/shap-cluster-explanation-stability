# How Stable Are Cluster Explanations?

Code and data for the paper **"How Stable Are Cluster Explanations? Assessing SHAP Explanation Multiplicity in Post-hoc Interpretation of Regional Clustering"** (submitted to *ADCAIJ: Advances in Distributed Computing and Artificial Intelligence Journal*).

The study measures how much post-hoc SHAP explanations of k-means clusters change when only analytical choices change: the clustering seed, the surrogate classifier and its seed, the SHAP estimator, and the background sample.

## Pipeline

| Step | Script | Output |
|---|---|---|
| 0. Build the regional datasets (optional, already included) | `prepare_d1.py` | `data/d1a.csv`, `data/d1b.csv`, `data/d1_consistency_check.csv` |
| 1. Choose k (silhouette + gap statistic) | `select_k.py` | `select_k_<name>.csv` |
| 2. OFAT sweep (RQ1, RQ3), 180-run factorial + mixed model (RQ2), aggregation curve | `shap_cluster_multiplicity.py` | `pairs_ofat_*`, `summary_ofat_*`, `pairs_factorial_*`, `effects_factorial_*`, `runs_importance_*`, `ref_partition_*`, `aggregation_curve_*` |
| 3. Aggregated SHAP vs IMM threshold tree (RQ4) | `rq4_imm.py` | `rq4_<name>.csv` |
| 4. Collect all reported numbers | `compute_results.py` | `results.json` |
| 5. Figures (300 dpi PNG + TIFF) | `make_figures_all.py` | `Fig1`–`Fig3` |
| 6. Manuscript (optional) | `manuscript/build_manuscript.js`, `manuscript/post.py` | `.docx` |

Run everything from the repository root:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
bash run_all.sh
```

The full run takes a few hours on a laptop CPU; the D1b factorial (693 rows × 180 runs) is the slowest step. All seeds are fixed, so the outputs should match `results/` up to floating-point differences between library versions.

## Experimental design

* **Clustering:** k-means (k-means++ initialisation, `n_init=1` as the default single-start setting; `--n-init 10` for the robustness check). The reference partition uses `n_init=50, random_state=12345`. Cluster labels are aligned with the Hungarian method.
* **Surrogates:** decision tree (depth ≤ 4), random forest (300 trees), LightGBM, and logistic regression.
* **Explainers:** interventional and path-dependent TreeSHAP, KernelSHAP, and LinearSHAP. A surrogate-free reference applies KernelSHAP to the soft cluster assignment.
* **Similarity metrics:** cosine, Kendall's τ-b, top-3/top-5 Jaccard, and normalised rank-biased overlap (p = 0.9).
* **Factorial design:** 5 clustering seeds × 3 surrogates × 3 surrogate seeds × 4 explainer settings = 180 runs. Factor effects come from a linear mixed model with crossed random intercepts for both runs in a pair (`statsmodels` MixedLM, 6,000 sampled pairs).
* **RQ4:** IMM threshold tree (Dasgupta et al., 2020), implemented in `rq4_imm.py`, and the price of explainability.

## Data

| Name | Description | Source |
|---|---|---|
| D1a | 33 Indonesian provinces, disaster events and impacts 2002–2022 (18 features) | Wahyudi (2024), Indonesian Disaster Dataset, Mendeley Data, https://doi.org/10.17632/pyftdypmfs.1 |
| D1b | Same data at province-year level (693 rows) | as above |
| Population | 2020 census population by province, used to scale impacts per million | Badan Pusat Statistik (2021), `data/bps_population_sp2020_province.csv` |
| B2 Wine | 178 wines, 13 features | UCI ML Repository, https://doi.org/10.24432/C5PC7J (loaded from `sklearn.datasets.load_wine`) |

To rebuild D1a/D1b, download the 33 province `.xlsx` files from Mendeley Data into `raw/` and run:

```bash
python -I prepare_d1.py raw data/bps_population_sp2020_province.csv data
```

## Repository layout

```
├── shap_cluster_multiplicity.py   # main experiment (OFAT, factorial, aggregation curve)
├── prepare_d1.py                  # builds D1a / D1b
├── select_k.py                    # silhouette + gap statistic
├── rq4_imm.py                     # IMM threshold tree vs aggregated SHAP
├── compute_results.py             # all numbers reported in the paper -> results.json
├── make_figures_all.py            # Fig. 1-3
├── run_all.sh                     # full pipeline
├── data/                          # derived datasets + BPS population
├── results/                       # outputs used in the paper
└── manuscript/                    # docx build script (Node.js, `docx` package)
```

## Citation

If you use this code, please cite the paper (citation will be added after publication).

## Authors

Hilman Firdaus, Wendy Sarasjati, Dhendra Marutho. Magister Programme of Informatics, Universitas Muhammadiyah Semarang, Indonesia.
