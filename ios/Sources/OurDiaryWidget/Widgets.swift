import SwiftUI
import WidgetKit

@main
struct OurDiaryWidgets: WidgetBundle {
    var body: some Widget {
        GoldiesWidget()
        LatestWidget()
    }
}

// MARK: - Timeline: refreshed from the diary about every 15 minutes (iOS decides the exact moment)

struct DiaryEntry: TimelineEntry {
    var date = Date()
    var summary: DiarySummary?
    var setUp = true
}

struct DiaryProvider: TimelineProvider {
    func placeholder(in context: Context) -> DiaryEntry { DiaryEntry(summary: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (DiaryEntry) -> Void) {
        if context.isPreview { return completion(DiaryEntry(summary: DiaryData.cached() ?? .sample)) }
        Task { completion(await entry()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DiaryEntry>) -> Void) {
        Task {
            let e = await entry()
            completion(Timeline(entries: [e], policy: .after(Date().addingTimeInterval(15 * 60))))
        }
    }

    private func entry() async -> DiaryEntry {
        guard DiaryData.isSetUp else { return DiaryEntry(setUp: false) }
        let summary = (try? await DiaryData.load()) ?? DiaryData.cached()
        return DiaryEntry(summary: summary)
    }
}

extension DiarySummary {
    static let sample = DiarySummary(
        me: .init(name: "Vian", points: 140, crying: false), them: .init(name: "Jovena", points: 210, crying: false),
        streak: 4, nextPenaltyAt: Date().addingTimeInterval(2 * 3600).timeIntervalSince1970 * 1000, shieldUntil: nil,
        callsToday: 47 * 60, latest: .init(at: Date().addingTimeInterval(-7200).timeIntervalSince1970 * 1000, what: "replied"))
}

// MARK: - Look

enum Look {
    static let wine = Color(red: 0.431, green: 0.137, blue: 0.216)
    static let rose = Color(red: 0.851, green: 0.482, blue: 0.525)
    static let muted = Color(red: 0.604, green: 0.478, blue: 0.498)
    static let cream = Color(red: 0.984, green: 0.961, blue: 0.937)
    static let blush = Color(red: 0.953, green: 0.851, blue: 0.831)
    static let background = LinearGradient(colors: [cream, blush], startPoint: .top, endPoint: .bottom)
    static func script(_ size: CGFloat) -> Font { .system(size: size, weight: .regular, design: .serif).italic() }
}

func callTime(_ seconds: Int) -> String {
    let m = seconds / 60
    return m < 60 ? "\(m) min" : "\(m / 60)h \(String(format: "%02d", m % 60))m"
}

/// Shown until the app has been opened once and the secret word typed.
struct SetUpView: View {
    var body: some View {
        VStack(spacing: 6) {
            Text("🐶").font(.largeTitle)
            Text("Open Us ♥ once to set me up").font(.caption).multilineTextAlignment(.center).foregroundStyle(Look.wine)
        }
    }
}

// MARK: - Goldies 🪙

struct GoldiesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "Goldies", provider: DiaryProvider()) { entry in
            GoldiesView(entry: entry).containerBackground(Look.background, for: .widget)
        }
        .configurationDisplayName("Goldies")
        .description("Both your goldies, your days together, and when the next −50 lands.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
    }
}

struct GoldiesView: View {
    @Environment(\.widgetFamily) private var family
    var entry: DiaryEntry

    var body: some View {
        if !entry.setUp { SetUpView() }
        else if let s = entry.summary {
            switch family {
            case .systemMedium: medium(s)
            case .accessoryRectangular: rectangular(s)
            case .accessoryCircular: circular(s)
            default: small(s)
            }
        } else { Text("Can't reach the diary").font(.caption).foregroundStyle(Look.muted) }
    }

    private func countdown(_ s: DiarySummary) -> some View {
        Group {
            if let until = s.shieldUntil {
                Text("🛡 till \(Date(timeIntervalSince1970: until / 1000), style: .time)")
            } else if let next = s.nextPenalty, next > Date() {
                HStack(spacing: 3) { Text("−50 in"); Text(timerInterval: Date()...next, countsDown: true).monospacedDigit() }
            } else { Text("write something ♥") }
        }
        .font(.caption2)
        .foregroundStyle(Look.muted)
    }

