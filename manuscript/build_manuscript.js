// Builds the ADCAIJ-format manuscript (.docx) and the Highlights file. Every number is read from results.json.
// Usage: node build_manuscript.js <outdir>
const fs = require('fs');
const d = require('docx');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, LevelFormat, BorderStyle,
  WidthType, ShadingType, Footer, PageNumber, TabStopType, ExternalHyperlink, ImageRun,
  Math: OMath, MathRun, MathFraction, MathSum, MathSubScript, MathSuperScript } = d;
const OUT = process.argv[2] || '.';
const R = JSON.parse(fs.readFileSync('results.json', 'utf8'));

// ---------- number helpers ----------
const f3 = x => (x < 0 ? '−' : '') + Math.abs(x).toFixed(3);
const f2 = x => (x < 0 ? '−' : '') + Math.abs(x).toFixed(2);
const pct = x => (100 * x).toFixed(1) + '%';
const eff = (ds, metric, term) => R[ds].effects.find(e => e.metric === metric && e.term === term);
const effTxt = (ds, metric, term) => { const e = eff(ds, metric, term); return `${f3(e.coef)} [${f3(e.ci_low)}, ${f3(e.ci_high)}]`; };
const TERMS = [['d_cluster_seed', 'Clustering seed'], ['d_surrogate', 'Surrogate class'], ['d_surrogate_seed', 'Surrogate seed'],
  ['d_estimator', 'SHAP estimator'], ['d_background', 'Background sample']];
const dominant = ds => { const e = R[ds].effects.filter(x => x.metric === 'kendall_tau'); return e.reduce((a, b) => (b.coef < a.coef ? b : a)); };
const TERMNAME = Object.fromEntries(TERMS);
const curve = (ds, n) => R[ds].curve[String(n)];
const DSN = { d1a: 'D1a', d1b: 'D1b', wine: 'B2' };
const ALL = ['d1a', 'd1b', 'wine'];

// ---------- styling ----------
const SERIF = 'Times New Roman', SANS = 'Arial', BLUE = '1F5FA8', SZ = 24, W = 9026;
function runs(s, base = {}) {
  const out = []; const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[(?:TBD|verify|Penulis)[^\]]*\])/g; let last = 0, m;
  const push = (t, o = {}) => t && out.push(new TextRun({ text: t, font: SERIF, size: SZ, ...base, ...o }));
  while ((m = re.exec(s))) {
    push(s.slice(last, m.index)); const t = m[0];
    if (t.startsWith('**')) push(t.slice(2, -2), { bold: true });
    else if (t.startsWith('*')) push(t.slice(1, -1), { italics: !base.italics });
    else push(t, { highlight: 'yellow' });
    last = m.index + t.length;
  }
  push(s.slice(last)); return out;
}
const body = []; let first = true;
const H1 = t => { body.push(new Paragraph({ spacing: { before: 360, after: 160 }, keepNext: true, children: [new TextRun({ text: t, font: SERIF, size: 32 })] })); first = true; };
const H2 = t => { body.push(new Paragraph({ spacing: { before: 240, after: 120 }, keepNext: true, children: [new TextRun({ text: t, font: SERIF, size: 27 })] })); first = true; };
const P = s => { body.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, indent: first ? undefined : { firstLine: 425 }, children: runs(s) })); first = false; };
const OL = items => { items.forEach(s => body.push(new Paragraph({ numbering: { reference: 'rq', level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, children: runs(s) }))); first = false; };
const NOTE = s => body.push(new Paragraph({ spacing: { after: 160 }, children: runs(s, { size: 18 }) }));
const hline = { style: BorderStyle.SINGLE, size: 6, color: '000000' }, none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
function TABLE(n, caption, widths, header, rows, note = 'Source: Own elaboration.') {
  const sc = W / widths.reduce((a, b) => a + b, 0); widths = widths.map(w => Math.round(w * sc)); widths[widths.length - 1] += W - widths.reduce((a, b) => a + b, 0);
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 }, keepNext: true, children: [new TextRun({ text: `Table ${n}. ${caption}`, italics: true, font: SERIF, size: SZ })] }));
  const mk = (cells, head, lastRow) => new TableRow({ tableHeader: head, cantSplit: true, children: cells.map((c, i) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, borders: { top: head ? hline : none, left: none, bottom: (head || lastRow) ? hline : none, right: none },
    shading: head ? { fill: 'DCE6F2', type: ShadingType.CLEAR } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER, children: runs(String(c), { size: 20, bold: head }) })] })) });
  body.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths, rows: [mk(header, true, false), ...rows.map((r, i) => mk(r, false, i === rows.length - 1))] }));
  NOTE(note); first = true;
}
function FIGURE(n, file, width, _unused, caption) {
  const img = fs.readFileSync(file); const pw = img.readUInt32BE(16), ph = img.readUInt32BE(20); const height = Math.round(width * ph / pw);
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 60 }, keepNext: true, children: [new ImageRun({ type: 'png', data: img, transformation: { width, height } })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: `Figure ${n}. ${caption}`, italics: true, font: SERIF, size: SZ })] }));
  NOTE('Source: Own elaboration.'); first = true;
}
function EQ_RBO() {
  const r = t => new MathRun(t);
  const eq = new OMath({ children: [r('RBO(S,T,p)='),
    new MathFraction({ numerator: [r('1−p')], denominator: [r('1−'), new MathSuperScript({ children: [r('p')], superScript: [r('D')] })] }),
    new MathSum({ children: [new MathSuperScript({ children: [r('p')], superScript: [r('d−1')] }),
      new MathFraction({ numerator: [r('|'), new MathSubScript({ children: [r('S')], subScript: [r('1:d')] }), r('∩'), new MathSubScript({ children: [r('T')], subScript: [r('1:d')] }), r('|')], denominator: [r('d')] })],
      subScript: [r('d=1')], superScript: [r('D')] })] });
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, tabStops: [{ type: TabStopType.RIGHT, position: W }], children: [eq, new TextRun({ text: '\t(1)', font: SERIF, size: SZ })] }));
  first = true;
}

// ---------- derived statements ----------
const a = R.d1a, b = R.d1b, w = R.wine, a10 = R.d1a_ninit10;
const domA = dominant('d1a'), domB = dominant('d1b'), domW = dominant('wine');
const rq3min = Math.min(...ALL.map(x => R[x].rq3_share)), rq3max = Math.max(...ALL.map(x => R[x].rq3_share));
const q4a = R.rq4.d1a_ninit10, q4w = R.rq4.wine;
const fids = ds => Object.values(R[ds].fidelity);
const minFid = ds => Math.min(...fids(ds)).toFixed(2), maxFid = ds => Math.max(...fids(ds)).toFixed(2);
const D1B_SENTENCE = b.ari_seed_median < 0.9
  ? `D1b, with 21 times more observations than D1a, produced partitions that still varied with the seed (median ARI ${f3(b.ari_seed_median)}), and the clustering seed remained its largest factor (Δτ = ${f3(eff('d1b', 'kendall_tau', 'd_cluster_seed').coef)}). A larger n reduced the problem but did not remove it; with weak cluster structure (silhouette ${b.silhouette.toFixed(3)}), the partition remains the main source of multiplicity.`
  : `D1b, with 21 times more observations than D1a, produced stable partitions (median ARI ${f3(b.ari_seed_median)}), so a larger n reduced partition-driven multiplicity even though cluster structure remained weak (silhouette ${b.silhouette.toFixed(3)}).`;
