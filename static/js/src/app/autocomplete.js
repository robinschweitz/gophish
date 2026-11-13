var TEMPLATE_TAGS = [{
        id: 1,
        name: 'RId',
        description: 'The unique ID for the recipient.'
    },
    {
        id: 2,
        name: 'FirstName',
        description: 'The recipient\'s first name.'
    },
    {
        id: 3,
        name: 'LastName',
        description: 'The recipient\'s last name.'
    },
    {
        id: 4,
        name: 'Position',
        description: 'The recipient\'s position.'
    },
    {
        id: 5,
        name: 'From',
        description: 'The address emails are sent from.'
    },
    {
        id: 6,
        name: 'TrackingURL',
        description: 'The URL to track emails being opened.'
    },
    {
        id: 7,
        name: 'Tracker',
        description: 'An HTML tag that adds a hidden tracking image (recommended instead of TrackingURL).'
    },
    {
        id: 8,
        name: 'URL',
        description: 'The URL to your Gophish listener.'
    },
    {
        id: 9,
        name: 'BaseURL',
        description: 'The base URL with the path and rid parameter stripped. Useful for making links to static files.'
    },
    {
        id: 10,
        name: 'Email',
        description: 'The recipient email address.'
    }
];

var GOPHISH_HTML_COMPLETIONS = [
    '{{.FirstName}}', '{{.LastName}}', '{{.Email}}', '{{.Position}}', '{{.RId}}',
    '{{.From}}', '{{.URL}}', '{{.BaseURL}}', '{{.TrackingURL}}', '{{.Tracker}}',
    '{{.Scenario.CompanyName}}', '{{.Scenario.Message}}',
    '{{upper .FirstName}}', '{{lower .Email}}', '{{title .FirstName}}',
    '{{urlquery .Email}}', '{{default "there" .FirstName}}'
]

var gophishCodeEditors = {}

function getGophishVisualEditorHeight() {
    return Math.max(420, Math.min(680, Math.round(window.innerHeight * 0.62)))
}

function resizeGophishVisualEditor(editor) {
    if (editor && editor.resize) editor.resize("100%", getGophishVisualEditorHeight())
}

var textTestCallback = function (range) {
    if (!range.collapsed) {
        return null;
    }

    return CKEDITOR.plugins.textMatch.match(range, matchCallback);
}

var matchCallback = function (text, offset) {
    var pattern = /\{{2}\.?([A-z]|\})*$/,
        match = text.slice(0, offset)
        .match(pattern);

    if (!match) {
        return null;
    }

    return {
        start: match.index,
        end: offset
    };
}

/**
 * 
 * @param {regex} matchInfo - The matched text object
 * @param {function} callback - The callback to execute with the matched data
 */
var dataCallback = function (matchInfo, callback) {
    var data = TEMPLATE_TAGS.filter(function (item) {
        var itemName = '{{.' + item.name.toLowerCase() + '}}';
        return itemName.indexOf(matchInfo.query.toLowerCase()) == 0;
    });

    callback(data);
}

/**
 * 
 * @param {CKEditor} editor - The CKEditor instance.
 * 
 * Installs the autocomplete plugin to the CKEditor.
 */
var setupAutocomplete = function (editor) {
    editor.on('instanceReady', function (evt) {
        var itemTemplate = '<li data-id="{id}">' +
            '<div><strong class="item-title">{name}</strong></div>' +
            '<div><i>{description}</i></div>' +
            '</li>',
            outputTemplate = '[[.{name}]]';

        var autocomplete = new CKEDITOR.plugins.autocomplete(evt.editor, {
            textTestCallback: textTestCallback,
            dataCallback: dataCallback,
            itemTemplate: itemTemplate,
            outputTemplate: outputTemplate
        });

        // We have to use brackets for the output template tag and 
        // then manually replace them due to the way CKEditor's 
        // templating works.
        autocomplete.getHtmlToInsert = function (item) {
            var parsedTemplate = this.outputTemplate.output(item);
            parsedTemplate = parsedTemplate.replace("[[", "{{").replace("]]", "}}")
            return parsedTemplate
        }
    });
}

var HTML_TAG_COMPLETIONS = "a abbr address article aside audio b body blockquote br button canvas caption code dd details div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hr html i iframe img input label li link main meta nav ol option p section select small source span strong style table tbody td textarea tfoot th thead title tr ul video".split(" ")
var CSS_PROPERTY_COMPLETIONS = "align-items background background-color border border-color border-radius border-style border-width bottom box-shadow color cursor display flex flex-direction flex-wrap float font-family font-size font-style font-weight gap height justify-content left line-height margin margin-bottom margin-left margin-right margin-top max-width min-height opacity overflow padding padding-bottom padding-left padding-right padding-top position right text-align text-decoration top transform width z-index".split(" ")
var CSS_VALUE_COMPLETIONS = {
    display: ["block", "flex", "grid", "inline", "inline-block", "none"],
    position: ["absolute", "fixed", "relative", "static", "sticky"],
    "text-align": ["center", "justify", "left", "right"],
    "align-items": ["center", "flex-end", "flex-start", "stretch"],
    "justify-content": ["center", "flex-end", "flex-start", "space-around", "space-between"],
    "flex-direction": ["column", "column-reverse", "row", "row-reverse"],
    overflow: ["auto", "hidden", "scroll", "visible"],
    "background-color": ["#fff", "#000", "transparent", "white", "black"],
    color: ["#fff", "#000", "#333", "#428bca", "transparent", "white", "black"],
    "font-weight": ["400", "500", "600", "700", "bold", "normal"],
    "text-decoration": ["none", "underline", "line-through"]
}
var GENERAL_CSS_VALUE_COMPLETIONS = ["auto", "center", "inherit", "initial", "none", "unset", "100%"]

