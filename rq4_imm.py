"""RQ4: agreement between aggregated post-hoc SHAP explanations and an IMM threshold tree (Dasgupta et al., 2020).
Usage: python rq4_imm.py <data: wine | csv> <k> [--id-col ID] [--log1p]
Needs ref_partition_<name>.csv and runs_importance_<name>.csv from the factorial run.

IMM: start from the reference k-means centers; at each node pick the axis-aligned cut that separates at least two
centers and misassigns the fewest points (points cut away from their own center are dropped, as in IMM).
Each leaf holds one center. The explanation of cluster c = features used on the path to its leaf.
Price of explainability = k-means cost of the tree partition (each point to its leaf's center) / k-means cost.
"""
import argparse
import numpy as np
import pandas as pd
import shap_cluster_multiplicity as m


def imm(X, centers, labels):
    paths = {}

    def grow(idx, cids, path):
        if len(cids) == 1:
            paths[cids[0]] = path
            return {"leaf": cids[0]}
        best = None
        for f in range(X.shape[1]):
            cv = centers[cids, f]
            lo, hi = cv.min(), cv.max()
            cand = np.unique(np.concatenate([X[idx, f], cv]))
            cand = cand[(cand >= lo) & (cand < hi)]
            if not len(cand):
                continue
            own = centers[labels[idx], f]
            mist = ((X[idx, f][:, None] <= cand) != (own[:, None] <= cand)).sum(0)
            j = int(np.argmin(mist))
            if best is None or mist[j] < best[0]:
                best = (mist[j], f, cand[j])
        _, f, t = best
        left_c = [c for c in cids if centers[c, f] <= t]
        right_c = [c for c in cids if centers[c, f] > t]
        own_left = centers[labels[idx], f] <= t
        go_left = X[idx, f] <= t
        keep = own_left == go_left
        li, ri = idx[keep & go_left], idx[keep & ~go_left]
        return {"f": f, "t": t, "L": grow(li, left_c, path + [f]), "R": grow(ri, right_c, path + [f])}

    tree = grow(np.arange(len(X)), list(range(len(centers))), [])

    def assign(x, node):
        while "leaf" not in node:
            node = node["L"] if x[node["f"]] <= node["t"] else node["R"]
        return node["leaf"]

    tree_labels = np.array([assign(x, tree) for x in X])
    return tree, paths, tree_labels


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data"); ap.add_argument("k", type=int)
    ap.add_argument("--id-col"); ap.add_argument("--log1p", action="store_true"); ap.add_argument("--tag", default="")
    a = ap.parse_args()
    X, feats, name = m.load_data(a.data, a.id_col, a.log1p)
    name = name + a.tag
    ref = pd.read_csv(f"ref_partition_{name}.csv").ref_label.to_numpy()
    centers = np.vstack([X[ref == c].mean(0) for c in range(a.k)])
    tree, paths, tl = imm(X, centers, ref)
    cost_km = ((X - centers[ref]) ** 2).sum()
    cost_tree = ((X - centers[tl]) ** 2).sum()
    agree = (tl == ref).mean()

    runs = pd.read_csv(f"runs_importance_{name}.csv")
    rows = []
    for c in range(a.k):
        path_feats = list(dict.fromkeys(feats[f] for f in paths[c]))
        kk = len(path_feats)
        for scope, sub in [("all factorial runs", runs), ("runs reproducing the reference partition (ARI >= 0.9)", runs[runs.ari_to_ref >= 0.9])]:
            if sub.empty:
                continue
            agg = sub[sub.cluster == c][feats].mean().sort_values(ascending=False)
            top = list(agg.index[:kk]); top3 = list(agg.index[:3])
            rows.append({"dataset": name, "cluster": c, "scope": scope, "n_runs": sub.run.nunique(),
                         "imm_path_features": "; ".join(path_feats), "shap_top_k": "; ".join(top),
                         "jaccard_topk_vs_path": len(set(top) & set(path_feats)) / len(set(top) | set(path_feats)),
                         "path_features_in_shap_top3": len(set(top3) & set(path_feats)) / kk,
                         "shap_top3": "; ".join(top3)})
        # per-run agreement distribution (how often a single run's top-k matches the tree)
        per = []
        for r, g in runs[(runs.cluster == c) & (runs.ari_to_ref >= 0.9)].groupby("run"):
            t = list(g[feats].iloc[0].sort_values(ascending=False).index[:kk])
            per.append(len(set(t) & set(path_feats)) / len(set(t) | set(path_feats)))
        if per:
            rows[-1]["single_run_jaccard_median"] = float(np.median(per))
            rows[-1]["single_run_jaccard_p05"] = float(np.percentile(per, 5))
    out = pd.DataFrame(rows)
    out["price_of_explainability"] = cost_tree / cost_km
    out["tree_ref_agreement"] = agree
    out.to_csv(f"rq4_{name}.csv", index=False)
    print(f"{name}: price of explainability {cost_tree / cost_km:.3f}; tree vs k-means label agreement {agree:.3f}")
    print(out.drop(columns=["dataset"]).round(3).to_string(index=False))


if __name__ == "__main__":
    main()