const pretty = s => s.replace(/^events_/, '').replace(/_/g, ' ').replace('od280/od315 of diluted wines', 'OD280/OD315');

const TITLE = 'How Stable Are Cluster Explanations? Assessing SHAP Explanation Multiplicity in Post-hoc Interpretation of Regional Clustering';
const KEYWORDS = ['explainable clustering', 'SHAP', 'explanation stability', 'explanation multiplicity', 'k-means', 'regional typology', 'disaster data', 'Indonesia'];
const ABSTRACT = `Regional typologies built by clustering are increasingly explained post hoc by training a surrogate classifier on cluster labels and reporting SHapley Additive exPlanations (SHAP). Whether such explanations are stable when only analytical choices change has not been tested. This study quantifies explanation multiplicity in post-hoc SHAP interpretation of k-means clustering and attributes it to pipeline factors. We used Indonesian disaster records for ${a.n} provinces (2002–2022) at two levels, province (D1a, n = ${a.n}) and province-year (D1b, n = ${b.n}), and the Wine benchmark (B2, n = ${w.n}). A one-factor-at-a-time design and a 180-run factorial design varied the clustering seed, the surrogate class and seed, the SHAP estimator, and the background sample. Stability was measured with magnitude-based metrics (cosine) and rank-based metrics (Kendall’s τ, top-3 Jaccard, rank-biased overlap), and factor effects were estimated with a linear mixed-effects model. In the province data, partitions from different single-start k-means runs barely agreed (median adjusted Rand index ${f3(a.ari_seed_median)}), and in both Indonesian datasets the clustering seed was the dominant source of explanation variation (Δτ = ${f3(eff('d1a', 'kendall_tau', 'd_cluster_seed').coef)} for provinces and ${f3(eff('d1b', 'kendall_tau', 'd_cluster_seed').coef)} for province-years). In the benchmark, the surrogate class dominated (Δτ = ${f3(eff('wine', 'kendall_tau', 'd_surrogate').coef)}). Between ${pct(rq3min)} and ${pct(rq3max)} of run pairs looked stable by cosine similarity (≥ 0.95) but changed their top-3 features. Ten k-means restarts reduced the seed effect in the province data to ${f3(eff('d1a_ninit10', 'kendall_tau', 'd_cluster_seed').coef)}. A single SHAP run is therefore not a reliable basis for describing what drives a regional cluster; we recommend reporting partition stability, multiple restarts, explanations aggregated over runs, and rank-based stability.`;

// ---------- 1. Introduction ----------
H1('1. Introduction');
P('Cluster analysis is a core data mining task for building typologies of regions, customers, or patients. In Indonesia, regional clustering informs disaster mitigation and development planning, and the resulting groups can feed directly into budget and policy decisions. A cluster label alone does not tell a planner why a province was placed in a high-risk group, so analysts increasingly attach explanations to clusters.');
P('The most common recipe is post hoc: run k-means, train a classifier to predict the cluster labels, and report SHAP attributions of that surrogate (Louhichi et al., 2023; Pongvijan & Trakunphutthirak, 2026). This recipe inherits two sources of instability. The partition itself can change with initialization, and SHAP values depend on the surrogate, the estimator, and the background sample. Hwang et al. (2026) showed that SHAP explanations of a fixed supervised model can differ materially across repeated runs, and that magnitude-based distances can look stable while rank-based measures reveal churn in the top features.');
P('Interpretable clustering is still an early research area (Hu et al., 2026; Dewoprabowo et al., 2025). Our searches of Consensus and SciSpace, together with full-text reading of the closest studies, found no study that measures how stable post-hoc SHAP explanations of clusters are, or which pipeline choices drive their variation. [TBD: confirm with a structured Scopus and Web of Science search and report database, years, and search string.] This gap matters most for small-sample regional data, such as 33 provinces, where both partitions and surrogates are fragile.');
P('We address four research questions:');
OL(['**RQ1.** How large is explanation multiplicity in post-hoc SHAP interpretations of clustering when the data are held fixed?',
  '**RQ2.** How much of that multiplicity is attributable to the clustering seed, the surrogate model, the SHAP estimator, and the background sample?',
  '**RQ3.** Do magnitude-based and rank-based stability metrics lead to different conclusions about the same explanations?',
  '**RQ4.** How well do aggregated post-hoc explanations agree with an intrinsically interpretable threshold-tree clustering?']);
P('Our contributions are: (i) a factorial protocol for measuring explanation multiplicity in clustering that includes sources specific to clustering pipelines, namely partition variability, label alignment, and the surrogate layer; (ii) a mixed-effects analysis that ranks pipeline factors by their effect on explanation stability; (iii) evidence on Indonesian disaster data at two aggregation levels and on a public benchmark; and (iv) a reporting checklist for practitioners who explain clusters with SHAP.');

