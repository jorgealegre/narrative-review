import SwiftUI

/// Solarized Dark, the way it was published (Ethan Schoonover), with a quieter gutter.
extension CodeTheme {
    static let solarizedDark = CodeTheme(colors: [
        .keyword: Color(red: 0.522, green: 0.600, blue: 0.000),      // green  #859900
        .type: Color(red: 0.710, green: 0.537, blue: 0.000),         // yellow #b58900
        .string: Color(red: 0.165, green: 0.631, blue: 0.596),       // cyan   #2aa198
        .number: Color(red: 0.827, green: 0.212, blue: 0.510),       // magenta #d33682
        .comment: Color(red: 0.345, green: 0.431, blue: 0.459),      // base01 #586e75
        .attribute: Color(red: 0.796, green: 0.294, blue: 0.086),    // orange #cb4b16
        .function: Color(red: 0.149, green: 0.545, blue: 0.824),     // blue   #268bd2
        .key: Color(red: 0.149, green: 0.545, blue: 0.824),
        .punctuation: Color(red: 0.576, green: 0.631, blue: 0.631),  // base0  #93a1a1
    ])
}

enum Stage {
    static let background = Color(red: 0.000, green: 0.169, blue: 0.212)   // base03 #002b36
    static let backgroundHighlight = Color(red: 0.027, green: 0.212, blue: 0.259) // base02 #073642
    static let text = Color(red: 0.514, green: 0.580, blue: 0.588)         // base0  #839496
    static let textBright = Color(red: 0.576, green: 0.631, blue: 0.631)   // base1  #93a1a1
    static let gutter = Color(red: 0.345, green: 0.431, blue: 0.459)       // base01 #586e75
    static let added = Color(red: 0.522, green: 0.600, blue: 0.000)
    static let removed = Color(red: 0.863, green: 0.196, blue: 0.184)      // red #dc322f
    static let accent = Color(red: 0.424, green: 0.443, blue: 0.769)       // violet #6c71c4
}
