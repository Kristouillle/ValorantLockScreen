import Foundation

enum TeamRegion: String, CaseIterable, Identifiable, Sendable {
    case amer = "AMER"
    case emea = "EMEA"
    case pac = "PAC"
    case cn = "CN"

    var id: String { rawValue }
}

struct Team: Identifiable, Codable, Hashable, Sendable {
    let id: String
    let slug: String
    let displayName: String
    let logoAssetName: String
}

extension Team {
    static let catalog: [Team] = TeamRegion.allCases.flatMap { catalog(for: $0) }

    static func catalog(for region: TeamRegion) -> [Team] {
        switch region {
        case .amer:
            return [
                make("100-thieves", "100 Thieves", logo: "team-100t"),
                make("cloud9", "Cloud9", logo: "team-c9"),
                make("envy", "ENVY", logo: "team-envy"),
                make("evil-geniuses", "Evil Geniuses", logo: "team-evilgeniuses"),
                make("furia", "FURIA", logo: "team-furia"),
                make("g2-esports", "G2 Esports", logo: "team-g2"),
                make("kru-esports", "KRÜ Esports", logo: "team-kru"),
                make("leviatan", "LEVIATÁN", logo: "team-leviatan"),
                make("loud", "LOUD", logo: "team-loud"),
                make("mibr", "MIBR", logo: "team-mibr"),
                make("nrg", "NRG", logo: "team-nrg"),
                make("sentinels", "Sentinels", logo: "team-sentinels")
            ]
        case .emea:
            return [
                make("bbl-esports", "BBL Esports", logo: "team-bbl"),
                make("fnatic", "FNATIC", logo: "team-fnatic"),
                make("fut-esports", "FUT Esports", logo: "team-fut"),
                make("gentle-mates", "Gentle Mates", logo: "team-m8"),
                make("giantx", "GIANTX", logo: "team-giantx"),
                make("karmine-corp", "Karmine Corp", logo: "team-karmine"),
                make("natus-vincere", "Natus Vincere", logo: "team-navi"),
                make("pcific-esports", "PCIFIC Esports", logo: "team-pcific"),
                make("team-heretics", "Team Heretics", logo: "team-th"),
                make("team-liquid", "Team Liquid", logo: "team-tl"),
                make("team-vitality", "Team Vitality", logo: "team-vitality"),
                make("ulf-esports", "ULF Esports", logo: "team-ulf")
            ]
        case .pac:
            return [
                make("detonation-focusme", "DetonatioN FocusMe", logo: "team-dfm"),
                make("drx", "DRX", logo: "team-drx"),
                make("full-sense", "FULL SENSE", logo: "team-fullsense"),
                make("gen-g", "Gen.G", logo: "team-geng"),
                make("global-esports", "Global Esports", logo: "team-global"),
                make("nongshim-redforce", "NONGSHIM REDFORCE", logo: "team-nongshim"),
                make("paper-rex", "Paper Rex", logo: "team-prx"),
                make("rex-regum-qeon", "Rex Regum Qeon", logo: "team-rrq"),
                make("t1", "T1", logo: "team-t1"),
                make("team-secret", "Team Secret", logo: "team-secret"),
                make("varrel", "VARREL", logo: "team-varrel"),
                make("zeta-division", "ZETA DIVISION", logo: "team-zeta")
            ]
        case .cn:
            return [
                make("all-gamers", "All Gamers", logo: "team-allgamers"),
                make("bilibili-gaming", "Guangzhou Huadu Bilibili Gaming", logo: "team-bilibili"),
                make("dragon-ranger-gaming", "Dragon Ranger Gaming", logo: "team-drg"),
                make("edward-gaming", "EDward Gaming", logo: "team-edg"),
                make("funplus-phoenix", "FunPlus Phoenix", logo: "team-fpx"),
                make("jdg-esports", "JD Mall JDG Esports", logo: "team-jdg"),
                make("nova-esports", "Nova Esports", logo: "team-nova"),
                make("titan-esports-club", "Wuxi Titan Esports Club", logo: "team-titan"),
                make("trace-esports", "Trace Esports", logo: "team-trace"),
                make("tyloo", "TYLOO", logo: "team-tyloo"),
                make("wolves-esports", "Wolves Esports", logo: "team-wolves"),
                make("xi-lai-gaming", "Xi Lai Gaming", logo: "team-xlg")
            ]
        }
    }

    private static func make(_ slug: String, _ displayName: String, logo: String? = nil) -> Team {
        Team(id: slug, slug: slug, displayName: displayName, logoAssetName: logo ?? "team-\(slug)")
    }
}