// ---------- 2. Related work ----------
H1('2. Related Work');
H2('2.1. Interpretable and Explainable Clustering');
P('Hu et al. (2026) organize interpretable clustering by stage: pre-clustering (feature selection), in-clustering (models such as decision trees, rules, and prototypes), and post-clustering (approximating an existing partition with an interpretable model). In-clustering methods such as Iterative Mistake Minimization (IMM) and ExKMC build threshold trees whose leaves are clusters (Dasgupta et al., 2020; Frost et al., 2020). The cost of such trees relative to unconstrained k-means, the price of explainability, has known theoretical bounds (Gupta et al., 2023). Shapley values can also be defined directly on the k-means objective, without a surrogate (Fawley & de Amorim, 2026). Dewoprabowo et al. (2025) group explainable clustering methods into five categories; the fifth, supervised explainers that train a classifier on cluster labels and explain it with tools such as Tree SHAP, is the setting of this study. That review names the approximation error of the surrogate as a weakness but does not discuss the stability of the resulting explanations. Atzmueller et al. (2024) frame explainability as a shared concern of machine learning and data mining. We use IMM threshold trees as an intrinsic reference.');
H2('2.2. Post-hoc Explanation of Clusters with SHAP');
P('SHAP attributes a model output to features using Shapley values (Lundberg & Lee, 2017). For clustering, the usual practice is to fit a surrogate classifier to cluster labels and explain it (Louhichi et al., 2023; Pongvijan & Trakunphutthirak, 2026). The same recipe is used for clinical phenotyping (Zawadzki & Parvaneh, 2024; Shu et al., 2025; Yu & Chiu, 2026). Shu et al. (2025) report SHAP drivers for k-means clusters with a silhouette coefficient of 0.05 from a single run, and their global ranking (hemoglobin first) differs from their per-cluster rankings (age and body mass index first). Pongvijan and Trakunphutthirak (2026) treat surrogate accuracy above 98% as confirming the reliability of SHAP explanations, yet high fidelity to the cluster labels does not imply that the attribution ranking is stable. These studies report a single SHAP run and do not test whether the reported ranking would survive a different seed or estimator.');
H2('2.3. Stability, Disagreement, and Multiplicity of Explanations');
P('Post-hoc explainers can be manipulated and can disagree with each other (Slack et al., 2020; Krishna et al., 2022). SHAP and LIME outputs are sensitive to the choice of model and to feature collinearity (Salih et al., 2024). For tree ensembles, global importance rankings shift when models are retrained with different random seeds or hyperparameters (Yasodhara et al., 2021), SHAP rankings of deep architectures change with weight initialization (Claborne et al., 2026), and equally accurate models can yield divergent attributions, the Rashomon effect (Müller et al., 2023). Two pipeline choices matter directly for our design: SHAP rankings fluctuate with the random background sample, with the middle ranks least reliable (Yuan et al., 2022), and path-dependent TreeSHAP can rank features differently for two trees that compute the same function, whereas interventional (marginal) values coincide (Filom et al., 2024). We therefore treat the background sample and the SHAP estimator as separate factors.');
P('Earlier work on feature-selection stability offers well-founded stability measures (Nogueira et al., 2017), and rank-biased overlap has been proposed for comparing feature-importance rankings (Sarica et al., 2022). Most applied XAI studies still evaluate explanations anecdotally rather than with quantitative metrics (Nauta et al., 2023; Saarela & Podgorelec, 2024). Velmurugan et al. (2020) proposed functionally grounded stability and fidelity metrics for predictive process monitoring, and Hwang et al. (2026) named explanation multiplicity and showed that rank-based metrics expose instability hidden by magnitude-based ones. Rule mining has been used to aggregate local explanations into stable rules (Alkhatib et al., 2023). None of these studies targets clustering.');
H2('2.4. Regional Clustering in Indonesia');
P('Regional clustering is a common applied task in Indonesia. Provinces have been grouped by poverty and economic indicators with k-means or k-medoids (Erda et al., 2023; Hafid et al., 2025; Wahyuni et al., 2025), by multidimensional poverty after principal component analysis (Salma & Zilrahmi, 2025), and by disaster intensity (Wibowo et al., 2024); district-level studies follow the same design (Tacharri et al., 2025). Post-hoc SHAP explanations of k-means clusters have also appeared for Indonesian demographic data, reported from a single run (Syamsiah et al., 2025). These studies choose k with the elbow or silhouette method and explain clusters through centroid tables, verbal profiles, or one SHAP run. Judging from the studies retrieved, none reports whether the partition or its interpretation changes across random initializations, although most work with 34–38 provinces, the small-n setting in which both are least stable. [TBD: confirm from the full texts.]');

// ---------- 3. Materials and methods ----------
H1('3. Materials and Methods');
H2('3.1. Datasets');
P('Table 1 summarizes the three datasets.');
TABLE(1, 'Datasets used in the experiments', [700, 2500, 1600, 2600, 1626], ['ID', 'Dataset', 'Unit (n)', 'Features (p)', 'Source'], [
  ['D1a', 'Indonesian Disaster Dataset, totals 2002–2022', `Province (${a.n})`, `${a.p}: events per disaster type; deaths, missing, injured, affected, evacuated, damaged houses and facilities`, 'Wahyudi (2024)'],
  ['D1b', 'Indonesian Disaster Dataset, yearly', `Province-year (${a.n} × 21 = ${b.n})`, `${b.p}: same features per year`, 'Wahyudi (2024)'],
  ['B2', 'Wine', `Sample (${w.n})`, `${w.p} chemical features`, 'Aeberhard & Forina (1992)']]);
P(`D1 comes from Wahyudi (2024), who compiled reports of the national and regional disaster management agencies into one workbook per province with a sheet per year. The published dataset covers 33 of the 34 provinces of 2020; Kepulauan Bangka Belitung is absent. We built both D1a and D1b from the yearly sheets. For ${R.d1_check.provinces_with_diff} provinces the yearly sheets sum to fewer events than the dataset’s all-years sheet (at most ${R.d1_check.max_pct.toFixed(1)}%; ${R.d1_check.events_years.toLocaleString('en-US')} versus ${R.d1_check.events_all_sheet.toLocaleString('en-US')} events in total). Disaster-type labels were harmonized (for example, “KEKERINGAN” to drought), and climate change, recorded once in one province, was removed. D1a is the small-n regional setting, D1b tests whether a larger n reduces multiplicity, and B2 is a standard clustering benchmark.`);
H2('3.2. Preprocessing');
P('Event counts describe how often hazards occur and were kept as counts. Human and material impacts were converted to rates per million inhabitants using the 2020 census population of each province (Badan Pusat Statistik [BPS], 2021); the 2020 population was also used for D1b, which is a limitation for early years. All features were log1p-transformed (D1 only) and standardized. No pair of D1 features exceeded |r| = 0.95 after transformation, so none was removed. All transformations were fixed before the experimental runs.');
H2('3.3. Pipeline');
P('Each run follows five steps. (1) Cluster: k-means with k-means++ initialization (Arthur & Vassilvitskii, 2007) and one start per seed, the scikit-learn default. (2) Align labels: labels are matched to a reference partition (k-means with 50 starts) with the Hungarian algorithm (Kuhn, 1955), so that cluster c means the same group across runs. (3) Fit surrogate: a classifier is trained on the features and cluster labels, and its fidelity is measured by 5-fold macro-F1. (4) Explain: SHAP values are computed per instance, and the global explanation for cluster c is the mean absolute SHAP value over its members. (5) Compare: rankings and vectors are compared across runs with the metrics in Section 3.5.');
P(`The number of clusters was fixed before the runs as the k between 2 and 8 with the highest silhouette coefficient (Rousseeuw, 1987) among solutions whose smallest cluster had at least five members, which 5-fold stratified fidelity estimation requires. This gave k = ${a.k} for D1a (silhouette ${a.silhouette.toFixed(3)}), k = ${b.k} for D1b (${b.silhouette.toFixed(3)}), and k = ${w.k} for B2 (${w.silhouette.toFixed(3)}). The gap statistic (Tibshirani et al., 2001) agreed for D1b but not for D1a, where it favored k = 7 with singleton clusters; all silhouettes for D1 were below 0.21, indicating weak cluster structure.`);
H2('3.4. Experimental Design');
P('Table 2 lists the factors and their levels.');
TABLE(2, 'Factors and levels of the experimental design', [2600, 6426], ['Factor', 'Levels'], [
  ['F1 Clustering seed', 'OFAT: 30 seeds; factorial: 5 seeds'],
  ['F2 Surrogate class', 'Decision tree (depth ≤ 4), random forest (300 trees), LightGBM; multinomial logistic regression (OFAT only)'],
  ['F3 Surrogate seed', 'OFAT: 30 seeds; factorial: 3 seeds'],
  ['F4 SHAP estimator', 'Interventional and path-dependent TreeSHAP; KernelSHAP and LinearSHAP (OFAT only)'],
  ['F5 Background sample', 'OFAT: size 10 and 50, 30 seeds each; factorial: size 50, 3 seeds (nested within interventional TreeSHAP)'],
  ['Reference (no surrogate)', 'KernelSHAP on the soft-assignment function (negative squared distance to each centroid), 10 background seeds']],
  'Notes: OFAT = one-factor-at-a-time. Source: Own elaboration.');
