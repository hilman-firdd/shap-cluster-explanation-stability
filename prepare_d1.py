"""Build D1a (province, 2002-2022 totals) and D1b (province-year) from the Indonesian Disaster Dataset (Wahyudi, 2024).
Usage: python -I prepare_d1.py <folder with the 33 province .xlsx files> <bps_population_sp2020_province.csv> <out_dir>

Per sheet: column 0 = disaster type, 1 = number of events, 2 died, 3 missing, 4 injured, 5 affected ("suffer"),
6 evacuated, 7 houses damaged, 8-15 damaged facilities (education, health, worship, public, office, bridge, factory, stores).
Rows "Amount"/"Bencana" are sheet totals and are used only for the consistency check.

Features (written to d1a.csv / d1b.csv):
  events_<type>       number of events per disaster type (rare types pooled into events_other)
  died, missing, injured, affected, evacuated, houses_damaged, facilities_damaged   (counts)
Event counts describe hazard occurrence and are kept as counts; human and material impacts are divided by the
2020 census population (per million). log1p and standardization are applied later by the experiment script.
"""
import glob, re, sys
import numpy as np
import pandas as pd

src, popf, out = sys.argv[1:4]

EN2BPS = {"Aceh": "Aceh", "North Sumatera": "Sumatera Utara", "West Sumatera": "Sumatera Barat", "Riau": "Riau",
          "Jambi": "Jambi", "South Sumatera": "Sumatera Selatan", "Bengkulu": "Bengkulu", "Lampung": "Lampung",
          "Kepulauan Riau": "Kepulauan Riau", "Jakarta": "DKI Jakarta", "West Java": "Jawa Barat",
          "Central Java": "Jawa Tengah", "Yogyakarta": "DI Yogyakarta", "East Java": "Jawa Timur", "Banten": "Banten",
          "Bali": "Bali", "West Nusa Tenggara": "Nusa Tenggara Barat", "East Nusa Tenggara": "Nusa Tenggara Timur",
          "West Kalimantan": "Kalimantan Barat", "Central Kalimantan": "Kalimantan Tengah",
          "South Kalimantan": "Kalimantan Selatan", "East Kalimantan": "Kalimantan Timur",
          "North Kalimantan": "Kalimantan Utara", "North Sulawesi": "Sulawesi Utara", "Central Sulawesi": "Sulawesi Tengah",
          "South Sulawesi": "Sulawesi Selatan", "Southeast Sulawesi": "Sulawesi Tenggara", "Gorontalo": "Gorontalo",
          "West Sulawesi": "Sulawesi Barat", "Maluku": "Maluku", "North Maluku": "Maluku Utara",
          "West Papua": "Papua Barat", "Papua": "Papua"}


def dtype(label):
    u = re.sub(r"^\d+\.\s*", "", str(label).strip()).upper()
    if u in ("AMOUNT", "BENCANA", "DISASTER", "(1)") or u.startswith("DISASTER STAT"):
        return None
    if "DROFOREST" in u: return "forest_fire"            # garbled label with code 107 = forest and land fire
    if "TSUNAMI" in u and "EARTHQUAKE" in u: return "earthquake_tsunami"
    if "TSUNAMI" in u: return "tsunami"
    if "EARTHQUAKE" in u: return "earthquake"
    if "FLOOD" in u and ("LAND" in u or "SLIDE" in u): return "flood_landslide"
    if "FLOOD" in u: return "flood"
    if "LANDS" in u or "SLIDE" in u: return "landslide"
    if "TIDAL" in u or "ABRA" in u: return "tidal_abrasion"
    if "TORNADO" in u: return "tornado"
    if "DROUGHT" in u or "KEKERINGAN" in u: return "drought"
    if "FOREST" in u: return "forest_fire"
    if "VULCANO" in u or "VOLCANO" in u: return "volcano"
    if "CLIMATE" in u: return "climate_change"
    raise ValueError(f"unmapped label {label!r}")