    private func small(_ s: DiarySummary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(s.me.crying ? "\(s.me.name) · sad 😢" : s.me.name).font(.caption).foregroundStyle(Look.rose)
            Text("🪙 \(s.me.points)").font(.system(size: 30, weight: .regular, design: .serif)).foregroundStyle(Look.wine)
                .minimumScaleFactor(0.6).lineLimit(1)
            Text("\(s.them.name) \(s.them.points)\(s.them.crying ? " 😢" : "")").font(.caption).foregroundStyle(Look.muted)
            Spacer(minLength: 2)
            Text("🔥 \(s.streak) day\(s.streak == 1 ? "" : "s") together").font(.caption2).foregroundStyle(Look.wine)
            countdown(s)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func medium(_ s: DiarySummary) -> some View {
        VStack(spacing: 8) {
            HStack {
                person(s.me, me: true)
                VStack(spacing: 0) {
                    Text("\(s.streak)").font(Look.script(30)).foregroundStyle(Look.wine)
                    Text("days together").font(.caption2).foregroundStyle(Look.muted)
                }
                .frame(maxWidth: .infinity)
                person(s.them, me: false)
            }
            Divider().overlay(Look.rose.opacity(0.3))
            HStack {
                countdown(s)
                Spacer()
                Text("📞 \(callTime(s.callsToday)) today").font(.caption2).foregroundStyle(Look.muted)
            }
        }
    }

    private func person(_ p: DiarySummary.Person, me: Bool) -> some View {
        VStack(spacing: 0) {
            Text(p.crying ? "\(p.name) · sad" : p.name).font(.caption).foregroundStyle(me ? Look.rose : Look.muted)
            Text("\(p.points)").font(.system(size: 30, weight: .regular, design: .serif)).foregroundStyle(Look.wine)
                .minimumScaleFactor(0.6).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }

    private func rectangular(_ s: DiarySummary) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("🪙 \(s.me.points) · \(s.them.name) \(s.them.points)").font(.headline).lineLimit(1).minimumScaleFactor(0.7)
            Text("🔥 \(s.streak) days together").font(.caption)
            if let next = s.nextPenalty, s.shieldUntil == nil, next > Date() {
                HStack(spacing: 3) { Text("−50 in").font(.caption); Text(timerInterval: Date()...next, countsDown: true).font(.caption).monospacedDigit() }
            }
        }
    }

    private func circular(_ s: DiarySummary) -> some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text("🪙").font(.caption2)
                Text("\(s.me.points)").font(.system(.body, design: .rounded)).minimumScaleFactor(0.5).lineLimit(1)
            }
        }
    }
}

// MARK: - Latest from them 💌

struct LatestWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "Latest", provider: DiaryProvider()) { entry in
            LatestView(entry: entry).containerBackground(Look.background, for: .widget)
        }
        .configurationDisplayName("Latest from them")
        .description("What the other one last did in the diary, and when.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

struct LatestView: View {
    @Environment(\.widgetFamily) private var family
    var entry: DiaryEntry

    var body: some View {
        if !entry.setUp { SetUpView() }
        else if let s = entry.summary {
            if family == .accessoryRectangular {
                VStack(alignment: .leading, spacing: 1) {
                    Text("💌 \(s.them.name)").font(.headline)
                    if let when = s.latestDate, let what = s.latest?.what {
                        Text("\(what) · \(when, style: .relative) ago").font(.caption).lineLimit(2)
                    } else { Text("nothing new yet").font(.caption) }
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text("💌").font(.title2)
                    Text(s.them.name).font(Look.script(26)).foregroundStyle(Look.wine)
                    if let when = s.latestDate, let what = s.latest?.what {
                        Text(what).font(.subheadline).foregroundStyle(Look.wine)
                        Text("\(when, style: .relative) ago").font(.caption).foregroundStyle(Look.muted)
                    } else {
                        Text("hasn't written yet").font(.caption).foregroundStyle(Look.muted)
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else { Text("Can't reach the diary").font(.caption).foregroundStyle(Look.muted) }
    }
}
