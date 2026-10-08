"""Manuscript figures across datasets (ADCAIJ: 300 dpi TIFF, Arial-metric font, one y-axis per panel).
Usage: python make_figures_all.py d1a d1b wine
Fig1: Kendall's tau between runs per factor, one panel per dataset (OFAT).
Fig2: aggregation curve (median tau between disjoint consensus rankings vs n), one line per dataset.
Fig3: cosine vs Kendall's tau for all OFAT pairs, one panel per dataset.
"""
import sys
import logging
logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

names = sys.argv[1:]
TITLE = {"d1a": "D1a: provinces (n = 33)", "d1b": "D1b: province-years (n = 693)", "wine": "B2: Wine (n = 178)"}
plt.rcParams.update({"font.family": ["Arial", "Liberation Sans"], "font.size": 9, "axes.spines.top": False,
                     "axes.spines.right": False, "axes.edgecolor": "#555555", "axes.linewidth": 0.8})
MUTED, ACCENT, GRID = "#8a8a8a", "#2a6fb0", "#e3e3e3"
LINE = {"d1a": "#2a6fb0", "d1b": "#c4622d", "wine": "#5b5b5b"}
MARK = {"d1a": "o", "d1b": "s", "wine": "^"}
LABELS = {"F1_cluster_seed": "Clust.\nseed", "F2_surrogate": "Surr.\nclass", "F3_surrogate_seed": "Surr.\nseed",
          "F4_estimator": "SHAP\nestim.", "F5_background": "Back-\nground", "REF_surrogate_free": "No\nsurr."}


def save(fig, stem):
    fig.savefig(f"{stem}.png", dpi=300, bbox_inches="tight")
    fig.savefig(f"{stem}.tiff", dpi=300, bbox_inches="tight", pil_kwargs={"compression": "tiff_lzw"})
    plt.close(fig)


pairs = {n: pd.read_csv(f"pairs_ofat_{n}.csv") for n in names}

fig, axes = plt.subplots(1, len(names), figsize=(2.6 * len(names), 2.9), sharey=True)
for ax, n in zip(axes, names):
    p = pairs[n]
    order = [f for f in LABELS if f in p.factor.unique()]
    data = [p.loc[p.factor == f, "kendall_tau"].dropna() for f in order]
    ax.boxplot(data, widths=0.55, patch_artist=True,
               medianprops=dict(color=ACCENT, linewidth=1.6), boxprops=dict(facecolor="#f2f2f2", edgecolor=MUTED),
               whiskerprops=dict(color=MUTED), capprops=dict(color=MUTED),
               flierprops=dict(marker="o", markersize=2, markerfacecolor=MUTED, markeredgecolor="none", alpha=0.5))
    ax.set_xticks(range(1, len(order) + 1), [LABELS[f] for f in order], fontsize=7.5)
    ax.set_title(TITLE[n], fontsize=9)
    ax.set_ylim(-1.05, 1.05)
    ax.yaxis.grid(True, color=GRID, linewidth=0.6); ax.set_axisbelow(True)
axes[0].set_ylabel("Kendall's τ between runs")
save(fig, "Fig1")

fig, ax = plt.subplots(figsize=(4.4, 2.9))
for n in names:
    c = pd.read_csv(f"aggregation_curve_{n}.csv").groupby("n_runs").median_tau.mean()
    ax.plot(c.index, c.values, color=LINE[n], marker=MARK[n], markersize=3.5, linewidth=2, label=TITLE[n])
    ax.text(c.index[-1] + 0.6, c.values[-1], n.upper() if n != "wine" else "B2", color=LINE[n], va="center", fontsize=8)
ax.set_xlabel("Runs aggregated per consensus ranking (n)")
ax.set_ylabel("Median Kendall's τ between\ndisjoint consensus rankings")
ax.set_ylim(0, 1.02); ax.set_xlim(0.5, 16.5)
ax.yaxis.grid(True, color=GRID, linewidth=0.6); ax.set_axisbelow(True)
ax.legend(frameon=False, fontsize=7.5, loc="lower right")
save(fig, "Fig2")

fig, axes = plt.subplots(1, len(names), figsize=(2.6 * len(names), 2.8), sharey=True)
for ax, n in zip(axes, names):
    p = pairs[n]; p = p[p.factor != "REF_surrogate_free"]
    ch = p.jaccard_top3 < 1
    ax.axvspan(0.95, 1.005, color="#eef3f9", zorder=0)
    ax.scatter(p.loc[~ch, "cosine"], p.loc[~ch, "kendall_tau"], s=6, color=MUTED, alpha=0.45, linewidths=0, label="Top-3 unchanged")
    ax.scatter(p.loc[ch, "cosine"], p.loc[ch, "kendall_tau"], s=7, color=ACCENT, alpha=0.6, linewidths=0, label="Top-3 changed")
    ax.set_title(TITLE[n], fontsize=9); ax.set_xlabel("Cosine similarity")
    ax.set_ylim(-1.05, 1.05)
axes[0].set_ylabel("Kendall's τ")
axes[0].legend(frameon=False, fontsize=7.5, loc="lower left", markerscale=2)
save(fig, "Fig3")
print("written Fig1-3")
