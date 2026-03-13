import SwiftUI
import UIKit

struct TeamLogoView: View {
    let team: Team
    var size: CGFloat = 22

    var body: some View {
        if let image = UIImage(named: team.logoAssetName) {
            Image(uiImage: image)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
        } else {
            Text(team.displayName.prefix(2))
                .font(.system(size: size * 0.42, weight: .bold, design: .rounded))
                .frame(width: size, height: size)
        }
    }
}

struct SeriesProgressView: View {
    let winsA: Int
    let winsB: Int
    let bestOf: Int

    private var requiredWins: Int {
        max(1, (bestOf / 2) + 1)
    }

    var body: some View {
        HStack(spacing: 5) {
            HStack(spacing: 5) {
                ForEach(0..<requiredWins, id: \.self) { index in
                    Diamond(filled: index < winsA)
                }
            }
            Spacer(minLength: 10)
            HStack(spacing: 5) {
                ForEach(0..<requiredWins, id: \.self) { index in
                    Diamond(filled: index < winsB)
                }
            }
        }
    }
}

private struct Diamond: View {
    let filled: Bool

    var body: some View {
        Rectangle()
            .rotation(Angle(degrees: 45))
            .fill(filled ? Color.primary : Color.clear)
            .overlay {
                Rectangle()
                    .rotation(Angle(degrees: 45))
                    .stroke(Color.primary, lineWidth: 1)
            }
            .frame(width: 8, height: 8)
            .padding(2)
    }
}
