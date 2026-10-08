"""
Explanation multiplicity of post-hoc SHAP explanations for clustering.

One-factor-at-a-time (OFAT) sweep around a baseline configuration:
  F1 cluster_seed | F2 surrogate class | F3 surrogate_seed | F4 SHAP estimator | F5 background (size, seed)
plus a surrogate-free reference (KernelSHAP on soft cluster assignment).

For every pair of runs inside one factor sweep we log, per cluster:
  cosine, L1 (normalized), Kendall tau-b, top-3/top-5 Jaccard, RBO(p=0.9), and ARI of the partitions.

Two designs:
  --mode ofat       one-factor-at-a-time sweeps (RQ1, RQ3)
  --mode factorial  full factorial for variance attribution (RQ2):
                    5 cluster seeds x 3 surrogates (dt, rf, lgbm) x 3 surrogate seeds
                    x 4 explainer settings (tree_path; tree_int with background seed 0/1/2)
                    = 180 runs per dataset. Pairwise similarities are modelled with a
                    linear mixed model with crossed random effects for both runs in a pair.
  --mode both       run both (default)
Also writes an aggregation curve: Kendall tau between consensus rankings built from two
disjoint sets of n runs, n = 1..15 (justifies how many runs to aggregate, RQ4 / Sec. 5.2).

Usage
  python shap_cluster_multiplicity.py --data wine --k 3 --reps 10
  python shap_cluster_multiplicity.py --data path/to/d1a.csv --id-col province --k 4 --log1p --reps 30
Output
  pairs_<name>.csv   (one row per pair x cluster)
  summary_<name>.csv (median + bootstrap 95% CI per factor and metric)
"""
import argparse
import itertools
import warnings
from dataclasses import dataclass, replace

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
import shap
from lightgbm import LGBMClassifier
from scipy.optimize import linear_sum_assignment
from scipy.stats import kendalltau
from sklearn.cluster import KMeans
from sklearn.datasets import load_wine
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import adjusted_rand_score, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

warnings.filterwarnings("ignore")


# ---------------------------------------------------------------- data
def load_data(path, id_col=None, log1p=False):
    if path == "wine":
        d = load_wine(as_frame=True)
        X, name = d.data, "wine"
    else:
        df = pd.read_csv(path)
        X = df.drop(columns=[id_col]) if id_col else df
        X = X.select_dtypes("number")
        name = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    if log1p:
        X = np.log1p(X.clip(lower=0))
    Xs = StandardScaler().fit_transform(X)
    return Xs, list(X.columns), name


# ---------------------------------------------------------------- config
@dataclass(frozen=True)
class Cfg:
    cluster_seed: int = 0
    surrogate: str = "rf"          # dt | rf | lgbm | lr | none
    surrogate_seed: int = 0
    estimator: str = "tree_int"    # tree_int | tree_path | kernel | linear
    bg_size: int = 50
    bg_seed: int = 0


def align_labels(ref, lab, k):
    """Hungarian matching so cluster c means the same group in every run."""
    cm = confusion_matrix(ref, lab, labels=range(k))
    r, c = linear_sum_assignment(-cm)
    mapping = {old: new for new, old in zip(r, c)}
    return np.array([mapping[l] for l in lab])


def make_surrogate(kind, seed):
    if kind == "dt":
        return DecisionTreeClassifier(max_depth=4, random_state=seed)
    if kind == "rf":
        return RandomForestClassifier(n_estimators=300, random_state=seed, n_jobs=-1)
    if kind == "lgbm":
        return LGBMClassifier(n_estimators=200, random_state=seed, verbose=-1, min_child_samples=5)
    if kind == "lr":
        return LogisticRegression(max_iter=2000)
    raise ValueError(kind)


def to_3d(sv, n, p):
    """Normalize SHAP output to shape (n, p, k)."""
    if isinstance(sv, list):
        return np.stack(sv, axis=-1)
    sv = np.asarray(sv)
    return sv[..., None] if sv.ndim == 2 else sv


N_INIT = 1  # sklearn default for k-means++ (n_init='auto'); --n-init changes it