P('Two designs were run on every dataset. The one-factor-at-a-time (OFAT) design varies each factor around a baseline (random forest surrogate, interventional TreeSHAP, background size 50, all seeds 0) and answers RQ1 and RQ3. The full factorial design answers RQ2 and crosses 5 clustering seeds × 3 surrogate classes × 3 surrogate seeds × 4 explainer settings (path-dependent TreeSHAP, and interventional TreeSHAP with background seeds 0, 1, and 2), giving 180 runs per dataset. As a robustness check, the factorial design was repeated on D1a with 10 k-means starts per seed.');
H2('3.5. Metrics');
P('**Partition stability.** The adjusted Rand index (ARI; Hubert & Arabie, 1985) between runs separates explanation instability from partition instability.');
P('**Magnitude-based explanation similarity.** Cosine similarity between global mean absolute SHAP vectors.');
P('**Rank-based explanation similarity.** Kendall’s τ-b over full feature rankings, top-3 Jaccard, and rank-biased overlap (RBO, p = 0.9; Webber et al., 2010), which weights top ranks more heavily. With D features, RBO is truncated at depth D and divided by 1 − pᴰ so that identical rankings score 1, as given in Eq. (1):');
EQ_RBO();
P('where S and T are the two rankings and S₁:d is the set of the first d features of S.');
P('**Agreement with the intrinsic reference.** An IMM threshold tree (Dasgupta et al., 2020) is grown from the reference centroids. For each cluster, the features on the path to its leaf are compared with the top-ranked features of the SHAP explanation by Jaccard similarity, using as many top features as the path holds. The price of explainability is the k-means cost of the tree partition divided by that of the reference partition.');
H2('3.6. Statistical Analysis');
P('For RQ2, every pair of factorial runs was coded with five indicators that equal 1 when the two runs differ in that factor. Pairwise similarity (Kendall’s τ and top-3 Jaccard) was modeled per dataset with a linear mixed-effects model with the five indicators and cluster as fixed effects and crossed random intercepts for the two runs in each pair, because each run appears in many pairs. A coefficient is the expected change in similarity when only that factor differs. The model was fitted on a random sample of 6,000 pairs. To set how many runs should be aggregated before reporting an explanation, we drew two disjoint sets of n runs (n = 1–15, 200 draws), averaged their importance vectors, and computed Kendall’s τ between the two consensus rankings. Bootstrap 95% confidence intervals (2,000 resamples) are reported for medians. For RQ3, we counted pairs whose cosine similarity was at least 0.95 while their top-3 features changed.');
H2('3.7. Implementation');
P('Python 3.11 with scikit-learn (Pedregosa et al., 2011), shap (Lundberg & Lee, 2017), lightgbm, and statsmodels. All seeds and configurations are logged with the results.');

// ---------- 4. Results ----------
H1('4. Results');
H2('4.1. Partition Stability and Surrogate Fidelity');
const fidTxt = ds => ['dt', 'rf', 'lgbm', 'lr'].map(s => R[ds].fidelity[s].toFixed(3)).join(' / ');
P(`Table 3 shows that the three datasets differ sharply in partition stability. In B2, single-start k-means runs nearly always reproduced the same partition. In D1a, partitions from different seeds barely agreed (median ARI ${f3(a.ari_seed_median)}), and none of the 180 factorial runs reproduced the 50-start reference partition (ARI ≥ 0.9). In D1b, the median ARI was ${f3(b.ari_seed_median)}. Surrogate macro-F1 ranged from ${minFid('d1a')} to ${maxFid('d1a')} in D1a, from ${minFid('d1b')} to ${maxFid('d1b')} in D1b, and from ${minFid('wine')} to ${maxFid('wine')} in B2.`);
TABLE(3, 'Partition stability and surrogate fidelity', [1100, 700, 1300, 2700, 3226], ['Dataset', 'k', 'Silhouette', 'Median ARI between seeds [95% CI]', 'Surrogate macro-F1 (DT / RF / LGBM / LR)'],
  ALL.map(ds => [DSN[ds], R[ds].k, R[ds].silhouette.toFixed(3), `${f3(R[ds].ari_seed_median)} [${f3(R[ds].ari_seed_ci[0])}, ${f3(R[ds].ari_seed_ci[1])}]`, fidTxt(ds)]),
  'Notes: ARI over 435 pairs of 30 single-start seeds. DT = decision tree; RF = random forest; LGBM = LightGBM; LR = logistic regression. Source: Own elaboration.');
H2('4.2. RQ1: Magnitude of Explanation Multiplicity');
const fac = (ds, f) => f3(R[ds].tau_by_factor[f]);
P(`Table 4 summarizes explanation similarity, and Figure 1 shows its distribution by factor. Changing only the clustering seed gave a median τ of ${fac('d1a', 'F1_cluster_seed')} in D1a, against ${fac('d1b', 'F1_cluster_seed')} in D1b and ${fac('wine', 'F1_cluster_seed')} in B2. Changing only the surrogate class gave median τ values of ${fac('d1a', 'F2_surrogate')}, ${fac('d1b', 'F2_surrogate')}, and ${fac('wine', 'F2_surrogate')}. Changing the SHAP estimator, the surrogate seed, or the background sample left the ranking largely intact (median τ ≥ ${f2(Math.min(...ALL.flatMap(ds => ['F3_surrogate_seed', 'F4_estimator', 'F5_background'].map(f => R[ds].tau_by_factor[f]))))}).`);
TABLE(4, 'Explanation similarity between runs (OFAT design, all factors pooled)', [1300, 1900, 1900, 1900, 2026], ['Dataset', 'Cosine (median)', 'Kendall’s τ (median)', 'Top-3 Jaccard (median)', 'RBO (median)'],
  ALL.map(ds => [DSN[ds], f3(R[ds].median_all.cosine), f3(R[ds].median_all.kendall_tau), f3(R[ds].median_all.jaccard_top3), f3(R[ds].median_all.rbo)]),
  `Notes: Medians over all OFAT pair × cluster comparisons except the surrogate-free reference (D1a: ${a.ofat_pairs.toLocaleString('en-US')}; D1b: ${b.ofat_pairs.toLocaleString('en-US')}; B2: ${w.ofat_pairs.toLocaleString('en-US')}). The pooled median is dominated by the factors with most runs; see Figure 1 for each factor. Source: Own elaboration.`);
FIGURE(1, 'Fig1.png', 600, 0, 'Kendall’s τ between runs by factor (OFAT design)');
H2('4.3. RQ2: Effect of Each Pipeline Factor');
P(`Table 5 reports the factorial estimates. The dominant factor differed by dataset: the ${TERMNAME[domA.term].toLowerCase()} in D1a (Δτ = ${f3(domA.coef)}), the ${TERMNAME[domB.term].toLowerCase()} in D1b (Δτ = ${f3(domB.coef)}), and the ${TERMNAME[domW.term].toLowerCase()} in B2 (Δτ = ${f3(domW.coef)}). The background sample had no detectable effect at size 50 in any dataset.`);
TABLE(5, 'Mixed-effects estimates of factor effects on Kendall’s τ (factorial design)', [2000, 2342, 2342, 2342], ['Factor that differs', 'D1a [95% CI]', 'D1b [95% CI]', 'B2 [95% CI]'],
  TERMS.map(([t, nm]) => [nm, effTxt('d1a', 'kendall_tau', t), effTxt('d1b', 'kendall_tau', t), effTxt('wine', 'kendall_tau', t)]),
  'Notes: Expected change in τ when only that factor differs between two runs; 6,000 sampled pairs per dataset; crossed random intercepts for both runs. Estimates for top-3 Jaccard are in the supplementary files. Source: Own elaboration.');
