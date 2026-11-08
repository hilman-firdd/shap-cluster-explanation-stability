"""P2-9: re-check the bootstrap CI of the median ARI between clustering seeds.
Naive CI (as in compute_results.py): resample pair x cluster rows -> each run pair counted k times, pairs treated as independent.
Seed-level CI: resample the n clustering seeds with replacement, take the median ARI over distinct-seed pairs.
Usage: python ari_ci.py <results_dir> [B]
"""
import sys
import numpy as np
import pandas as pd

d = sys.argv[1]
B = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
rng = np.random.default_rng(0)
out = []
for ds in ["d1a", "d1b", "wine"]:
    p = pd.read_csv(f"{d}/pairs_ofat_{ds}.csv", usecols=["factor", "run_a", "run_b", "ari"])
    f1 = p[p.factor == "F1_cluster_seed"]
    u = f1.drop_duplicates(["run_a", "run_b"])
    n = int(max(u.run_a.max(), u.run_b.max())) + 1
    A = np.full((n, n), np.nan)
    A[u.run_a, u.run_b] = u.ari; A[u.run_b, u.run_a] = u.ari
    med = float(np.nanmedian(A[np.triu_indices(n, 1)]))
    # naive (existing) CI
    x = f1.ari.values
    naive = np.percentile(np.median(rng.choice(x, size=(2000, len(x))), axis=1), [2.5, 97.5])
    # seed-level bootstrap
    meds = np.empty(B)
    iu = np.triu_indices(n, 1)
    for b in range(B):
        s = rng.integers(0, n, n)
        sub = A[np.ix_(s, s)]
        same = s[:, None] == s[None, :]
        v = sub[np.triu_indices(n, 1)]
        v = v[~same[np.triu_indices(n, 1)]]
        meds[b] = np.median(v)
    lo, hi = np.percentile(meds, [2.5, 97.5])
    out.append({"dataset": ds, "n_seeds": n, "n_pairs": len(u), "n_rows_naive": len(f1), "median_ari": med,
                "naive_lo": naive[0], "naive_hi": naive[1], "seed_lo": lo, "seed_hi": hi})
r = pd.DataFrame(out)
print(r.round(4).to_string(index=False))
r.to_csv(f"{d}/ari_ci_check.csv" if len(sys.argv) > 3 else "ari_ci_check.csv", index=False)