IMPACT = ["died", "missing", "injured", "affected", "evacuated", "houses_damaged"]
rows, checks = [], []
for f in sorted(glob.glob(src + "/*.xlsx"), key=lambda p: int(p.split("/")[-1].split(".")[0])):
    prov_en = re.sub(r"^\d+\.\s*|\s*Disaster Dataset\.xlsx$", "", f.split("/")[-1])
    xl = pd.ExcelFile(f)
    for sh in xl.sheet_names:
        d = pd.read_excel(f, sheet_name=sh, header=None)
        num = d.iloc[:, 1:16].apply(pd.to_numeric, errors="coerce")
        for i in range(len(d)):
            t = dtype(d.iat[i, 0]) if pd.notna(d.iat[i, 0]) else None
            if t is None or num.iloc[i].isna().all():
                continue
            v = num.iloc[i].fillna(0).to_numpy()
            rows.append({"province_en": prov_en, "sheet": sh, "type": t, "events": v[0],
                         **dict(zip(IMPACT, v[1:7])), "facilities_damaged": v[7:15].sum()})
        tot = d[d[0].astype(str).str.strip().str.upper().isin(["AMOUNT"])]
        if len(tot):
            checks.append((prov_en, sh, float(pd.to_numeric(tot.iat[0, 1], errors="coerce"))))
long = pd.DataFrame(rows)
long["province"] = long.province_en.map(EN2BPS)
assert long.province.notna().all()

# consistency: per province, sum of yearly sheets vs the "All Data" sheet (events)
yearly = long[long.sheet != "All Data"].groupby("province").events.sum()
alld = long[long.sheet == "All Data"].groupby("province").events.sum()
cons = pd.DataFrame({"all_data_sheet": alld, "sum_of_years": yearly})
cons["diff"] = cons.all_data_sheet - cons.sum_of_years
cons.to_csv(f"{out}/d1_consistency_check.csv")

pop = pd.read_csv(popf).set_index("province").population_2020
TYPES = sorted(long.type.unique())


def build(frame, keys):
    ev = frame.pivot_table(index=keys, columns="type", values="events", aggfunc="sum", fill_value=0)
    imp = frame.groupby(keys)[IMPACT + ["facilities_damaged"]].sum()
    X = ev.join(imp)
    X.columns = [f"events_{c}" if c in TYPES else c for c in X.columns]
    p = X.index.get_level_values("province").map(pop).to_numpy(dtype=float)
    for c in IMPACT + ["facilities_damaged"]:
        X[c] = X[c] / p * 1e6
    return X


# D1a from yearly sheets (2002-2022) so that D1a and D1b share one source
yr = long[long.sheet != "All Data"].copy()
yr["year"] = yr.sheet.astype(int)
d1a = build(yr, ["province"])
d1b = build(yr, ["province", "year"]).reindex(
    pd.MultiIndex.from_product([sorted(yr.province.unique()), range(2002, 2023)], names=["province", "year"]), fill_value=0)

# drop event types recorded in fewer than 3 provinces (here: climate change, 1 event in 1 province)
present = (d1a.filter(like="events_") > 0).sum()
rare = present[present < 3].index.tolist()
for X in (d1a, d1b):
    X.drop(columns=rare, inplace=True)
# after log1p, keep one feature of any pair with |r| > 0.95 (decided on D1a, applied to both)
L = np.log1p(d1a)
corr = L.corr().abs()
drop = []
for i, a in enumerate(corr.columns):
    for b in corr.columns[i + 1:]:
        if a not in drop and b not in drop and corr.loc[a, b] > 0.95:
            drop.append(b)
for X in (d1a, d1b):
    X.drop(columns=drop, inplace=True)
print("dropped for |r|>0.95:", drop)

d1a.reset_index().to_csv(f"{out}/d1a.csv", index=False)
d1b.reset_index().assign(id=lambda t: t.province + "_" + t.year.astype(str)).drop(columns=["province", "year"]) \
   .set_index("id").reset_index().to_csv(f"{out}/d1b.csv", index=False)
print("provinces:", d1a.shape[0], "| D1a features:", d1a.shape[1], "| D1b rows:", d1b.shape[0])
print("dropped rare types:", rare, present[rare].to_dict())
print("event totals all-data vs years, max abs diff:", cons["diff"].abs().max(), "| provinces with diff:", (cons["diff"] != 0).sum())
print(d1a.describe().T[["mean", "min", "max"]].round(1).to_string())
