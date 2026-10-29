import Foundation
import Testing
@testable import NarrativeReview

struct SyntaxHighlighterTests {

    private func kind(_ text: String, in line: String, _ language: CodeLanguage) -> TokenKind? {
        SyntaxHighlighter.tokens(line, language: language).first { $0.text == text }?.kind
    }

    /// Kind of the token that contains `text` (adjacent plain text merges into one token).
    private func kind(containing text: String, in line: String, _ language: CodeLanguage) -> TokenKind? {
        SyntaxHighlighter.tokens(line, language: language).first { $0.text.contains(text) }?.kind
    }

    @Test func detectsLanguageByPath() {
        let cases: [(String, CodeLanguage)] = [
            ("Sources/App/Foo.swift", .swift), ("cmd/main.go", .go), ("tools/run.py", .python),
            ("web/App.tsx", .typescript), ("web/util.ts", .typescript), ("web/index.js", .javascript),
            ("app/build.gradle.kts", .kotlin), ("src/Main.kt", .kotlin), ("src/Main.java", .java),
            ("db/001.sql", .sql), (".github/workflows/ci.yml", .yaml), ("config.yaml", .yaml),
            ("package.json", .json), ("README.md", .markdown), ("scripts/build.sh", .shell),
            ("scripts/setup.zsh", .shell), ("Makefile", .shell), ("docker/Dockerfile", .shell),
            ("lib/thing.rb", .ruby), ("Classes/Foo.m", .objc), ("Classes/Foo.mm", .objc),
            ("Classes/Foo.h", .objc), ("LICENSE", .plain), ("image.png", .plain),
        ]
        for (path, expected) in cases {
            #expect(CodeLanguage.detect(path: path) == expected, "\(path)")
        }
    }

    @Test func swiftKeywordsStringsAndComments() {
        let line = #"    let greeting = "hi \"there\"" // say hello"#
        #expect(kind("let", in: line, .swift) == .keyword)
        #expect(kind(#""hi \"there\"""#, in: line, .swift) == .string)
        #expect(kind("// say hello", in: line, .swift) == .comment)
        #expect(kind(containing: "greeting", in: line, .swift) == .plain)
    }

    @Test func swiftAttributesTypesAndFunctions() {
        let line = "@MainActor final class Store: Observable { func load(id: Int) { print(id) } }"
        #expect(kind("@MainActor", in: line, .swift) == .attribute)
        #expect(kind("final", in: line, .swift) == .keyword)
        #expect(kind("Store", in: line, .swift) == .type)
        #expect(kind("Int", in: line, .swift) == .type)
        #expect(kind("load", in: line, .swift) == .function)
        #expect(kind("print", in: line, .swift) == .function)
        #expect(kind("42", in: "let n = 42", .swift) == .number)
        #expect(kind("/* inline */", in: "x /* inline */ y", .swift) == .comment)
    }

    @Test func goKeywordsBuiltinsAndCalls() {
        let line = #"func main() { var n int = 3; fmt.Println("x", n) } // done"#
        #expect(kind("func", in: line, .go) == .keyword)
        #expect(kind("main", in: line, .go) == .function)
        #expect(kind("int", in: line, .go) == .type)
        #expect(kind("Println", in: line, .go) == .function)
        #expect(kind(#""x""#, in: line, .go) == .string)
        #expect(kind("// done", in: line, .go) == .comment)
        #expect(kind("`raw`", in: "s := `raw`", .go) == .string)
        #expect(kind("Server", in: "var s *Server", .go) == .type)
    }

    @Test func pythonDecoratorAndTripleQuotedString() {
        #expect(kind("@app.route", in: #"@app.route("/items")"#, .python) == .attribute)
        let doc = #"    doc = """Return the items.""" # note"#
        #expect(kind(#""""Return the items.""""#, in: doc, .python) == .string)
        #expect(kind("# note", in: doc, .python) == .comment)
        let open = "\"\"\"Starts a docstring"
        #expect(kind(open, in: open, .python) == .string)
        #expect(kind(#"f"{x}""#, in: #"print(f"{x}")"#, .python) == .string)
        #expect(kind("def", in: "def load(self):", .python) == .keyword)
        #expect(kind("load", in: "def load(self):", .python) == .function)
    }

    @Test func kotlinAndJavaAnnotations() {
        #expect(kind("@Composable", in: "@Composable fun Screen() {}", .kotlin) == .attribute)
        #expect(kind("fun", in: "@Composable fun Screen() {}", .kotlin) == .keyword)
        #expect(kind("@Override", in: "@Override public void run() {", .java) == .attribute)
        #expect(kind("void", in: "@Override public void run() {", .java) == .type)
    }

    @Test func sqlKeywordsAndComment() {
        let line = "SELECT id, COUNT(*) FROM users WHERE name = 'bob' -- only bob"
        #expect(kind("SELECT", in: line, .sql) == .keyword)
        #expect(kind("FROM", in: line, .sql) == .keyword)
        #expect(kind("COUNT", in: line, .sql) == .function)
        #expect(kind("'bob'", in: line, .sql) == .string)
        #expect(kind("-- only bob", in: line, .sql) == .comment)
        #expect(kind("select", in: "select 1", .sql) == .keyword)
    }

    @Test func yamlKeys() {
        #expect(kind("name", in: "  name: build # the job", .yaml) == .key)
        #expect(kind("# the job", in: "  name: build # the job", .yaml) == .comment)
        #expect(kind("uses", in: "    - uses: actions/checkout@v4", .yaml) == .key)
        #expect(kind("true", in: "enabled: true", .yaml) == .keyword)
        #expect(kind(#""quoted key""#, in: #""quoted key": 1"#, .yaml) == .key)
        #expect(kind("http://x", in: "url: http://x", .yaml) == nil) // value is not a key
    }

