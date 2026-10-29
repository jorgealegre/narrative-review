import SwiftUI

// A small, dependency-free, line-at-a-time syntax highlighter for the code player.
// One pass over the UTF-8 bytes of a line; token boundaries only fall on ASCII bytes,
// so every token is a valid Substring and the tokens concatenate back to the line.
// Multi-line strings and block comments are not tracked across lines.

nonisolated enum CodeLanguage: String, Sendable {
    case swift, go, python, typescript, javascript, kotlin, java, sql, yaml, json, markdown, shell, ruby, objc, plain

    static func detect(path: String) -> CodeLanguage {
        let name = (path.split(separator: "/").last.map(String.init) ?? path).lowercased()
        switch name {
        case "makefile", "gnumakefile", "dockerfile", "containerfile", ".bashrc", ".zshrc", ".profile", ".bash_profile", ".zprofile", ".envrc":
            return .shell
        case "podfile", "gemfile", "fastfile", "rakefile", "brewfile", "appfile", "matchfile", "dangerfile":
            return .ruby
        case "package.resolved":
            return .json
        default:
            break
        }
        if name.hasPrefix("dockerfile.") || name.hasSuffix(".dockerfile") { return .shell }
        guard let dot = name.lastIndex(of: "."), dot != name.startIndex else { return .plain }
        switch name[name.index(after: dot)...] {
        case "swift": return .swift
        case "go": return .go
        case "py", "pyi", "pyw": return .python
        case "ts", "tsx", "mts", "cts": return .typescript
        case "js", "jsx", "mjs", "cjs": return .javascript
        case "kt", "kts": return .kotlin
        case "java": return .java
        case "sql": return .sql
        case "yml", "yaml": return .yaml
        case "json", "jsonc", "json5": return .json
        case "md", "markdown", "mdx": return .markdown
        case "sh", "zsh", "bash", "mk", "envrc": return .shell
        case "rb", "rake", "gemspec", "podspec": return .ruby
        case "m", "mm", "h": return .objc
        default: return .plain
        }
    }
}

nonisolated enum TokenKind: Sendable {
    case plain, keyword, type, string, number, comment, attribute, function, punctuation, key
}

nonisolated struct Token: Sendable, Hashable {
    var text: Substring
    var kind: TokenKind
}

nonisolated struct CodeTheme: Sendable {
    /// Kinds without a color inherit the view's foreground style (so diff fades still apply).
    var colors: [TokenKind: Color]

    static let `default` = CodeTheme(colors: [
        .keyword: Color.purple,
        .type: Color.teal,
        .string: Color.red.mix(with: .orange, by: 0.35),
        .number: Color.blue,
        .comment: Color.gray,
        .attribute: Color.orange,
        .function: Color.blue.mix(with: .cyan, by: 0.5),
        .key: Color.teal,
    ])
}

nonisolated enum SyntaxHighlighter {
    /// Tokenizes one line. Multi-line comments and strings are not tracked across lines
    /// (a line that starts inside a block comment is tokenized as code).
    static func tokens(_ line: String, language: CodeLanguage) -> [Token] {
        if line.isEmpty { return [] }
        if language == .plain { return [Token(text: line[...], kind: .plain)] }
        var scanner = Scanner(bytes: Array(line.utf8), language: language)
        scanner.run()
        return materialize(line, scanner.spans)
    }

    /// Builds an AttributedString with SwiftUI foreground colors from a `CodeTheme`.
    static func attributed(_ line: String, language: CodeLanguage, theme: CodeTheme = .default) -> AttributedString {
        var out = AttributedString()
        for token in tokens(line, language: language) {
            var piece = AttributedString(String(token.text))
            if let color = theme.colors[token.kind] { piece.swiftUI.foregroundColor = color }
            out.append(piece)
        }
        return out
    }

    private static func materialize(_ line: String, _ spans: [Span]) -> [Token] {
        var tokens: [Token] = []
        tokens.reserveCapacity(spans.count)
        let utf8 = line.utf8
        var start = line.startIndex
        var startOffset = 0
        for span in spans {
            let end = utf8.index(start, offsetBy: span.end - startOffset)
            tokens.append(Token(text: line[start..<end], kind: span.kind))
            start = end
            startOffset = span.end
        }
        return tokens
    }
}