P(`Figure 2 shows how agreement grows when explanations are averaged over runs. In B2, the median τ between two consensus rankings rose from ${f3(curve('wine', 1)[0])} for single runs to ${f3(curve('wine', 10)[0])} with 10 runs. In D1a it rose only from ${f3(curve('d1a', 1)[0])} to ${f3(curve('d1a', 15)[0])} with 15 runs, because averaging cannot reconcile explanations of different partitions. In D1b it rose from ${f3(curve('d1b', 1)[0])} to ${f3(curve('d1b', 10)[0])} with 10 runs.`);
FIGURE(2, 'Fig2.png', 400, 0, 'Agreement between disjoint consensus rankings versus the number of aggregated runs');
P(`With 10 k-means starts per seed, ${a10.runs_matching_ref} of 180 D1a runs reproduced the reference partition (median ARI ${f3(a10.ari_median)}). The clustering-seed effect fell from ${f3(eff('d1a', 'kendall_tau', 'd_cluster_seed').coef)} to ${effTxt('d1a_ninit10', 'kendall_tau', 'd_cluster_seed')}, and the surrogate class then had a similar effect (${effTxt('d1a_ninit10', 'kendall_tau', 'd_surrogate')}). The median τ for single runs rose to ${f3(a10.curve['1'][0])}, and to ${f3(a10.curve['15'][0])} with 15 runs.`);
H2('4.4. RQ3: Magnitude Versus Rank Metrics');
P(`Most pairs looked stable by cosine similarity (≥ 0.95: ${pct(a.share_cos95)} in D1a, ${pct(b.share_cos95)} in D1b, ${pct(w.share_cos95)} in B2). Yet ${pct(a.rq3_share)}, ${pct(b.rq3_share)}, and ${pct(w.rq3_share)} of all pairs, respectively, combined cosine ≥ 0.95 with a change in the top-3 features. Figure 3 plots cosine similarity against Kendall’s τ.`);
FIGURE(3, 'Fig3.png', 600, 0, 'Cosine similarity versus Kendall’s τ for all OFAT pairs; the shaded band marks cosine ≥ 0.95');
H2('4.5. RQ4: Agreement with Threshold-tree Clustering');
const rq4row = (nm, q) => q.clusters.map(c => [nm, `C${c.cluster + 1}`, c.path.map(pretty).join('; '), c.agg_topk.map(pretty).join('; '), c.agg_jaccard.toFixed(2), `${c.single_mean.toFixed(2)} (${pct(c.single_exact)})`]);
P(`Table 6 compares SHAP explanations with the IMM tree on runs that reproduced the reference partition (D1a: the ${q4a.clusters[0].n_runs} such runs with 10 starts; B2: ${q4w.clusters[0].n_runs} runs). The tree cost little in clustering quality (price of explainability ${q4a.price.toFixed(3)} in D1a and ${q4w.price.toFixed(3)} in B2; ${pct(q4a.agreement)} and ${pct(q4w.agreement)} of points kept their cluster). In D1a, the tree split the provinces on tidal-wave and abrasion events, and the aggregated SHAP ranking placed the same feature first for both clusters, while single runs did so for only ${pct(q4a.clusters[0].single_exact)} and ${pct(q4a.clusters[1].single_exact)} of runs. In B2, agreement was complete for one cluster and partial for the other two.`);
TABLE(6, 'Agreement between SHAP explanations and IMM tree paths', [700, 600, 2200, 2200, 1200, 2126], ['Data', 'Cluster', 'IMM path features', 'Aggregated SHAP top-k', 'Jaccard (aggregated)', 'Jaccard, single runs: mean (share exact)'],
  [...rq4row('D1a', q4a), ...rq4row('B2', q4w)],
  'Notes: k = number of path features. D1a uses the runs with 10 k-means starts that reproduced the reference partition (ARI ≥ 0.9). Source: Own elaboration.');

// ---------- 5. Discussion ----------
H1('5. Discussion');
H2('5.1. Interpretation');
P(`RQ1 and RQ2. Explanation multiplicity in post-hoc SHAP explanations of clustering is large, and its main source depends on the data. When cluster structure is clear, as in B2, k-means gives the same partition from almost any start, and the choice of surrogate class becomes the main source of variation. When structure is weak, as in the 33 provinces of D1a (silhouette ${a.silhouette.toFixed(3)}), the partition itself changes with the seed and the explanation changes with it. This source is specific to clustering and has no counterpart in the supervised studies of explanation multiplicity (Hwang et al., 2026; Yasodhara et al., 2021). The SHAP estimator, the surrogate seed, and the background sample mattered little, which differs from the strong background effects reported for deep models (Yuan et al., 2022); tree surrogates on small tabular data may be less sensitive.`);
P(`${D1B_SENTENCE} In B2, all four surrogates reproduced the cluster labels with macro-F1 of at least ${minFid('wine')}, yet changing only the surrogate class lowered \u03c4 by ${f3(-eff('wine', 'kendall_tau', 'd_surrogate').coef)}. High fidelity is therefore not evidence that an explanation is stable, contrary to the reasoning in Pongvijan and Trakunphutthirak (2026).`);
P(`RQ3. Cosine similarity overstated stability in all three datasets, in line with Hwang et al. (2026). A practitioner who checks stability with a magnitude metric would accept many pairs of explanations whose top-3 features differ, and the top features are what reports usually communicate.`);
P(`RQ4. Once the partition was stable, aggregated SHAP explanations agreed with the IMM tree in D1a, but single runs often did not. Aggregation over runs is therefore what makes post-hoc explanations comparable with an intrinsic method. The small price of explainability suggests that threshold trees are a practical alternative or complement for regional typologies.`);
H2('5.2. Practical Implications');
P(`A single SHAP run is not a reliable basis for statements such as “province X is high-risk mainly because of flood frequency.” We propose that practitioners report: (a) partition stability as the ARI over at least 30 seeds, and use multiple k-means starts (the scikit-learn default for k-means++ is a single start); (b) surrogate fidelity, without treating it as evidence of explanation stability; (c) a ranking aggregated over at least 10 runs that vary the surrogate class, with its rank-based stability; and (d) agreement with an intrinsic method such as an IMM tree when one is available. In B2, 10 aggregated runs gave a median τ of ${f3(curve('wine', 10)[0])} between independent consensus rankings.`);
H2('5.3. Threats to Validity');
P('**Internal.** Label alignment can fail when clusters split or merge across seeds. With k = 2 in D1, Hungarian matching always assigns a label, so explanation differences between unrelated partitions are measured as instability, which is the quantity of interest for practitioners but mixes partition and explanation effects; the ARI and the 10-start robustness check separate the two.');
P(`**Construct.** Surrogate SHAP explains the surrogate, not the clustering algorithm. As a surrogate-free reference, KernelSHAP on the distance to the centroids gave median \u03c4 values across background seeds of ${fac('d1a', 'REF_surrogate_free')} (D1a), ${fac('d1b', 'REF_surrogate_free')} (D1b), and ${fac('wine', 'REF_surrogate_free')} (B2), so removing the surrogate does not remove the variation due to the explainer itself.`);
P('**External.** One disaster dataset at two levels and one benchmark may not represent high-dimensional or text data. The published D1 lacks one province, its yearly and all-years sheets differ by up to a few percent, and disaster reports may under-record events in remote provinces. These issues affect the clusters but not the comparison of explanations, which holds the data fixed.');
P('**Conclusion validity.** Pairwise comparisons are not independent; the mixed-effects model with crossed random effects and bootstrap intervals are used instead of tests that assume independence.');

