"""Silhouette and gap statistic (Tibshirani et al., 2001) for k = 2..8, on the same preprocessing as the experiments.
Usage: python select_k.py <data: wine | csv> [--id-col ID] [--log1p]
"""
import argparse
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import shap_cluster_multiplicity as m

ap = argparse.ArgumentParser()
ap.add_argument("data"); ap.add_argument("--id-col"); ap.add_argument("--log1p", action="store_true")
ap.add_argument("--B", type=int, default=50)
a = ap.parse_args()
X, feats, name = m.load_data(a.data, a.id_col, a.log1p)
rng = np.random.default_rng(0)
lo, hi = X.min(0), X.max(0)
rows = []
for k in range(2, 9):
    km = KMeans(k, n_init=50, random_state=12345).fit(X)
    logW = np.log(km.inertia_)
    ref = [np.log(KMeans(k, n_init=10, random_state=b).fit(rng.uniform(lo, hi, X.shape)).inertia_) for b in range(a.B)]
    gap, sk = np.mean(ref) - logW, np.std(ref) * np.sqrt(1 + 1 / a.B)
    rows.append({"k": k, "silhouette": silhouette_score(X, km.labels_), "gap": gap, "gap_sk": sk,
                 "min_cluster_size": np.bincount(km.labels_).min()})
r = pd.DataFrame(rows)
# Tibshirani rule: smallest k with gap(k) >= gap(k+1) - s(k+1)
r["gap_rule"] = [bool(r.gap[i] >= r.gap[i + 1] - r.gap_sk[i + 1]) if i + 1 < len(r) else False for i in range(len(r))]
r.to_csv(f"select_k_{name}.csv", index=False)
print(name, X.shape)
print(r.round(3).to_string(index=False))