// MARK: - Language rules

nonisolated private struct Span {
    var end: Int
    var kind: TokenKind
}

nonisolated private struct Rules: Sendable {
    var keywords: Set<String> = []
    var builtins: Set<String> = []
    var definers: Set<String> = []
    var lineComments: [[UInt8]] = []
    var hashCommentNeedsSpace = false
    var blockComments = false
    var quotes: [UInt8] = []
    var tripleQuotes = false
    var attributes = false
    var capitalizedTypes = false
    var caseInsensitive = false
    var poundDirectives = false
    var stringPrefixes = false
    var quotedKeys = false
    var yaml = false
    var shell = false
    var ruby = false
    var objc = false
    var callBeatsCapital = false

    private static func words(_ s: String) -> Set<String> { Set(s.split(separator: " ").map(String.init)) }
    private static func bytes(_ s: String) -> [UInt8] { Array(s.utf8) }

    static func of(_ language: CodeLanguage) -> Rules {
        switch language {
        case .swift: return swift
        case .go: return go
        case .python: return python
        case .typescript: return typescript
        case .javascript: return javascript
        case .kotlin: return kotlin
        case .java: return java
        case .sql: return sql
        case .yaml: return yamlRules
        case .json: return json
        case .shell: return shellRules
        case .ruby: return rubyRules
        case .objc: return objcRules
        case .markdown, .plain: return Rules()
        }
    }

    static let swift: Rules = {
        var r = Rules()
        r.keywords = words("associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private precedencegroup protocol public rethrows static struct subscript typealias var break case catch continue default defer do else fallthrough for guard if in repeat return throw switch where while as false is nil self Self super throws true try await async actor any some get set willSet didSet mutating nonmutating override lazy weak unowned final required convenience optional indirect nonisolated isolated consuming borrowing sending macro package each")
        r.definers = ["func"]
        r.lineComments = [bytes("//")]
        r.blockComments = true
        r.quotes = bytes("\"")
        r.tripleQuotes = true
        r.attributes = true
        r.capitalizedTypes = true
        r.poundDirectives = true
        return r
    }()

    static let go: Rules = {
        var r = Rules()
        r.keywords = words("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil iota")
        r.builtins = words("bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any comparable")
        r.definers = ["func"]
        r.lineComments = [bytes("//")]
        r.blockComments = true
        r.quotes = bytes("\"'`")
        r.capitalizedTypes = true
        r.callBeatsCapital = true
        return r
    }()

    static let python: Rules = {
        var r = Rules()
        r.keywords = words("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self cls")
        r.builtins = words("int str float bool list dict set tuple bytes bytearray object complex frozenset")
        r.definers = ["def"]
        r.lineComments = [bytes("#")]
        r.quotes = bytes("\"'")
        r.tripleQuotes = true
        r.attributes = true
        r.capitalizedTypes = true
        r.stringPrefixes = true
        return r
    }()

    static let javascript: Rules = {
        var r = Rules()
        r.keywords = words("break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of static get set true false null undefined from as")
        r.definers = ["function"]
        r.lineComments = [bytes("//")]
        r.blockComments = true
        r.quotes = bytes("\"'`")
        r.attributes = true
        r.capitalizedTypes = true
        return r
    }()

    static let typescript: Rules = {
        var r = javascript
        r.keywords.formUnion(words("interface type enum implements namespace declare readonly private protected public abstract keyof infer is satisfies"))
        r.builtins = words("string number boolean any unknown never object symbol bigint")
        return r
    }()

    static let kotlin: Rules = {
        var r = Rules()
        r.keywords = words("as break class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while by catch constructor init finally get set import companion data sealed enum inner open override private protected public internal lateinit suspend inline abstract final const operator infix reified vararg tailrec crossinline noinline out where value")
        r.definers = ["fun"]
        r.lineComments = [bytes("//")]
        r.blockComments = true
        r.quotes = bytes("\"'")
        r.tripleQuotes = true
        r.attributes = true
        r.capitalizedTypes = true
        return r
    }()

    static let java: Rules = {
        var r = Rules()
        r.keywords = words("abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while true false null var record sealed permits yield")
        r.builtins = words("boolean byte char short int long float double void")
        r.lineComments = [bytes("//")]
        r.blockComments = true
        r.quotes = bytes("\"'")
        r.tripleQuotes = true
        r.attributes = true
        r.capitalizedTypes = true
        return r
    }()

    static let objcRules: Rules = {
        var r = Rules()
        r.keywords = words("auto break case const continue default do else enum extern for goto if inline register return sizeof static struct switch typedef union volatile while self super nil Nil YES NO NULL instancetype id in out nonatomic atomic strong weak copy assign readonly readwrite nullable nonnull __block __weak __strong true false")
        r.builtins = words("void int char short long float double unsigned signed BOOL bool NSInteger NSUInteger CGFloat")
        r.lineComments = [bytes("//")]
        r.blockComments = true
        r.quotes = bytes("\"'")
        r.attributes = true
        r.capitalizedTypes = true
        r.poundDirectives = true
        r.objc = true
        return r
    }()

    static let sql: Rules = {
        var r = Rules()
        r.keywords = words("select from where and or not null is in join left right inner outer full cross on as group by order having limit offset insert into values update set delete create replace table view index drop alter add column primary key foreign references distinct case when then else end union all exists between like ilike asc desc with recursive over partition window qualify unnest struct array except intersect interval cast safe_cast true false if declare begin commit rollback returning default unique constraint temp temporary materialized using natural rows range preceding following current row unbounded")
        r.builtins = words("int int64 integer bigint smallint numeric decimal float float64 double real string varchar char text bool boolean date datetime time timestamp bytes json")
        r.lineComments = [bytes("--")]
        r.blockComments = true
        r.quotes = bytes("'\"`")
        r.caseInsensitive = true
        return r
    }()

    static let yamlRules: Rules = {
        var r = Rules()
        r.keywords = words("true false null yes no on off True False Null TRUE FALSE NULL Yes No")
        r.lineComments = [bytes("#")]
        r.hashCommentNeedsSpace = true
        r.quotes = bytes("\"'")
        r.quotedKeys = true
        r.yaml = true
        return r
    }()

    static let json: Rules = {
        var r = Rules()
        r.keywords = words("true false null")
        r.lineComments = [bytes("//")]
        r.quotes = bytes("\"")
        r.quotedKeys = true
        return r
    }()

    static let shellRules: Rules = {
        var r = Rules()
        r.keywords = words("if then else elif fi for while until do done case esac in function select return export local readonly declare unset time")
        r.definers = ["function"]
        r.lineComments = [bytes("#")]
        r.hashCommentNeedsSpace = true
        r.quotes = bytes("\"'")
        r.shell = true
        return r
    }()

    static let rubyRules: Rules = {
        var r = Rules()
        r.keywords = words("alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield require require_relative attr_accessor attr_reader attr_writer private protected public lambda proc raise")
        r.definers = ["def"]
        r.lineComments = [bytes("#")]
        r.quotes = bytes("\"'`")
        r.capitalizedTypes = true
        r.ruby = true
        return r
    }()
}