// ---------- 6. Conclusions ----------
H1('6. Conclusions');
P(`Post-hoc SHAP explanations of k-means clusters are not stable to analytical choices that are usually left unreported. In Indonesian province data, the clustering seed alone changed the explanation more than any other factor (Δτ = ${f3(eff('d1a', 'kendall_tau', 'd_cluster_seed').coef)}); in a benchmark with clear structure, the surrogate class did (Δτ = ${f3(eff('wine', 'kendall_tau', 'd_surrogate').coef)}). Magnitude metrics hid many changes in the top features, and high surrogate fidelity did not indicate stable explanations. Multiple k-means starts, aggregation over runs, and rank-based stability reporting address most of the problem.`);
H2('6.1. Future Research');
P('Future work should test whether the pipeline produces equally confident explanations on synthetic data without cluster structure, which would show how much of a cluster explanation reflects the data and how much the pipeline; extend the protocol to other explainers and clustering algorithms; and study with disaster-management officers whether stability-aware reports change decisions.');

// ---------- Declarations ----------
H1('Declarations');
P('**Use of artificial intelligence tools.** During the preparation of this work, the authors used Claude (Anthropic) to support the literature search, to write and run the analysis code, and to draft and edit the manuscript text, and ChatGPT (OpenAI) for an initial exploration of research gaps. The authors reviewed, verified, and edited all text, code, and results, and take full responsibility for the content of the published article. No AI tool was used to generate or alter experimental data. [Penulis: sesuaikan dengan penggunaan yang sebenarnya.]');
P('**CRediT authorship contribution statement.** Hilman Firdaus: Conceptualization, Methodology, Software, Formal analysis, Writing – original draft. Wendy Sarasjati: Supervision, Validation, Writing – review and editing. Dhendra Marutho: Supervision, Methodology, Writing – review and editing. All authors read and approved the final manuscript. [Penulis: konfirmasi peran masing-masing.]');
P('**Declaration of conflicts of interest.** The authors declare that they have no known competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.');
P('**Funding.** This research did not receive any specific grant from funding agencies in the public, commercial, or not-for-profit sectors.');
P('**Ethics statement.** This study analyzed only publicly available, aggregated data at province and province-year level and a public benchmark. No human participants were involved, so ethical approval and informed consent were not required.');
P('**Data statement.** The disaster data are available in Mendeley Data at https://doi.org/10.17632/pyftdypmfs.1, the population data in BPS (2021), and the Wine data in the UCI Machine Learning Repository at https://doi.org/10.24432/C5PC7J. The analysis code and result files are available at [TBD: anonymized repository for review; https://github.com/hilman-firdd/… after acceptance].');
P('**Acknowledgments.** The authors thank the Master’s Programme of Informatics, Universitas Muhammadiyah Semarang, for supporting this research. [Remove from the blinded version.]');

