# Literature search protocol

Search date: 8 October 2026. Used to establish the research gap (Section 2.5 of the paper).

## 1a. Structured search (OpenAlex)

Fields: title, abstract, and keywords. Years: 2017–2026. Types: article, review, preprint, and book chapter. Retracted works excluded.

```
works where title-abstract-keywords has (
    (SHAP OR "Shapley additive" OR "Shapley value*" OR TreeSHAP OR KernelSHAP
       OR "feature attribution*" OR "feature importance")
AND (clustering OR "cluster analysis" OR "k-means" OR kmeans OR "cluster label*" OR "cluster explanation*")
AND ("explanation stability" OR "stability of explanation*" OR "explanation instability"
       OR "stable explanation*" OR "explanation consistency" OR "consistency of explanation*"
       OR "explanation multiplicity" OR "explanation robustness" OR "robustness of explanation*"
       OR "attribution stability" OR "stability of feature importance" OR "feature importance stability"
       OR "ranking stability" OR "explanation variability" OR "disagreement problem" OR "Rashomon"))
and year >= (2017) and year <= (2026)
and type is (article or review or preprint or book-chapter) and retracted is (false)
```

Records returned: **28**, which includes 4 duplicate preprint versions. All 28 titles and abstracts were screened.

A broader variant used generic stability terms (stability, robustness, consistency, variability, and so on). It returned 1,232 records, which were dominated by unrelated application papers, so it was not used for screening.

**Inclusion criterion:** the study measures the stability of SHAP (or other feature-attribution) explanations of a clustering result across repeated runs or pipeline choices.

| Outcome | Records |
|---|---|
| Included | 1. Sharma, Ansarizadeh & Hassan (2026), *PULSE*, Expert Systems with Applications 333, 134168, https://doi.org/10.1016/j.eswa.2026.134168 |
| Excluded: supervised models only, no clustering | 9 (e.g., federated intrusion detection, chemistry feature importance, water quality) |
| Excluded: clustering used inside the explainer, not explained | 5 (e.g., LIME pixel clustering, DLIME, TSProto, aggregation of explanations by clustering) |
| Excluded: SHAP values clustered (SHAP-based clustering), no stability across runs | 1 |
| Excluded: unrelated applications | 8 |
| Duplicates | 4 |

## 1b. Structured search (Scopus)

Run by the first author in Scopus Advanced Search (11 records). The raw Scopus export is not redistributed here because of Scopus terms of use; all 11 records are listed below.

```
TITLE-ABS-KEY ( ( shap OR "Shapley additive" OR "Shapley value*" OR treeshap OR kernelshap OR "feature attribution*" OR "feature importance" ) AND ( clustering OR "cluster analysis" OR "k-means" OR kmeans OR "cluster label*" OR "cluster explanation*" ) AND ( "explanation stability" OR "stability of explanation*" OR "explanation instability" OR "stable explanation*" OR "explanation consistency" OR "consistency of explanation*" OR "explanation multiplicity" OR "explanation robustness" OR "robustness of explanation*" OR "attribution stability" OR "stability of feature importance" OR "feature importance stability" OR "ranking stability" OR "explanation variability" OR "disagreement problem" OR rashomon ) ) AND PUBYEAR > 2016 AND PUBYEAR < 2027 AND ( LIMIT-TO ( DOCTYPE , "ar" ) OR LIMIT-TO ( DOCTYPE , "re" ) OR LIMIT-TO ( DOCTYPE , "cp" ) OR LIMIT-TO ( DOCTYPE , "ch" ) )
```

| Scopus record | Decision |
|---|---|
| Parashar et al. (2026), TSProto (2025), Kehinde et al. (2026), Yang et al. (2026), Bragança & Souto (2026) | Already in the OpenAlex set (duplicates) |
| Zafar & Khan (2021), DLIME, *MAKE* | Journal version of a work already screened (duplicate) |
| Sun et al. (2025), credit risk ensemble | Excluded: supervised model; k-means used inside the ensemble |
| Nuñez et al. (2026), clustered federated learning | Excluded: clients are clustered; cluster explanations are not studied |
| Kaden et al. (2026), Rashomon sets, ESANN | Excluded: clusters feature importances of supervised models (reverse direction) |
| Seifu & Assefa (2025), SPATL-XLC | Excluded: supervised federated learning |
| Ducange et al. (2025), federated IDS | Excluded: supervised model |

Scopus added 5 new records and 0 eligible studies. PULSE (Sharma et al., 2026) was not among the Scopus results.

**Combined:** 28 OpenAlex + 11 Scopus records; 29 unique works after duplicates and versions were removed; 1 included.

## 2. Semantic searches (to catch other wordings)

| Tool | Query | Newly eligible |
|---|---|---|
| Consensus | stability of SHAP explanations for cluster analysis surrogate model | 0 |
| Consensus | explanation consistency of cluster explanations across repeated k-means runs | 0 |
| Consensus | surrogate classifier trained on cluster labels SHAP explanation reliability | 0 |
| Consensus | Rashomon effect in clustering explanations multiple equally good partitions | 0 |
| Consensus | k-means clustering of Indonesian provinces stability of clusters across initialization | 0 (used for Sec. 2.4) |
| OpenAlex (semantic) | stability of post-hoc SHAP explanations of k-means clusters across random seeds, surrogate classifiers and explainer settings | 0 |

These searches did turn up related work that is now cited for context: Kauffmann et al. (2024), Mitruț et al. (2024), Kuncheva & Vetrov (2006), and Fränti & Sieranoja (2019).

## 3. Indonesian provincial clustering studies (Sec. 2.4)

The Consensus query in Section 2 returned 20 studies that cluster Indonesian provinces with k-means or related methods. Titles and abstracts were screened; full texts were not checked. In all 20, k was chosen with the elbow method, the silhouette coefficient, or the Davies–Bouldin index. None of the abstracts reports agreement between partitions from different random initializations.

## Limitations

Web of Science was not queried. Screening was done by one reviewer. PULSE was assessed from its abstract only.