// MARK: - Scanner

nonisolated private struct Scanner {
    let b: [UInt8]
    let n: Int
    let language: CodeLanguage
    let rules: Rules
    var spans: [Span] = []

    // Shell state: true while the next word is in command position.
    private var commandPosition = true
    private var commandAfterSpace = false
    // True right after a definer keyword (func, def, fun, function).
    private var afterDefiner = false

    init(bytes: [UInt8], language: CodeLanguage) {
        b = bytes
        n = bytes.count
        self.language = language
        rules = Rules.of(language)
        spans.reserveCapacity(16)
    }

    // MARK: Byte classes

    private static let space = UInt8(ascii: " "), tab = UInt8(ascii: "\t")
    private static let dquote = UInt8(ascii: "\""), squote = UInt8(ascii: "'"), backtick = UInt8(ascii: "`")
    private static let backslash = UInt8(ascii: "\\"), slash = UInt8(ascii: "/"), star = UInt8(ascii: "*")
    private static let hash = UInt8(ascii: "#"), atSign = UInt8(ascii: "@"), dollar = UInt8(ascii: "$")
    private static let colon = UInt8(ascii: ":"), dot = UInt8(ascii: "."), dash = UInt8(ascii: "-")
    private static let lparen = UInt8(ascii: "("), rparen = UInt8(ascii: ")")
    private static let lbracket = UInt8(ascii: "["), rbracket = UInt8(ascii: "]")
    private static let lbrace = UInt8(ascii: "{"), rbrace = UInt8(ascii: "}")
    private static let equals = UInt8(ascii: "="), plus = UInt8(ascii: "+"), underscore = UInt8(ascii: "_")
    private static let bang = UInt8(ascii: "!"), gt = UInt8(ascii: ">"), tilde = UInt8(ascii: "~")
    private static let amp = UInt8(ascii: "&"), pipe = UInt8(ascii: "|"), semicolon = UInt8(ascii: ";")
    private static let question = UInt8(ascii: "?")

    @inline(__always) private static func isSpace(_ c: UInt8) -> Bool { c == space || c == tab || c == 13 }
    @inline(__always) private static func isDigit(_ c: UInt8) -> Bool { c >= 48 && c <= 57 }
    @inline(__always) private static func isUpper(_ c: UInt8) -> Bool { c >= 65 && c <= 90 }
    @inline(__always) private static func isAlpha(_ c: UInt8) -> Bool { (c | 0x20) >= 97 && (c | 0x20) <= 122 }
    @inline(__always) private static func isIdentStart(_ c: UInt8) -> Bool { isAlpha(c) || c == underscore || c >= 0x80 }
    @inline(__always) private static func isIdent(_ c: UInt8) -> Bool { isIdentStart(c) || isDigit(c) }
    @inline(__always) private static func isShellWord(_ c: UInt8) -> Bool {
        isIdent(c) || c == dash || c == dot || c == slash || c == tilde || c == plus || c == UInt8(ascii: "%") || c == UInt8(ascii: ",")
    }

    @inline(__always) private func at(_ i: Int) -> UInt8 { i < n ? b[i] : 0 }

    // MARK: Emission

    private mutating func emit(_ end: Int, _ kind: TokenKind) {
        let end = min(end, n)
        if let last = spans.last {
            guard end > last.end else { return }
            if last.kind == kind { spans[spans.count - 1].end = end; return }
        } else if end <= 0 {
            return
        }
        spans.append(Span(end: end, kind: kind))
    }

    private func word(_ s: Int, _ e: Int) -> String {
        String(decoding: b[s..<e], as: UTF8.self)
    }

    // MARK: Main loop

    mutating func run() {
        if language == .markdown { runMarkdown(); return }
        var i = rules.yaml ? yamlKeyPrefix() : 0
        while i < n {
            let c = b[i]

            if Self.isSpace(c) {
                var j = i + 1
                while j < n, Self.isSpace(b[j]) { j += 1 }
                emit(j, .plain)
                if commandAfterSpace { commandPosition = true; commandAfterSpace = false }
                i = j
                continue
            }

            if startsLineComment(i) { emit(n, .comment); return }

            if rules.blockComments, c == Self.slash, at(i + 1) == Self.star {
                i = blockCommentEnd(i + 2)
                emit(i, .comment)
                continue
            }

            if rules.quotes.contains(c) {
                i = scanStringToken(i, c)
                afterDefiner = false
                continue
            }

            if c == Self.atSign, let end = scanAt(i) {
                i = end
                continue
            }

            if c == Self.hash, rules.poundDirectives, Self.isIdentStart(at(i + 1)) {
                var j = i + 1
                while j < n, Self.isIdent(b[j]) { j += 1 }
                emit(j, rules.objc ? .keyword : .attribute)
                i = j
                continue
            }

            if c == Self.dollar, rules.shell || rules.ruby {
                i = scanDollar(i)
                emit(i, .attribute)
                commandPosition = false
                continue
            }

            if rules.yaml, c == Self.amp || c == Self.star || c == Self.bang,
               i == 0 || Self.isSpace(b[i - 1]), Self.isIdentStart(at(i + 1)) || at(i + 1) == Self.bang {
                var j = i + 1
                while j < n, !Self.isSpace(b[j]) { j += 1 }
                emit(j, .attribute)
                i = j
                continue
            }

            if rules.ruby, c == Self.colon, Self.isIdentStart(at(i + 1)), i == 0 || (b[i - 1] != Self.colon && !Self.isIdent(b[i - 1])) {
                var j = i + 1
                while j < n, Self.isIdent(b[j]) { j += 1 }
                emit(j, .attribute)
                i = j
                continue
            }

            if Self.isDigit(c), !(rules.shell && commandPosition) {
                i = scanNumber(i)
                emit(i, .number)
                afterDefiner = false
                if rules.shell { commandPosition = false }
                continue
            }

            if rules.shell ? Self.isShellWord(c) : Self.isIdentStart(c) {
                i = scanWord(i)
                continue
            }

            // Punctuation and anything else.
            emit(i + 1, .punctuation)
            if rules.shell {
                commandPosition = c == Self.pipe || c == Self.semicolon || c == Self.amp || c == Self.lparen
                    || c == Self.lbrace || c == Self.backtick || c == Self.bang || c == Self.atSign
            }
            afterDefiner = false
            i += 1
        }
    }

    // MARK: Pieces

    private func startsLineComment(_ i: Int) -> Bool {
        for prefix in rules.lineComments where i + prefix.count <= n {
            var match = true
            for k in 0..<prefix.count where b[i + k] != prefix[k] { match = false; break }
            guard match else { continue }
            if prefix == [Self.hash], rules.hashCommentNeedsSpace, i > 0, !Self.isSpace(b[i - 1]) { continue }
            return true
        }
        return false
    }

    private func blockCommentEnd(_ from: Int) -> Int {
        var j = from
        while j + 1 < n {
            if b[j] == Self.star, b[j + 1] == Self.slash { return j + 2 }
            j += 1
        }
        return n
    }

    /// Returns the end of the string that starts at `i` with quote `q` (end of line if unterminated).
    private func stringEnd(_ i: Int, _ q: UInt8) -> Int {
        if rules.tripleQuotes, q != Self.backtick, at(i + 1) == q, at(i + 2) == q {
            var j = i + 3
            while j + 2 < n {
                if b[j] == Self.backslash { j += 2; continue }
                if b[j] == q, b[j + 1] == q, b[j + 2] == q { return j + 3 }
                j += 1
            }
            return n
        }
        let escapes = !(rules.shell && q == Self.squote) && language != .sql
        var j = i + 1
        while j < n {
            let c = b[j]
            if c == Self.backslash, escapes { j += 2; continue }
            if c == q { return j + 1 }
            j += 1
        }
        return n
    }

    private mutating func scanStringToken(_ i: Int, _ q: UInt8) -> Int {
        if rules.shell, q == Self.dquote { return scanShellDoubleQuoted(i) }
        let end = min(stringEnd(i, q), n)
        var kind = TokenKind.string
        if rules.quotedKeys {
            var k = end
            while k < n, Self.isSpace(b[k]) { k += 1 }
            if at(k) == Self.colon, rules.yaml ? (k + 1 >= n || Self.isSpace(b[k + 1])) : true { kind = .key }
        }
        emit(end, kind)
        if rules.shell { commandPosition = false }
        return end
    }

    /// Shell double-quoted string, with `$VAR` / `${VAR}` inside marked as attributes.
    private mutating func scanShellDoubleQuoted(_ i: Int) -> Int {
        var j = i + 1
        while j < n {
            let c = b[j]
            if c == Self.backslash { j += 2; continue }
            if c == Self.dquote { j += 1; break }
            if c == Self.dollar, Self.isIdentStart(at(j + 1)) || at(j + 1) == Self.lbrace || Self.isDigit(at(j + 1)) {
                emit(j, .string)
                j = scanDollar(j)
                emit(j, .attribute)
                continue
            }
            j += 1
        }
        emit(j, .string)
        commandPosition = false
        return min(j, n)
    }

    /// `$VAR`, `${VAR}`, `$1`, `$@`, … Returns the end; a lone `$` is one byte.
    private func scanDollar(_ i: Int) -> Int {
        let c = at(i + 1)
        if c == Self.lbrace {
            var j = i + 2
            while j < n, b[j] != Self.rbrace { j += 1 }
            return min(j + 1, n)
        }
        if Self.isIdentStart(c), c < 0x80 {
            var j = i + 2
            while j < n, Self.isIdent(b[j]), b[j] < 0x80 { j += 1 }
            return j
        }
        if Self.isDigit(c) || c == Self.atSign || c == Self.star || c == Self.hash || c == Self.question
            || c == Self.dollar || c == Self.bang || c == Self.dash {
            return i + 2
        }
        return i + 1
    }

    /// `@attribute`, ObjC `@keyword` / `@"string"`, Ruby `@ivar`. Nil when `@` is just an operator.
    private mutating func scanAt(_ i: Int) -> Int? {
        if rules.objc, at(i + 1) == Self.dquote {
            let end = stringEnd(i + 1, Self.dquote)
            emit(end, .string)
            return end
        }
        var start = i + 1
        if rules.ruby, at(start) == Self.atSign { start += 1 }
        guard rules.attributes || rules.ruby, Self.isIdentStart(at(start)) else { return nil }
        var j = start
        while j < n {
            if Self.isIdent(b[j]) { j += 1; continue }
            if b[j] == Self.dot, rules.attributes, !rules.objc, Self.isIdentStart(at(j + 1)) { j += 1; continue }
            break
        }
        emit(j, rules.objc ? .keyword : .attribute)
        afterDefiner = false
        return j
    }

    private func scanNumber(_ i: Int) -> Int {
        let hex = b[i] == UInt8(ascii: "0") && (at(i + 1) | 0x20) == UInt8(ascii: "x")
        var j = i + 1
        while j < n {
            let c = b[j]
            if Self.isIdent(c), c < 0x80 { j += 1; continue }
            if c == Self.dot, Self.isDigit(at(j + 1)) { j += 1; continue }
            if !hex, c == Self.plus || c == Self.dash, (b[j - 1] | 0x20) == UInt8(ascii: "e"), Self.isDigit(at(j + 1)) { j += 1; continue }
            break
        }
        return j
    }

    private mutating func scanWord(_ i: Int) -> Int {
        var j = i + 1
        if rules.shell {
            while j < n, Self.isShellWord(b[j]) { j += 1 }
        } else {
            while j < n, Self.isIdent(b[j]) { j += 1 }
            if rules.ruby, at(j) == Self.question || at(j) == Self.bang { j += 1 }
        }

        // Python string prefixes: f"…", r'…', b"…", rb"…"
        if rules.stringPrefixes, j - i <= 2, rules.quotes.contains(at(j)),
           b[i..<j].allSatisfy({ "rRbBfFuU".utf8.contains($0) }) {
            let end = stringEnd(j, b[j])
            emit(end, .string)
            return end
        }

        let text = word(i, j)
        let lookup = rules.caseInsensitive ? text.lowercased() : text

        if rules.shell {
            emit(j, shellKind(lookup, end: j))
            return j
        }

        let kind: TokenKind
        if rules.keywords.contains(lookup) {
            kind = .keyword
        } else if rules.builtins.contains(lookup) {
            kind = .type
        } else if afterDefiner {
            kind = .function
        } else if at(j) == Self.lparen, rules.callBeatsCapital || !Self.isUpper(b[i]) {
            kind = .function
        } else if rules.capitalizedTypes, Self.isUpper(b[i]) {
            kind = .type
        } else if at(j) == Self.lparen {
            kind = .function
        } else {
            kind = .plain
        }
        afterDefiner = kind == .keyword && rules.definers.contains(lookup)
        emit(j, kind)
        return j
    }

    private mutating func shellKind(_ word: String, end j: Int) -> TokenKind {
        if afterDefiner {
            afterDefiner = false
            return .function
        }
        if rules.keywords.contains(word) {
            afterDefiner = rules.definers.contains(word)
            commandPosition = ["if", "then", "else", "elif", "do", "while", "until", "time"].contains(word)
            return .keyword
        }
        if at(j) == Self.equals, commandPosition {
            commandPosition = false
            commandAfterSpace = true
            return .attribute
        }
        if commandPosition {
            commandPosition = false
            return .function
        }
        return at(j) == Self.lparen ? .function : .plain
    }

    // MARK: YAML

    /// Handles `- ` list markers and an unquoted `key:` at the start of a YAML line. Returns where to continue.
    private mutating func yamlKeyPrefix() -> Int {
        var j = 0
        while true {
            while j < n, Self.isSpace(b[j]) { j += 1 }
            guard at(j) == Self.dash, j + 1 >= n || Self.isSpace(b[j + 1]) else { break }
            emit(j, .plain)
            emit(j + 1, .punctuation)
            j += 1
        }
        guard j < n else { return j }
        let first = b[j]
        let forbidden: [UInt8] = Array("\"'{[&*!|>%@#`-?:,".utf8)
        if forbidden.contains(first) { return j }
        var k = j
        while k < n {
            let c = b[k]
            if c == Self.colon, k + 1 >= n || Self.isSpace(b[k + 1]) {
                emit(j, .plain)
                emit(k, .key)
                emit(k + 1, .punctuation)
                return k + 1
            }
            if c == Self.hash, k > 0, Self.isSpace(b[k - 1]) { break }
            k += 1
        }
        return j
    }

    // MARK: Markdown

    private mutating func runMarkdown() {
        var j = 0
        while j < n, Self.isSpace(b[j]) { j += 1 }
        emit(j, .plain)
        guard j < n else { return }
        let c = b[j]

        // Fenced code block marker.
        if (c == Self.backtick || c == Self.tilde), at(j + 1) == c, at(j + 2) == c {
            emit(n, .string)
            return
        }
        // ATX heading.
        if c == Self.hash {
            var k = j
            while k < n, b[k] == Self.hash { k += 1 }
            if k - j <= 6, k == n || Self.isSpace(b[k]) {
                emit(n, .keyword)
                return
            }
        }
        // Blockquote.
        if c == Self.gt {
            emit(n, .comment)
            return
        }
        // Horizontal rule: three or more of the same -, *, _ (spaces allowed).
        if c == Self.dash || c == Self.star || c == Self.underscore {
            var count = 0, k = j, rule = true
            while k < n {
                if b[k] == c { count += 1 } else if !Self.isSpace(b[k]) { rule = false; break }
                k += 1
            }
            if rule, count >= 3 { emit(n, .punctuation); return }
        }
        // List markers.
        if c == Self.dash || c == Self.star || c == Self.plus, at(j + 1) == Self.space {
            emit(j + 1, .punctuation)
            j += 1
        } else if Self.isDigit(c) {
            var k = j
            while k < n, Self.isDigit(b[k]) { k += 1 }
            if at(k) == Self.dot || at(k) == Self.rparen, at(k + 1) == Self.space {
                emit(k + 1, .punctuation)
                j = k + 1
            }
        }
        markdownInline(from: j)
    }

    private mutating func markdownInline(from start: Int) {
        var i = start
        while i < n {
            let c = b[i]
            if c == Self.backtick {
                var run = i
                while run < n, b[run] == Self.backtick { run += 1 }
                let ticks = run - i
                var k = run, close = -1
                while k < n {
                    if b[k] == Self.backtick {
                        var e = k
                        while e < n, b[e] == Self.backtick { e += 1 }
                        if e - k == ticks { close = e; break }
                        k = e
                    } else {
                        k += 1
                    }
                }
                if close > 0 { emit(close, .string); i = close } else { emit(run, .plain); i = run }
                continue
            }
            if c == Self.lbracket || (c == Self.bang && at(i + 1) == Self.lbracket), let end = markdownLink(i) {
                i = end
                continue
            }
            if c == Self.star || c == Self.underscore, at(i + 1) == c {
                var k = i + 2
                var close = -1
                while k + 1 < n {
                    if b[k] == c, b[k + 1] == c { close = k + 2; break }
                    k += 1
                }
                if close > i + 4 { emit(close, .keyword); i = close; continue }
            }
            emit(i + 1, .plain)
            i += 1
        }
    }

    /// `[text](url)` or `![alt](url)`. Nil when the brackets don't form a link.
    private mutating func markdownLink(_ i: Int) -> Int? {
        let open = b[i] == Self.bang ? i + 1 : i
        var k = open + 1
        while k < n, b[k] != Self.rbracket { k += 1 }
        guard k < n, at(k + 1) == Self.lparen else { return nil }
        var u = k + 2
        while u < n, b[u] != Self.rparen { u += 1 }
        guard u < n else { return nil }
        emit(open + 1, .punctuation)
        emit(k, .function)
        emit(k + 2, .punctuation)
        emit(u, .attribute)
        emit(u + 1, .punctuation)
        return u + 1
    }
}