var gophishAceCompleter = {
    getCompletions: function (editor, session, position, prefix, callback) {
        var line = session.getLine(position.row).slice(0, position.column)
        var templateMatch = line.match(/\{\{\.?[A-Za-z0-9_.]*$/)
        if (templateMatch) {
            var query = templateMatch[0].slice(2).toLowerCase()
            callback(null, GOPHISH_HTML_COMPLETIONS.filter(function (value) {
                return value.slice(2).toLowerCase().indexOf(query) === 0
            }).map(function (value) {
                return { caption: value, value: value, meta: "Gophish" }
            }))
            return
        }

        var tagMatch = line.match(/<\/?([A-Za-z][A-Za-z0-9-]*)?$/)
        if (tagMatch) {
            var tagPrefix = (tagMatch[1] || "").toLowerCase()
            callback(null, HTML_TAG_COMPLETIONS.filter(function (tag) {
                return tag.indexOf(tagPrefix) === 0
            }).map(function (tag) {
                return { caption: tag, value: tag, meta: "HTML tag" }
            }))
            return
        }

        var styleText = getInlineStyleCompletionContext(session, position)
        if (styleText !== null) {
            var declaration = styleText.match(/(?:^|;)\s*([A-Za-z-]+)\s*:\s*([A-Za-z0-9#-]*)$/)
            var property = styleText.match(/(?:^|;)\s*([A-Za-z-]*)$/)
            var list = declaration ? (CSS_VALUE_COMPLETIONS[declaration[1].toLowerCase()] || GENERAL_CSS_VALUE_COMPLETIONS) : CSS_PROPERTY_COMPLETIONS
            var cssPrefix = declaration ? declaration[2].toLowerCase() : ((property && property[1]) || "").toLowerCase()
            callback(null, list.filter(function (value) {
                return value.toLowerCase().indexOf(cssPrefix) === 0
            }).map(function (value) {
                return { caption: value, value: value, meta: declaration && declaration[1] ? "CSS value" : "CSS property" }
            }))
            return
        }
        callback(null, [])
    }
}

function getInlineStyleCompletionContext(session, position) {
    var before = session.getValue().slice(0, session.doc.positionToIndex(position))
    var styleBlockStart = before.toLowerCase().lastIndexOf("<style")
    var styleBlockEnd = before.toLowerCase().lastIndexOf("</style")
    if (styleBlockStart > styleBlockEnd) {
        var contentStart = before.indexOf(">", styleBlockStart)
        return contentStart >= 0 ? before.slice(contentStart + 1) : ""
    }
    var styleAttribute = before.match(/style\s*=\s*["'][^"']*$/i)
    return styleAttribute ? styleAttribute[0].replace(/^style\s*=\s*["']/i, "") : null
}

// setupHTMLSourceEditor adds Ace with HTML, CSS, snippet and Gophish completions.
function setupHTMLSourceEditor(elementId, onChange) {
    if (gophishCodeEditors[elementId]) return gophishCodeEditors[elementId]
    var element = document.getElementById(elementId)
    if (!element || typeof ace === "undefined") return null

    var languageTools = ace.require("ace/ext/language_tools")
    var editor = ace.edit(elementId)
    editor.setTheme("ace/theme/chrome")
    editor.session.setMode("ace/mode/html")
    editor.setOptions({
        fontSize: "13px",
        showPrintMargin: false,
        showLineNumbers: true,
        showGutter: true,
        useSoftTabs: true,
        tabSize: 2,
        wrap: true,
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true
    })
    editor.completers = [gophishAceCompleter].concat(editor.completers || languageTools.textCompleters || [])
    editor.commands.addCommand({
        name: "gophishAutocomplete",
        bindKey: { win: "Ctrl-Space", mac: "Command-Space" },
        exec: function (ed) { ed.execCommand("startAutocomplete") }
    })
    editor.on("input", function () {
        var cursor = editor.getCursorPosition()
        var line = editor.session.getLine(cursor.row).slice(0, cursor.column)
        if (/<\/?[A-Za-z0-9-]*$/.test(line) || /\{\{\.?[A-Za-z0-9_.]*$/.test(line) || /style\s*=\s*["'][^"']*$/i.test(line)) {
            editor.execCommand("startAutocomplete")
        }
    })
    editor.session.on("change", function () {
        if (onChange) onChange(editor.getValue())
    })
    gophishCodeEditors[elementId] = editor
    return editor
}

function getHTMLSourceEditor(elementId) {
    return gophishCodeEditors[elementId] || null
}

function setHTMLSourceValue(elementId, value) {
    var editor = getHTMLSourceEditor(elementId)
    if (editor) {
        editor.setValue(value || "", -1)
        editor.clearSelection()
        editor.moveCursorTo(0, 0)
        editor.resize(true)
    }
    else $("#" + elementId).text(value || "")
}