// ---------- References (APA 7, alphabetical) ----------
const REFS = [
  'Aeberhard, S., & Forina, M. (1992). *Wine* [Data set]. UCI Machine Learning Repository. https://doi.org/10.24432/C5PC7J',
  'Alkhatib, A., Boström, H., & Vazirgiannis, M. (2023). Explaining predictions by characteristic rules. In *Machine Learning and Knowledge Discovery in Databases: ECML PKDD 2022* (Lecture Notes in Computer Science). Springer. https://doi.org/10.1007/978-3-031-26387-3_24',
  'Anthropic. (2026). *Claude* [Large language model]. https://claude.ai',
  'Arthur, D., & Vassilvitskii, S. (2007). k-means++: The advantages of careful seeding. In *Proceedings of the Eighteenth Annual ACM-SIAM Symposium on Discrete Algorithms* (pp. 1027–1035). SIAM.',
  'Atzmueller, M., Fürnkranz, J., Kliegr, T., & Schmid, U. (2024). Explainable and interpretable machine learning and data mining. *Data Mining and Knowledge Discovery, 38*(5), 2571–2595. https://doi.org/10.1007/s10618-024-01041-y',
  'Badan Pusat Statistik. (2021). *Hasil Sensus Penduduk 2020: Jumlah penduduk menurut provinsi*. https://sensus.bps.go.id/topik/tabular/sp2020/3/1/2',
  'Claborne, D., Flores, J., Erwin, S., Durell, L., Degnan, D., Richardson, R., Fore, R., & Bramer, L. (2026). Consistency of feature attribution in deep learning architectures for multi-omics. *Scientific Reports, 16*, Article 25890. https://doi.org/10.1038/s41598-026-58312-5',
  'Dasgupta, S., Frost, N., Moshkovitz, M., & Rashtchian, C. (2020). Explainable k-means and k-medians clustering. In *Proceedings of the 37th International Conference on Machine Learning* (PMLR Vol. 119). https://doi.org/10.48550/arXiv.2002.12538',
  'Dewoprabowo, R., Stefanus, L. Y., & Saptawijaya, A. (2025). Explainable clustering: Methods, challenges, and future opportunities. *Journal of Intelligent Systems, 34*, Article 20240477. https://doi.org/10.1515/jisys-2024-0477',
  'Erda, G., Gunawan, C., & Erda, Z. (2023). Grouping of poverty in Indonesia using k-means with silhouette coefficient. *Parameter: Journal of Statistics, 3*(1). https://doi.org/10.22487/27765660.2023.v3.i1.16435',
  'Fawley, R. J., & de Amorim, R. C. (2026). Shapley-inspired feature weighting in k-means with no additional hyperparameters. *Expert Systems with Applications*, Article 133406. https://doi.org/10.1016/j.eswa.2026.133406',
  'Filom, K., Miroshnikov, A., Kotsiopoulos, K., & Kannan, A. R. (2024). On marginal feature attributions of tree-based models. *Foundations of Data Science*. https://doi.org/10.3934/fods.2024021',
  'Frost, N., Moshkovitz, M., & Rashtchian, C. (2020). *ExKMC: Expanding explainable k-means clustering* [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2006.02399',
  'Gupta, A., Pittu, M. R., Svensson, O., & Yuan, R. (2023). The price of explainability for clustering. In *2023 IEEE 64th Annual Symposium on Foundations of Computer Science (FOCS)*. IEEE. https://doi.org/10.1109/FOCS57990.2023.00067',
  'Hafid, H., Meliyana, S. M., Muthahharah, I., & Mar’ah, Z. (2025). Implementation k-medoids algorithm for clustering Indonesian provinces by poverty and economic indicators. *Quantitative Economics and Management Studies*. https://doi.org/10.35877/454RI.qems3940',
  'Hu, L., Jiang, M., Dong, J., Liu, X., & He, Z. (2026). Interpretable clustering: A survey. *ACM Computing Surveys, 58*(8), 1–21. https://doi.org/10.1145/3789495',
  'Hubert, L., & Arabie, P. (1985). Comparing partitions. *Journal of Classification, 2*(1), 193–218. https://doi.org/10.1007/BF01908075',
  'Hwang, H., Lee, S., Rosenblatt, L., Whang, S. E., & Stoyanovich, J. (2026). *Explanation multiplicity in SHAP: Characterization and assessment* [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2601.12654',
  'Krishna, S., Han, T., Gu, A., Wu, S., Jabbari, S., & Lakkaraju, H. (2022). *The disagreement problem in explainable machine learning: A practitioner’s perspective* [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2202.01602',
  'Kuhn, H. W. (1955). The Hungarian method for the assignment problem. *Naval Research Logistics Quarterly, 2*(1–2), 83–97. https://doi.org/10.1002/nav.3800020109',
  'Louhichi, M., Nesmaoui, R., Mbarek, M., & Lazaar, M. (2023). Shapley values for explaining the black box nature of machine learning model clustering. *Procedia Computer Science*. https://doi.org/10.1016/j.procs.2023.03.107',
  'Lundberg, S. M., & Lee, S.-I. (2017). A unified approach to interpreting model predictions. In *Advances in Neural Information Processing Systems 30*. https://doi.org/10.48550/arXiv.1705.07874',
  'Müller, S., Toborek, V., Beckh, K., Jakobs, M., Bauckhage, C., & Welke, P. (2023). An empirical evaluation of the Rashomon effect in explainable machine learning. In *Machine Learning and Knowledge Discovery in Databases: Research Track* (pp. 462–478). Springer. https://doi.org/10.1007/978-3-031-43418-1_28',
  'Nauta, M., Trienes, J., Pathak, S., Nguyen, E., Peters, M., Schmitt, Y., Schlötterer, J., van Keulen, M., & Seifert, C. (2023). From anecdotal evidence to quantitative evaluation methods: A systematic review on evaluating explainable AI. *ACM Computing Surveys, 55*(13s), 1–42. https://doi.org/10.1145/3583558',
  'Nogueira, S., Sechidis, K., & Brown, G. (2017). On the stability of feature selection algorithms. *Journal of Machine Learning Research, 18*(174), 1–54.',
  'OpenAI. (2024). *ChatGPT* [Large language model]. https://chat.openai.com',
  'Pedregosa, F., Varoquaux, G., Gramfort, A., Michel, V., Thirion, B., Grisel, O., Blondel, M., Prettenhofer, P., Weiss, R., Dubourg, V., Vanderplas, J., Passos, A., Cournapeau, D., Brucher, M., Perrot, M., & Duchesnay, É. (2011). Scikit-learn: Machine learning in Python. *Journal of Machine Learning Research, 12*, 2825–2830.',
  'Pongvijan, S., & Trakunphutthirak, R. (2026). An interpretable AutoML clustering framework with multi-metric evaluation and generative AI-based explanation. In *2026 9th International Conference on Artificial Intelligence and Big Data (ICAIBD)*. IEEE. https://doi.org/10.1109/ICAIBD69640.2026.11637167',
  'Rousseeuw, P. J. (1987). Silhouettes: A graphical aid to the interpretation and validation of cluster analysis. *Journal of Computational and Applied Mathematics, 20*, 53–65. https://doi.org/10.1016/0377-0427(87)90125-7',
  'Saarela, M., & Podgorelec, V. (2024). Recent applications of explainable AI (XAI): A systematic literature review. *Applied Sciences, 14*(19), Article 8884. https://doi.org/10.3390/app14198884',
  'Salih, A. M., Raisi-Estabragh, Z., Boscolo Galazzo, I., Radeva, P., Petersen, S. E., Lekadir, K., & Menegaz, G. (2024). A perspective on explainable artificial intelligence methods: SHAP and LIME. *Advanced Intelligent Systems, 7*(1), Article 2400304. https://doi.org/10.1002/aisy.202400304',
  'Salma, A., & Zilrahmi, Z. (2025). Multidimensional poverty clustering using k-means algorithm with dimensionality reduction by principal component analysis. *Rangkiang Mathematics Journal, 4*(2), 111–118. https://doi.org/10.24036/rmj.v4i2.101',
  'Sarica, A., Quattrone, A., & Quattrone, A. (2022). Introducing the rank-biased overlap as similarity measure for feature importance in explainable machine learning: A case study on Parkinson’s disease. In *Lecture Notes in Computer Science*. Springer. https://doi.org/10.1007/978-3-031-15037-1_11',
  'Shu, P., Huang, L., Wang, X., Wen, Z., Luo, Y., & Xu, F. (2025). Application of cluster analysis based on SHAP values in hemodialysis patients using arteriovenous fistula. *International Journal of General Medicine, 18*, 5475–5489. https://doi.org/10.2147/IJGM.S533419',
  'Slack, D., Hilgard, S., Jia, E., Singh, S., & Lakkaraju, H. (2020). Fooling LIME and SHAP: Adversarial attacks on post hoc explanation methods. In *Proceedings of the AAAI/ACM Conference on AI, Ethics, and Society* (pp. 180–186). ACM. https://doi.org/10.1145/3375627.3375830',
  'Syamsiah, N. O., Purwandani, I., Rosmiati, M., & Nurwahyuni, S. (2025). Optimalisasi algoritma k-means melalui normalisasi rasio dan pendekatan SHapley Additive exPlanations (SHAP). *SITECH: Jurnal Sistem Informasi dan Teknologi, 8*(2). https://doi.org/10.24176/sitech.v8i2.16253',
  'Tacharri, C., Rohmani, A., & Fahmi, A. (2025). Strategic clustering of poverty areas in Central Java using k-means and silhouette evaluation. *Sinkron, 9*(2). https://doi.org/10.33395/sinkron.v9i2.14734',
  'Tibshirani, R., Walther, G., & Hastie, T. (2001). Estimating the number of clusters in a data set via the gap statistic. *Journal of the Royal Statistical Society: Series B, 63*(2), 411–423. https://doi.org/10.1111/1467-9868.00293',
  'Velmurugan, M., Ouyang, C., Moreira, C., & Sindhgatta, R. (2020). *Evaluating explainable methods for predictive process analytics: A functionally-grounded approach* [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2012.04218',
  'Wahyudi, E. (2024). *Indonesian disaster dataset based on type for technology-based disaster management and mitigation* (Version 1) [Data set]. Mendeley Data. https://doi.org/10.17632/pyftdypmfs.1',
  'Wahyuni, S., Hananto, A., Huda, B., Apriani, F. N., & Tukino, T. (2025). Identifying regional patterns of poverty in Indonesia: A clustering approach using k-means. *International Journal of Computer and Information System, 6*(1). https://doi.org/10.29040/ijcis.v6i1.218',
  'Webber, W., Moffat, A., & Zobel, J. (2010). A similarity measure for indefinite rankings. *ACM Transactions on Information Systems, 28*(4), Article 20. https://doi.org/10.1145/1852102.1852106',
  'Wibowo, A., Rohman, N., Rusdah, R., Achadi, A. H., & Amri, I. (2024). Clustering Indonesian provinces by disaster intensity using k-means algorithm: A data mining approach. *Disaster Advances*. https://doi.org/10.25303/1712da0108',
  'Yasodhara, A., Asgarian, A., Huang, D., & Sobhani, P. (2021). On the trustworthiness of tree ensemble explainability methods. In *Lecture Notes in Computer Science*. Springer. https://doi.org/10.1007/978-3-030-84060-0_19',
  'Yu, W. Y., & Chiu, C. Y. (2026). *An explainable unsupervised-to-supervised machine learning framework for dietary pattern discovery using UK national dietary survey data* [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2605.08242',
  'Yuan, H., Liu, M., Kang, L., Miao, C., & Wu, Y. (2022). *An empirical study of the effect of background data size on the stability of SHapley Additive exPlanations (SHAP) for deep learning models* [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2204.11351',
  'Zawadzki, R. S., & Parvaneh, S. (2024). Interpretable clustering for patient phenotyping using advanced machine learning models. In *Computing in Cardiology*. https://doi.org/10.22489/CinC.2024.016',
];
H1('References');
REFS.forEach(r => body.push(new Paragraph({ spacing: { after: 60 }, indent: { left: 425, hanging: 425 }, children: runs(r) })));

