"""Collect every number reported in the manuscript from the experiment logs into results.json.
Usage: python compute_results.py   (run from the repository root after all experiments)
"""
import json
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import shap_cluster_multiplicity as m

DS = {"d1a": ("data/d1a.csv", "province", True, 2), "d1b": ("data/d1b.csv", "id", True, 2), "wine": ("wine", None, False, 3)}
R = {}


def boot(x):
    lo, hi = m.bootstrap_ci(np.asarray(x, float))
    return [float(lo), float(hi)]


for name, (src, idc, lg, k) in DS.items():
    X, feats, _ = m.load_data(src, idc, lg)
    ref = KMeans(k, n_init=50, random_state=12345).fit(X).labels_
    p = pd.read_csv(f"pairs_ofat_{name}.csv")
    core = p[p.factor != "REF_surrogate_free"]
    f1 = p[p.factor == "F1_cluster_seed"]
    f2 = p[p.factor == "F2_surrogate"]
    fid = pd.concat([f2[["cfg_a", "fidelity_a"]], f2[["cfg_b", "fidelity_b"]].set_axis(["cfg_a", "fidelity_a"], axis=1)])
    fid["sur"] = fid.cfg_a.str.extract(r"surrogate='(\w+)'")
    fid = fid.groupby("sur").fidelity_a.first()
    sk = pd.read_csv(f"select_k_{name}.csv")
    eff = pd.read_csv(f"effects_factorial_{name}.csv")
    curve = pd.read_csv(f"aggregation_curve_{name}.csv").groupby("n_runs")[["median_tau", "p05_tau"]].mean()
    runs = pd.read_csv(f"runs_importance_{name}.csv")
    ari_runs = runs.groupby("run").ari_to_ref.first()
    R[name] = {
        "n": int(X.shape[0]), "p": int(X.shape[1]), "k": k,
        "silhouette": float(silhouette_score(X, ref)),
        "select_k": sk.round(4).to_dict(orient="records"),
        "ari_seed_median": float(f1.ari.median()), "ari_seed_ci": boot(f1.ari),
        "ari_seed_share_lt1": float((f1.ari < 1).mean()), "ari_seed_min": float(f1.ari.min()),
        "fidelity": {s: float(v) for s, v in fid.items()},
        "ofat_pairs": int(len(core)),
        "median_all": {c: float(core[c].median()) for c in ["cosine", "kendall_tau", "jaccard_top3", "rbo"]},
        "tau_by_factor": {f: float(g.kendall_tau.median()) for f, g in p.groupby("factor")},
        "j3_by_factor": {f: float(g.jaccard_top3.median()) for f, g in p.groupby("factor")},
        "share_cos95": float((core.cosine >= 0.95).mean()),
        "rq3_share": float(((core.cosine >= 0.95) & (core.jaccard_top3 < 1)).mean()),
        "rq3_count": int(((core.cosine >= 0.95) & (core.jaccard_top3 < 1)).sum()),
        "rq3_share_among_cos95": float(((core.cosine >= 0.95) & (core.jaccard_top3 < 1)).sum() / max(1, (core.cosine >= 0.95).sum())),
        "effects": eff[["metric", "term", "coef", "ci_low", "ci_high", "p_value"]].to_dict(orient="records"),
        "curve": {int(n): [float(r.median_tau), float(r.p05_tau)] for n, r in curve.iterrows()},
        "factorial_runs_matching_ref": int((ari_runs >= 0.9).sum()), "factorial_ari_median": float(ari_runs.median()),
    }

# robustness: D1a with 10 k-means restarts per seed
eff10 = pd.read_csv("effects_factorial_d1a_ninit10.csv")
c10 = pd.read_csv("aggregation_curve_d1a_ninit10.csv").groupby("n_runs")[["median_tau", "p05_tau"]].mean()
r10 = pd.read_csv("runs_importance_d1a_ninit10.csv").groupby("run").ari_to_ref.first()
R["d1a_ninit10"] = {"effects": eff10[["metric", "term", "coef", "ci_low", "ci_high", "p_value"]].to_dict(orient="records"),
                    "curve": {int(n): [float(r.median_tau), float(r.p05_tau)] for n, r in c10.iterrows()},
                    "runs_matching_ref": int((r10 >= 0.9).sum()), "ari_median": float(r10.median())}

# RQ4 (partition-matched runs): d1a uses the n_init = 10 runs, wine the standard runs
rq4 = {}
for nm in ["d1a_ninit10", "wine"]:
    r = pd.read_csv(f"runs_importance_{nm}.csv"); q = pd.read_csv(f"rq4_{nm}.csv")
    feats = [c for c in r.columns if c not in ["run", "cfg", "surrogate", "cluster_seed", "fidelity", "ari_to_ref", "cluster"]]
    r = r[r.ari_to_ref >= 0.9]
    out = []
    for c in sorted(r.cluster.unique()):
        qq = q[(q.cluster == c) & q.scope.str.startswith("runs reproducing")].iloc[0]
        path = qq.imm_path_features.split("; "); kk = len(path)
        single = r[r.cluster == c].apply(lambda row: len(set(row[feats].astype(float).sort_values(ascending=False).index[:kk]) & set(path))
                                         / len(set(row[feats].astype(float).sort_values(ascending=False).index[:kk]) | set(path)), axis=1)
        out.append({"cluster": int(c), "path": path, "agg_topk": qq.shap_top_k.split("; "), "agg_top3": qq.shap_top3.split("; "),
                    "agg_jaccard": float(qq.jaccard_topk_vs_path), "single_mean": float(single.mean()),
                    "single_exact": float((single == 1).mean()), "n_runs": int(len(single))})
    rq4[nm] = {"clusters": out, "price": float(q.price_of_explainability.iloc[0]), "agreement": float(q.tree_ref_agreement.iloc[0])}
R["rq4"] = rq4
cons = pd.read_csv("data/d1_consistency_check.csv")
R["d1_check"] = {"provinces_with_diff": int((cons["diff"] != 0).sum()), "max_pct": float((cons["diff"] / cons.all_data_sheet * 100).max()),
                 "events_all_sheet": int(cons.all_data_sheet.sum()), "events_years": int(cons.sum_of_years.sum())}
json.dump(R, open("results.json", "w"), indent=1)
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ("n", "k", "silhouette", "ari_seed_median", "median_all", "rq3_share")} for k, v in R.items() if k in DS}, indent=1))
