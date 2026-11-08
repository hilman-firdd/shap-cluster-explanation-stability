"""Summarise OFAT / factorial runs: ARI between seeds, median tau per factor, RQ3 share, dominant factorial effect.
Usage: python summarize.py out.csv label=pairs_ofat.csv[:effects_factorial.csv] ...
"""
import sys, os
import numpy as np
import pandas as pd

rows = []
for arg in sys.argv[2:]:
    label, files = arg.split("=")
    pf, _, ef = files.partition(":")
    if not os.path.exists(pf):
        continue
    p = pd.read_csv(pf)
    core = p[p.factor != "REF_surrogate_free"]
    f1 = p[p.factor == "F1_cluster_seed"].drop_duplicates(["run_a", "run_b"])
    r = {"run": label, "ari_seed_median": f1.ari.median(), "ari_seed_share_lt1": (f1.ari < 1).mean()}
    for f, g in p.groupby("factor"):
        r["tau_" + f.split("_")[0]] = g.kendall_tau.median()
    r["top3_changed_all"] = (core.jaccard_top3 < 1).mean()
    r["rq3_share"] = ((core.cosine >= 0.95) & (core.jaccard_top3 < 1)).mean()
    if ef and os.path.exists(ef):
        e = pd.read_csv(ef)
        e = e[(e.metric == "kendall_tau") & e.term.str.startswith("d_")]
        top = e.loc[e.coef.abs().idxmax()]
        r["dominant_factorial"] = f"{top.term} ({top.coef:.3f})"
    rows.append(r)
out = pd.DataFrame(rows)
out.to_csv(sys.argv[1], index=False)
pd.set_option("display.width", 250)
print(out.round(3).to_string(index=False))