// ---------- front matter ----------
const blue = (t, o = {}) => new TextRun({ text: t, font: SANS, size: 18, color: BLUE, ...o });
const front = [
  ...['ADCAIJ: Advances in Distributed Computing and Artificial Intelligence Journal', 'Regular Issue, Vol. [TBD] (2026), e[TBD]', 'eISSN: 2255-2863', 'DOI: [assigned by the journal]'].map(t => new Paragraph({ alignment: AlignmentType.RIGHT, children: [blue(t)] })),
  new Paragraph({ spacing: { before: 480, after: 240 }, indent: { left: 1700 }, children: [new TextRun({ text: TITLE, bold: true, font: SERIF, size: 44 })] }),
  new Paragraph({ spacing: { after: 120 }, indent: { left: 1700 }, children: [new TextRun({ text: 'Hilman Firdaus', font: SERIF, size: 28 }), new TextRun({ text: 'a,*', font: SERIF, size: 28, superScript: true }), new TextRun({ text: ', Wendy Sarasjati', font: SERIF, size: 28 }), new TextRun({ text: 'a', font: SERIF, size: 28, superScript: true }), new TextRun({ text: ', Dhendra Marutho', font: SERIF, size: 28 }), new TextRun({ text: 'a', font: SERIF, size: 28, superScript: true })] }),
  new Paragraph({ indent: { left: 1700 }, children: [new TextRun({ text: 'a', font: SERIF, size: 20, superScript: true }), ...runs(' Magister Programme of Informatics, Universitas Muhammadiyah Semarang (Gedung NRC), Jl. Kedungmundu Raya No. 18, Semarang, Central Java, Indonesia. Tel. +62 24 76740287', { size: 20 })] }),
  new Paragraph({ indent: { left: 1700 }, children: runs('* Corresponding author: hilmanfirdaus48@gmail.com (H. Firdaus); wendysar@unimus.ac.id (W. Sarasjati); dhendra@unimus.ac.id (D. Marutho)', { size: 20 }) }),
  new Paragraph({ spacing: { after: 360 }, indent: { left: 1700 }, children: runs('ORCID: Hilman Firdaus https://orcid.org/0009-0006-8820-3305; Wendy Sarasjati https://orcid.org/0009-0009-8679-0050; Dhendra Marutho https://orcid.org/0009-0004-2271-1767', { size: 20 }) }),
];
const kb = { style: BorderStyle.SINGLE, size: 8, color: BLUE };
const kw = new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [2000, 7026], rows: [
  new TableRow({ children: ['KEYWORDS', 'ABSTRACT'].map((t, i) => new TableCell({ width: { size: [2000, 7026][i], type: WidthType.DXA }, borders: { top: none, left: none, bottom: kb, right: none }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: t, font: SERIF, size: SZ })] })] })) }),
  new TableRow({ children: [
    new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: { top: none, left: none, bottom: kb, right: none }, margins: { top: 80, bottom: 80, left: 80, right: 120 }, children: KEYWORDS.map((k, i) => new Paragraph({ children: [new TextRun({ text: k + (i < KEYWORDS.length - 1 ? ';' : ''), italics: true, font: SERIF, size: 22 })] })) }),
    new TableCell({ width: { size: 7026, type: WidthType.DXA }, shading: { fill: 'C9D3E8', type: ShadingType.CLEAR }, borders: { top: none, left: none, bottom: kb, right: none }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: runs(ABSTRACT, { italics: true, size: 22 }) })] })] })] });
const footer = new Footer({ children: [
  new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [4513, 4513], rows: [new TableRow({ children: [
    new TableCell({ width: { size: 4513, type: WidthType.DXA }, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: BLUE }, left: none, bottom: none, right: none }, children: [new Paragraph({ children: [blue('Firdaus et al.', { italics: true, size: 16 })] }), new Paragraph({ children: [blue(TITLE, { size: 16 })] })] }),
    new TableCell({ width: { size: 4513, type: WidthType.DXA }, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: BLUE }, left: none, bottom: none, right: none }, children: ['ADCAIJ: Advances in Distributed Computing and Artificial Intelligence Journal', 'eISSN: 2255-2863 - https://adcaij.usal.es', 'Ediciones Universidad de Salamanca - CC BY-NC-ND'].map(t => new Paragraph({ alignment: AlignmentType.RIGHT, children: [blue(t, { size: 16 })] })) })] })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: SANS, size: 18, color: BLUE })] })] });
const doc = new Document({ creator: 'Hilman Firdaus', title: TITLE, styles: { default: { document: { run: { font: SERIF, size: SZ } } } },
  numbering: { config: [{ reference: 'rq', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, footer: 500 } } }, footers: { default: footer }, children: [...front, kw, ...body] }] });
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(`${OUT}/ADCAIJ_manuscript_cluster_explanation_stability.docx`, buf); console.log('manuscript ok'); });

// ---------- highlights ----------
const HL = ['Post-hoc SHAP explanations of k-means clusters change with analytical choices',
  'In province data, the clustering seed is the largest source of instability',
  'With clear cluster structure, the surrogate model class dominates instead',
  'Cosine similarity hides changes in the top-ranked features',
  'Multiple k-means starts and aggregation over runs stabilize explanations'];
HL.forEach(h => { if (h.length > 85) throw new Error('Highlight too long: ' + h); });
const hdoc = new Document({ styles: { default: { document: { run: { font: SERIF, size: SZ } } } },
  numbering: { config: [{ reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: [
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Highlights', bold: true, size: 28 })] }),
    ...HL.map(h => new Paragraph({ numbering: { reference: 'b', level: 0 }, children: [new TextRun(h)] }))] }] });
Packer.toBuffer(hdoc).then(buf => { fs.writeFileSync(`${OUT}/Highlights.docx`, buf); console.log('highlights ok'); });
