import AppKit
import CoreText
import Foundation

func outlined(_ text: String, size: CGFloat, x: CGFloat, baseline: CGFloat, color: String) -> String {
    let font = CTFontCreateWithName("AppleSDGothicNeo-Heavy" as CFString, size, nil)
    let attr = NSAttributedString(string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
    let line = CTLineCreateWithAttributedString(attr)
    var result = "<g fill=\"\(color)\" transform=\"translate(\(x) \(baseline)) scale(1 -1)\">"
    for run in CTLineGetGlyphRuns(line) as! [CTRun] {
        let count = CTRunGetGlyphCount(run)
        var glyphs = [CGGlyph](repeating: 0, count: count)
        var positions = [CGPoint](repeating: .zero, count: count)
        CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
        CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
        for i in 0..<count {
            var transform = CGAffineTransform(translationX: positions[i].x, y: positions[i].y)
            guard let path = CTFontCreatePathForGlyph(font, glyphs[i], &transform) else { continue }
            var d = ""
            path.applyWithBlock { item in
                let e = item.pointee
                func p(_ i: Int) -> String { String(format:"%.2f %.2f", e.points[i].x,e.points[i].y) }
                switch e.type {
                    case .moveToPoint: d += "M" + p(0)
                    case .addLineToPoint: d += "L" + p(0)
                    case .addQuadCurveToPoint: d += "Q" + p(0) + " " + p(1)
                    case .addCurveToPoint: d += "C" + p(0) + " " + p(1) + " " + p(2)
                    case .closeSubpath: d += "Z"
                    @unknown default: break
                }
            }
            result += "<path d=\"\(d)\"/>"
        }
    }
    return result + "</g>"
}


let result = "<svg xmlns=\"http://www.w3.org/2000/svg\" x=\"0\" y=\"0\" width=\"200\" height=\"168\" viewBox=\"0 0 200 168\">" + outlined("우가 PICK", size: 23, x: 56, baseline: 145, color: "#3F3028") + "</svg>"
let output = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("badge-label.svg")
try result.write(to: output, atomically: true, encoding: .utf8)
print("Badge label paths exported")