def run(X, k, ref_labels, cfg, kernel_nsamples=200):
    n, p = X.shape
    km = KMeans(n_clusters=k, n_init=N_INIT, random_state=cfg.cluster_seed).fit(X)
    labels = align_labels(ref_labels, km.labels_, k)
    rng = np.random.default_rng(cfg.bg_seed)
    bg = X[rng.choice(n, size=min(cfg.bg_size, n), replace=False)]
    fidelity = np.nan

    if cfg.surrogate == "none":  # surrogate-free: soft assignment from centroids
        order = np.argsort([np.argmax(np.bincount(labels[km.labels_ == j], minlength=k)) for j in range(k)])
        centers = km.cluster_centers_[order]

        def soft(Z):
            d = ((Z[:, None, :] - centers[None]) ** 2).sum(-1)
            e = np.exp(-(d - d.min(1, keepdims=True)))
            return e / e.sum(1, keepdims=True)

        np.random.seed(cfg.bg_seed)  # KernelSHAP samples coalitions with the global NumPy RNG
        sv = shap.KernelExplainer(soft, bg).shap_values(X, nsamples=kernel_nsamples, silent=True)
    else:
        model = make_surrogate(cfg.surrogate, cfg.surrogate_seed).fit(X, labels)
        cv = StratifiedKFold(5, shuffle=True, random_state=0)
        fidelity = cross_val_score(make_surrogate(cfg.surrogate, cfg.surrogate_seed),
                                   X, labels, cv=cv, scoring="f1_macro").mean()
        if cfg.estimator == "tree_int":
            sv = shap.TreeExplainer(model, data=bg, feature_perturbation="interventional",
                                    model_output="probability").shap_values(X, check_additivity=False)
        elif cfg.estimator == "tree_path":
            sv = shap.TreeExplainer(model, feature_perturbation="tree_path_dependent").shap_values(X, check_additivity=False)
        elif cfg.estimator == "linear":
            sv = shap.LinearExplainer(model, bg).shap_values(X)
        elif cfg.estimator == "kernel":
            np.random.seed(cfg.bg_seed)  # KernelSHAP samples coalitions with the global NumPy RNG
            sv = shap.KernelExplainer(model.predict_proba, bg).shap_values(X, nsamples=kernel_nsamples, silent=True)
        else:
            raise ValueError(cfg.estimator)

    sv = to_3d(sv, n, p)
    if sv.shape[2] == 1 and k == 2:
        # binary explainers return one output (class 1); class-0 attributions are its negation
        sv = np.concatenate([-sv, sv], axis=2)
    # global explanation per cluster c: mean |SHAP of output c| over members of c
    imp = np.vstack([np.abs(sv[labels == c, :, c]).mean(0) if (labels == c).any() else np.full(p, np.nan)
                     for c in range(k)])
    return labels, imp, fidelity


# ---------------------------------------------------------------- metrics
def rbo(a, b, p=0.9):
    """Rank-biased overlap (Webber et al. 2010), truncated at full depth and
    normalized by (1 - p**depth) so identical rankings score exactly 1."""
    s, depth = 0.0, len(a)
    for d in range(1, depth + 1):
        s += p ** (d - 1) * len(set(a[:d]) & set(b[:d])) / d
    return (1 - p) * s / (1 - p ** depth)


def compare(u, v):
    ru, rv = list(np.argsort(-u)), list(np.argsort(-v))
    out = {
        "cosine": float(u @ v / (np.linalg.norm(u) * np.linalg.norm(v) + 1e-12)),
        "l1": float(np.abs(u / u.sum() - v / v.sum()).sum()),
        "kendall_tau": float(kendalltau(u, v, variant="b").statistic),
        "rbo": rbo(ru, rv),
    }
    for kk in (3, 5):
        a, b = set(ru[:kk]), set(rv[:kk])
        out[f"jaccard_top{kk}"] = len(a & b) / len(a | b)
    return out


