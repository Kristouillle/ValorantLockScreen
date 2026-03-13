const makeTeam = (id, displayName, logoAssetName, aliases = []) => ({
  id,
  slug: id,
  displayName,
  logoAssetName,
  aliases
});

export const teamCatalog = [
  makeTeam("100-thieves", "100 Thieves", "team-100t", ["100T"]),
  makeTeam("cloud9", "Cloud9", "team-c9"),
  makeTeam("envy", "ENVY", "team-envy", ["Team Envy"]),
  makeTeam("evil-geniuses", "Evil Geniuses", "team-evilgeniuses", ["EG", "Evil Geniuses"]),
  makeTeam("furia", "FURIA", "team-furia"),
  makeTeam("g2-esports", "G2 Esports", "team-g2", ["G2"]),
  makeTeam("kru-esports", "KRÜ Esports", "team-kru", ["KRU", "KRU Esports"]),
  makeTeam("leviatan", "LEVIATÁN", "team-leviatan", ["Leviatan", "Leviatán", "LEVIATAN"]),
  makeTeam("loud", "LOUD", "team-loud"),
  makeTeam("mibr", "MIBR", "team-mibr"),
  makeTeam("nrg", "NRG", "team-nrg"),
  makeTeam("sentinels", "Sentinels", "team-sentinels"),
  makeTeam("bbl-esports", "BBL Esports", "team-bbl", ["BBL"]),
  makeTeam("fnatic", "FNATIC", "team-fnatic"),
  makeTeam("fut-esports", "FUT Esports", "team-fut", ["FUT"]),
  makeTeam("gentle-mates", "Gentle Mates", "team-m8", ["M8", "Gentle Mates Alpine"]),
  makeTeam("giantx", "GIANTX", "team-giantx"),
  makeTeam("karmine-corp", "Karmine Corp", "team-karmine", ["KC"]),
  makeTeam("natus-vincere", "Natus Vincere", "team-navi", ["NaVi", "NAVI"]),
  makeTeam("pcific-esports", "PCIFIC Esports", "team-pcific"),
  makeTeam("team-heretics", "Team Heretics", "team-th", ["Heretics"]),
  makeTeam("team-liquid", "Team Liquid", "team-tl", ["TL"]),
  makeTeam("team-vitality", "Team Vitality", "team-vitality", ["Vitality"]),
  makeTeam("ulf-esports", "ULF Esports", "team-ulf"),
  makeTeam("detonation-focusme", "DetonatioN FocusMe", "team-dfm", ["DFM"]),
  makeTeam("drx", "DRX", "team-drx"),
  makeTeam("full-sense", "FULL SENSE", "team-fullsense", ["FULLSENSE"]),
  makeTeam("gen-g", "Gen.G", "team-geng", ["GenG"]),
  makeTeam("global-esports", "Global Esports", "team-global", ["GE"]),
  makeTeam("nongshim-redforce", "NONGSHIM REDFORCE", "team-nongshim", ["NS RedForce", "Nongshim"]),
  makeTeam("paper-rex", "Paper Rex", "team-prx", ["PRX"]),
  makeTeam("rex-regum-qeon", "Rex Regum Qeon", "team-rrq", ["RRQ"]),
  makeTeam("t1", "T1", "team-t1"),
  makeTeam("team-secret", "Team Secret", "team-secret", ["Secret"]),
  makeTeam("varrel", "VARREL", "team-varrel"),
  makeTeam("zeta-division", "ZETA DIVISION", "team-zeta", ["ZETA"]),
  makeTeam("all-gamers", "All Gamers", "team-allgamers", ["AG"]),
  makeTeam("bilibili-gaming", "Guangzhou Huadu Bilibili Gaming", "team-bilibili", ["Bilibili Gaming", "BLG"]),
  makeTeam("dragon-ranger-gaming", "Dragon Ranger Gaming", "team-drg", ["DRG"]),
  makeTeam("edward-gaming", "EDward Gaming", "team-edg", ["Edward Gaming", "EDG"]),
  makeTeam("funplus-phoenix", "FunPlus Phoenix", "team-fpx", ["FPX"]),
  makeTeam("jdg-esports", "JD Mall JDG Esports", "team-jdg", ["JDG Esports", "JDG"]),
  makeTeam("nova-esports", "Nova Esports", "team-nova"),
  makeTeam("titan-esports-club", "Wuxi Titan Esports Club", "team-titan", ["Titan Esports Club", "TEC"]),
  makeTeam("trace-esports", "Trace Esports", "team-trace", ["Trace"]),
  makeTeam("tyloo", "TYLOO", "team-tyloo"),
  makeTeam("wolves-esports", "Wolves Esports", "team-wolves", ["Wolves"]),
  makeTeam("xi-lai-gaming", "Xi Lai Gaming", "team-xlg", ["XLG"])
];

export const normalizeKey = (value) =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean)
    .join("-");

export const resolveTeam = ({ id, name }) => {
  const normalizedName = normalizeKey(name);
  const normalizedId = normalizeKey(id ?? "");

  const catalogTeam = teamCatalog.find((candidate) => {
    const candidateKeys = [
      candidate.id,
      candidate.slug,
      candidate.displayName,
      ...candidate.aliases
    ].map(normalizeKey);

    return candidateKeys.includes(normalizedName) || candidateKeys.includes(normalizedId);
  });

  if (catalogTeam) {
    return catalogTeam;
  }

  const slug = normalizedName || normalizedId || "unknown-team";

  return {
    id: slug,
    slug,
    displayName: name,
    logoAssetName: `team-${slug}`
  };
};