    @Test func jsonKeyVersusStringValue() {
        let line = #"  "name": "narrative", "count": 42, "ok": true"#
        #expect(kind(#""name""#, in: line, .json) == .key)
        #expect(kind(#""narrative""#, in: line, .json) == .string)
        #expect(kind(#""count""#, in: line, .json) == .key)
        #expect(kind("42", in: line, .json) == .number)
        #expect(kind("true", in: line, .json) == .keyword)
    }

    @Test func markdownHeadingLinkCodeAndBullet() {
        let heading = SyntaxHighlighter.tokens("## Getting started", language: .markdown)
        #expect(heading.count == 1)
        #expect(heading.first?.kind == .keyword)
        let line = "- See [the docs](https://example.com) and run `make test`"
        #expect(kind("-", in: line, .markdown) == .punctuation)
        #expect(kind("the docs", in: line, .markdown) == .function)
        #expect(kind("https://example.com", in: line, .markdown) == .attribute)
        #expect(kind("`make test`", in: line, .markdown) == .string)
        #expect(kind("```swift", in: "```swift", .markdown) == .string)
    }

    @Test func shellVariablesAndCommands() {
        let line = #"echo "home is $HOME" ${PATH} | grep -q bin # check"#
        #expect(kind("echo", in: line, .shell) == .function)
        #expect(kind("$HOME", in: line, .shell) == .attribute)
        #expect(kind("${PATH}", in: line, .shell) == .attribute)
        #expect(kind("grep", in: line, .shell) == .function)
        #expect(kind(containing: "-q", in: line, .shell) == .plain)
        #expect(kind("# check", in: line, .shell) == .comment)
        let assign = "FOO=1 make build"
        #expect(kind("FOO", in: assign, .shell) == .attribute)
        #expect(kind("make", in: assign, .shell) == .function)
        #expect(kind(containing: "build", in: assign, .shell) == .plain)
        #expect(kind("if", in: "if [ -f x ]; then rm x; fi", .shell) == .keyword)
        #expect(kind("rm", in: "if [ -f x ]; then rm x; fi", .shell) == .function)
    }

    @Test func plainAndEmptyLines() {
        #expect(SyntaxHighlighter.tokens("", language: .swift).isEmpty)
        let plain = SyntaxHighlighter.tokens("anything goes", language: .plain)
        #expect(plain == [Token(text: "anything goes"[...], kind: .plain)])
    }

    @Test func tokensRoundTripToTheInputLine() {
        let samples: [(String, CodeLanguage)] = [
            (#"let s = "unterminated"#, .swift),
            ("    /* open block comment", .swift),
            (#"let café = "naïve 🚀" // ünïcödé"#, .swift),
            ("@available(iOS 17, *) #if DEBUG", .swift),
            ("x := 0x1F + 3.14e-2 - 1_000", .go),
            (#"s = b'\x00' + r"\d+" + """tri"#, .python),
            ("const t = `hi ${name}`; // é", .typescript),
            ("SELECT \"col\" FROM `t` WHERE a = 'it''s' /* c */", .sql),
            ("  - key: \"val\" # c: d", .yaml),
            (#"{"a": [1, 2.5, -3], "b": {"c": null}}"#, .json),
            ("1. **bold** and ![img](a.png) and [ref] `x", .markdown),
            (#"for f in *.swift; do echo "${f%.swift}" $1; done"#, .shell),
            ("  @name = :sym unless defined?(x) # é", .ruby),
            (#"#import <Foundation/Foundation.h> @interface Foo : NSObject @"s""#, .objc),
            ("\t\t", .kotlin),
            ("日本語のテキスト", .java),
        ]
        for (line, language) in samples {
            let tokens = SyntaxHighlighter.tokens(line, language: language)
            #expect(tokens.map { String($0.text) }.joined() == line, "\(language): \(line)")
            #expect(!tokens.contains { $0.text.isEmpty }, "\(language): \(line)")
            let attributed = SyntaxHighlighter.attributed(line, language: language)
            #expect(String(attributed.characters) == line)
        }
    }

    @Test func attributedAppliesThemeColors() {
        let attributed = SyntaxHighlighter.attributed("let x = 1", language: .swift)
        let colored = attributed.runs.compactMap { $0[AttributeScopes.SwiftUIAttributes.ForegroundColorAttribute.self] }
        #expect(colored.count == 2) // `let` and `1`; plain text inherits the view's style
    }

    @Test func tokenizesTenThousandLinesUnderOneSecond() {
        let lines = [
            #"    @MainActor func render(_ items: [Item], limit: Int = 42) -> some View { // comment"#,
            #"        let title = "Hello, \(name)!" + String(count) /* note */"#,
            #"  - name: "build and test" # step"#,
            #"SELECT id, name FROM users WHERE created_at > '2026-01-01' -- recent"#,
            #"echo "$HOME/bin" | grep -q foo && make build"#,
        ]
        let languages: [CodeLanguage] = [.swift, .swift, .yaml, .sql, .shell]
        let clock = ContinuousClock()
        var total = 0
        let elapsed = clock.measure {
            for i in 0..<10_000 {
                total += SyntaxHighlighter.tokens(lines[i % lines.count], language: languages[i % lines.count]).count
            }
        }
        #expect(total > 0)
        #expect(elapsed < .seconds(1), "took \(elapsed)")
    }
}