# ---------------------------------------------------------------- experiment
def sweeps(base, reps):
    return {
        "F1_cluster_seed": [replace(base, cluster_seed=i) for i in range(reps)],
        "F2_surrogate": [replace(base, surrogate=m, estimator="linear" if m == "lr" else "tree_int")
                         for m in ("dt", "rf", "lgbm", "lr")],
        "F3_surrogate_seed": [replace(base, surrogate_seed=i) for i in range(reps)],
        "F4_estimator": [replace(base, estimator=e) for e in ("tree_int", "tree_path", "kernel")],
        "F5_background": [replace(base, bg_size=sz, bg_seed=i) for sz in (10, 50) for i in range(reps)],
        "REF_surrogate_free": [replace(base, surrogate="none", bg_seed=i) for i in range(max(3, reps // 3))],
    }


def factorial_grid(n_cluster_seeds=5, n_sur_seeds=3, n_bg_seeds=3):
    explainers = [("tree_path", 0)] + [("tree_int", b) for b in range(n_bg_seeds)]
    return [Cfg(cluster_seed=c, surrogate=m, surrogate_seed=s, estimator=e, bg_size=50, bg_seed=b)
            for c in range(n_cluster_seeds) for m in ("dt", "rf", "lgbm")
            for s in range(n_sur_seeds) for e, b in explainers]


def bootstrap_ci(x, b=2000, seed=0):
    x = np.asarray(x)[~np.isnan(x)]
    if len(x) < 2:
        return np.nan, np.nan
    rng = np.random.default_rng(seed)
    meds = np.median(rng.choice(x, size=(b, len(x))), axis=1)
    return np.percentile(meds, 2.5), np.percentile(meds, 97.5)


def pair_rows(results, k, name, tag):
    rows = []
    for (ia, (c1, l1, i1, f1)), (ib, (c2, l2, i2, f2)) in itertools.combinations(enumerate(results), 2):
        ari = adjusted_rand_score(l1, l2)
        for c in range(k):
            if np.isnan(i1[c]).any() or np.isnan(i2[c]).any():
                continue
            rows.append({"dataset": name, "factor": tag, "cluster": c, "run_a": ia, "run_b": ib, "ari": ari,
                         "fidelity_a": f1, "fidelity_b": f2, "cfg_a": str(c1), "cfg_b": str(c2),
                         # which factors differ between the two runs (factorial analysis)
                         "d_cluster_seed": int(c1.cluster_seed != c2.cluster_seed),
                         "d_surrogate": int(c1.surrogate != c2.surrogate),
                         "d_surrogate_seed": int(c1.surrogate_seed != c2.surrogate_seed),
                         "d_estimator": int(c1.estimator != c2.estimator),
                         "d_background": int(c1.estimator == c2.estimator == "tree_int" and c1.bg_seed != c2.bg_seed),
                         **compare(i1[c], i2[c])})
    return rows


def aggregation_curve(results, k, n_max=15, draws=200, seed=0):
    """Tau between consensus rankings from two disjoint random sets of n runs."""
    rng = np.random.default_rng(seed)
    imps = np.stack([r[2] for r in results])  # runs x k x p
    out = []
    for n in range(1, min(n_max, len(results) // 2) + 1):
        for c in range(k):
            taus = []
            for _ in range(draws):
                idx = rng.permutation(len(results))
                a, b = imps[idx[:n], c].mean(0), imps[idx[n:2 * n], c].mean(0)
                taus.append(kendalltau(a, b, variant="b").statistic)
            out.append({"n_runs": n, "cluster": c, "median_tau": np.nanmedian(taus),
                        "p05_tau": np.nanpercentile(taus, 5)})
    return pd.DataFrame(out)


def fit_mixed(pairs, metric, max_pairs, seed=0):
    """metric ~ factor-difference indicators + cluster, crossed random intercepts for run_a and run_b."""
    d = pairs.dropna(subset=[metric])
    if len(d) > max_pairs:
        d = d.sample(max_pairs, random_state=seed)
    d = d.assign(one=1)
    fx = f"{metric} ~ d_cluster_seed + d_surrogate + d_surrogate_seed + d_estimator + d_background + C(cluster)"
    try:
        m = smf.mixedlm(fx, d, groups="one", re_formula="0",
                        vc_formula={"run_a": "0 + C(run_a)", "run_b": "0 + C(run_b)"}).fit(reml=True)
        ci = m.conf_int()
        rows = [{"metric": metric, "term": t, "coef": m.params[t], "ci_low": ci.loc[t, 0], "ci_high": ci.loc[t, 1],
                 "p_value": m.pvalues[t], "model": "MixedLM crossed RE", "n_pairs": len(d)}
                for t in m.params.index if t.startswith("d_")]
    except Exception as e:  # fallback keeps the pipeline running; report it
        m = smf.ols(fx, d).fit(cov_type="cluster", cov_kwds={"groups": d["run_a"]})
        ci = m.conf_int()
        rows = [{"metric": metric, "term": t, "coef": m.params[t], "ci_low": ci.loc[t, 0], "ci_high": ci.loc[t, 1],
                 "p_value": m.pvalues[t], "model": f"OLS cluster-robust (MixedLM failed: {e})", "n_pairs": len(d)}
                for t in m.params.index if t.startswith("d_")]
    return rows


def summarize(pairs):
    metrics = ["cosine", "l1", "kendall_tau", "jaccard_top3", "jaccard_top5", "rbo", "ari"]
    out = []
    for factor, g in pairs.groupby("factor"):
        for m in metrics:
            lo, hi = bootstrap_ci(g[m].values)
            out.append({"factor": factor, "metric": m, "median": g[m].median(), "ci_low": lo, "ci_high": hi,
                        "n_pairs": len(g)})
    return pd.DataFrame(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="wine")
    ap.add_argument("--id-col", default=None)
    ap.add_argument("--k", type=int, required=True)
    ap.add_argument("--reps", type=int, default=10)
    ap.add_argument("--log1p", action="store_true")
    ap.add_argument("--kernel-nsamples", type=int, default=200)
    ap.add_argument("--mode", choices=["ofat", "factorial", "both"], default="both")
    ap.add_argument("--max-pairs-model", type=int, default=6000)
    ap.add_argument("--cluster-seeds", type=int, default=5, help="factorial: number of clustering seeds")
    ap.add_argument("--sur-seeds", type=int, default=3, help="factorial: number of surrogate seeds")
    ap.add_argument("--bg-seeds", type=int, default=3, help="factorial: background seeds for interventional TreeSHAP")
    ap.add_argument("--n-init", type=int, default=1, help="k-means restarts per clustering seed")
    ap.add_argument("--tag", default="", help="suffix for output file names")
    a = ap.parse_args()

    X, feats, name = load_data(a.data, a.id_col, a.log1p)
    global N_INIT
    N_INIT = a.n_init
    name = name + a.tag
    ref = KMeans(n_clusters=a.k, n_init=50, random_state=12345).fit(X).labels_

    if a.mode in ("ofat", "both"):
        rows = []
        for factor, cfgs in sweeps(Cfg(), a.reps).items():
            results = [run(X, a.k, ref, cfg, a.kernel_nsamples) for cfg in cfgs]
            results = [(cfg, *r) for cfg, r in zip(cfgs, results)]
            rows += pair_rows(results, a.k, name, factor)
            print(f"[OFAT] {factor}: {len(results)} runs")
        pairs = pd.DataFrame(rows)
        pairs.to_csv(f"pairs_ofat_{name}.csv", index=False)
        summ = summarize(pairs)
        summ.to_csv(f"summary_ofat_{name}.csv", index=False)
        print(summ.pivot(index="factor", columns="metric", values="median").round(3).to_string())
        rq3 = ((pairs.cosine >= 0.95) & (pairs.jaccard_top3 < 1)).mean()
        print(f"RQ3 share of pairs with cosine>=0.95 but top-3 changed: {rq3:.3f}")

    if a.mode in ("factorial", "both"):
        grid = factorial_grid(a.cluster_seeds, a.sur_seeds, a.bg_seeds)
        results = [(cfg, *run(X, a.k, ref, cfg, a.kernel_nsamples)) for cfg in grid]
        print(f"[FACTORIAL] {len(results)} runs")
        # per-run importance vectors (for aggregation, RQ4 and reporting)
        imp_rows = [{"run": r, "cfg": str(cfg), "surrogate": cfg.surrogate, "cluster_seed": cfg.cluster_seed,
                     "fidelity": fid, "ari_to_ref": adjusted_rand_score(ref, lab), "cluster": c,
                     **dict(zip(feats, imp[c]))}
                    for r, (cfg, lab, imp, fid) in enumerate(results) for c in range(a.k)]
        pd.DataFrame(imp_rows).to_csv(f"runs_importance_{name}.csv", index=False)
        pd.DataFrame({"ref_label": ref}).to_csv(f"ref_partition_{name}.csv", index=False)
        pairs = pd.DataFrame(pair_rows(results, a.k, name, "factorial"))
        pairs.to_csv(f"pairs_factorial_{name}.csv", index=False)
        eff = pd.DataFrame(sum((fit_mixed(pairs, m, a.max_pairs_model) for m in ("kendall_tau", "jaccard_top3")), []))
        eff.to_csv(f"effects_factorial_{name}.csv", index=False)
        print(eff[["metric", "term", "coef", "ci_low", "ci_high", "p_value", "model"]].round(4).to_string(index=False))
        curve = aggregation_curve(results, a.k)
        curve.to_csv(f"aggregation_curve_{name}.csv", index=False)
        print(curve.groupby("n_runs")[["median_tau", "p05_tau"]].mean().round(3).to_string())


if __name__ == "__main__":
    main()
