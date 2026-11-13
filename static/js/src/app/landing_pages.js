/*
	landing_pages.js
	Handles the creation, editing, and deletion of landing pages
	Author: Jordan Wright <github.com/jordan-wright>
*/
var pages = []
var teams = []
var item_type = "pages"
var pageHtmlMode = "visual"
var pagePreviewTimer = null
var pagePreviewRequest = 0
var pagePendingHtml = ""
var pageVisualReady = false
var pageReadOnly = false

function getPageHtmlContent() {
    var sourceEditor = getHTMLSourceEditor("page_html_source_editor")
    if (pageHtmlMode === "source" && sourceEditor) return sourceEditor.getValue()
    var visualEditor = CKEDITOR.instances["html_editor"]
    if (visualEditor && pageVisualReady) return visualEditor.getData()
    return pagePendingHtml || ""
}

function setPageHtmlContent(html) {
    html = html || ""
    pagePendingHtml = html
    pageVisualReady = false
    var visualEditor = CKEDITOR.instances["html_editor"]
    if (visualEditor) {
        if ($("#modal").is(":visible")) visualEditor.setData(html, function () { pageVisualReady = true })
    } else {
        $("#html_editor").val(html)
    }
    var sourceEditor = getHTMLSourceEditor("page_html_source_editor")
    if (sourceEditor) sourceEditor.setValue(html)
}

function ensurePageVisualEditor() {
	var editor = CKEDITOR.instances["html_editor"]
	if (!editor) {
		$("#html_editor").ckeditor({ height: getGophishVisualEditorHeight() })
		editor = CKEDITOR.instances["html_editor"]
		if (editor) setupAutocomplete(editor)
	}
	if (!editor) return

	editor.config.readOnly = pageReadOnly
	resizeGophishVisualEditor(editor)
	pageVisualReady = false
	editor.setData(pagePendingHtml, function () {
		if (editor.mode !== "wysiwyg") {
			editor.setMode("wysiwyg", function () {
				resizeGophishVisualEditor(editor)
				pageVisualReady = true
			})
		} else {
			resizeGophishVisualEditor(editor)
			pageVisualReady = true
		}
	})
}

function setPageHtmlMode(mode) {
    var sourceMode = mode === "source"
    var html = getPageHtmlContent() || ""
    pageHtmlMode = sourceMode ? "source" : "visual"
    $("#pageVisualMode").toggleClass("btn-primary", !sourceMode).toggleClass("btn-default", sourceMode)
    $("#pageSourceMode").toggleClass("btn-primary", sourceMode).toggleClass("btn-default", !sourceMode)
    $("#pageVisualEditorContainer").toggle(!sourceMode)
    $("#pageSourceEditorContainer").toggle(sourceMode)

    var visualEditor = CKEDITOR.instances["html_editor"]
    if (sourceMode) {
        var codeEditor = setupHTMLSourceEditor("page_html_source_editor", queuePageSourcePreview)
        if (codeEditor) {
            setHTMLSourceValue("page_html_source_editor", html)
        }
        queuePageSourcePreview()
    } else {
        clearTimeout(pagePreviewTimer)
        pagePreviewRequest++
        pagePendingHtml = html
        if ($("#modal").is(":visible")) {
            if (visualEditor) {
                visualEditor.setData(html, function () {
                    if (visualEditor.mode !== "wysiwyg") visualEditor.setMode("wysiwyg", function () { resizeGophishVisualEditor(visualEditor) })
                    else resizeGophishVisualEditor(visualEditor)
                    pageVisualReady = true
                })
            } else {
                ensurePageVisualEditor()
            }
        }
    }
}

function queuePageSourcePreview() {
    if (pageHtmlMode !== "source") return
    clearTimeout(pagePreviewTimer)
    pagePreviewTimer = setTimeout(renderPageSourcePreview, 300)
}

function renderPageSourcePreview() {
    if (pageHtmlMode !== "source") return
    var request = ++pagePreviewRequest
    api.scenarioPreview.post({
        page: { html: getPageHtmlContent() },
        url: "http://preview.local/",
        variables: {}
    }).success(function (preview) {
        if (request !== pagePreviewRequest) return
        document.getElementById("pageSourcePreview").srcdoc = preview.html
        $("#pagePreviewHint").text("Rendered with sample recipient data")
    }).error(function (data) {
        if (request !== pagePreviewRequest) return
        $("#pagePreviewHint").text(data.responseJSON && data.responseJSON.message ? data.responseJSON.message : "Unable to render preview")
    })
}

// Save attempts to POST to /templates/
function save(idx) {
    var page = {}
    page.name = $("#name").val()
    editor = CKEDITOR.instances["html_editor"]
    page.html = getPageHtmlContent()
    page.capture_credentials = $("#capture_credentials_checkbox").prop("checked")
    page.capture_passwords = $("#capture_passwords_checkbox").prop("checked")
    page.redirect_url = $("#redirect_url_input").val()
    page.teams = []
    if (idx != -1) {
        page.id = pages[idx].id
        api.pageId.put(page)
            .success(function (data) {
                successFlash("Page edited successfully!")
                load()
                dismiss()
            })
    } else {
        // Submit the page
        api.pages.post(page)
            .success(function (data) {
                successFlash("Page added successfully!")
                load()
                dismiss()
            })
            .error(function (data) {
                modalError(data.responseJSON.message)
            })
    }
}

function dismiss() {
    clearTimeout(pagePreviewTimer)
    pagePreviewRequest++
    $("#modal\\.flashes").empty()
    $("#name").val("")
    setPageHtmlContent("")
    setPageHtmlMode("visual")
    document.getElementById("pageSourcePreview").srcdoc = ""
    $("#url").val("")
    $("#redirect_url_input").val("")
    $("#modal").find("input[type='checkbox']").prop("checked", false)
    $("#capture_passwords").hide()
    $("#redirect_url").hide()
    $("#modal").modal('hide')
}

var deletePage = function (idx) {
    Swal.fire({
        title: "Are you sure?",
        text: "This will delete the landing page. This can't be undone!",
        type: "warning",
        animation: false,
        showCancelButton: true,
        confirmButtonText: "Delete " + escapeHtml(pages[idx].name),
        confirmButtonColor: "#428bca",
        reverseButtons: true,
        allowOutsideClick: false,
        preConfirm: function () {
            return new Promise(function (resolve, reject) {
                api.pageId.delete(pages[idx].id)
                    .success(function (msg) {
                        resolve()
                    })
                    .error(function (data) {
                        reject(data.responseJSON.message)
                    })
            }).catch(function (error) {
                Swal.showValidationMessage(
                    `Request failed: ${error}`
                );
                return false;
            })
        }
    }).then(function (result) {
        if (result.value){
            Swal.fire(
                'Landing Page Deleted!',
                'This landing page has been deleted!',
                'success'
            );
        }
        $('button:contains("OK")').on('click', function () {
            location.reload()
        })
    })
}

function importSite() {
    url = $("#url").val()
    if (!url) {
        modalError("No URL Specified!")
    } else {
        api.clone_site({
                url: url,
                include_resources: false
            })
            .success(function (data) {
                setPageHtmlContent(data.html)
                setPageHtmlMode("visual")
                $("#importSiteModal").modal("hide")
            })
            .error(function (data) {
                modalError(data.responseJSON.message)
            })
    }
}

function edit(idx) {
    pageReadOnly = false
    $("#modalSubmit").unbind('click').click(function () {
        save(idx)
    })
    var page = {}
    if (idx != -1) {
        $("#modalLabel").text("Edit Landing Page")
        page = pages[idx]
        $("#name").val(page.name)
        setPageHtmlContent(page.html)
        setPageHtmlMode("visual")
        $("#capture_credentials_checkbox").prop("checked", page.capture_credentials)
        $("#capture_passwords_checkbox").prop("checked", page.capture_passwords)
        $("#redirect_url_input").val(page.redirect_url)
        if (page.capture_credentials) {
            $("#capture_passwords").show()
            $("#redirect_url").show()
        }
    } else {
        $("#modalLabel").text("New Landing Page")
        setPageHtmlContent("")
        setPageHtmlMode("visual")
    }
    // make editable
    $("#capture_credentials_checkbox").attr("disabled", false)
    $("#capture_passwords_checkbox").attr("disabled", false)
    $("#name").attr('readonly', false)
    $("#redirect_url_input").attr('readonly', false)
    $("#pageVisualMode, #pageSourceMode").prop("disabled", false)
    var sourceEditor = getHTMLSourceEditor("page_html_source_editor")
    if (sourceEditor) sourceEditor.setOption("readOnly", false)
    $("#modalSubmit").show()
    $("#modalImport").show()
}

function view(idx) {
    pageReadOnly = true
    $("#modalSubmit").unbind('click').click(function () {
        save(idx)
    })
    var page = {}

    $("#modalLabel").text("View Landing Page")
    page = pages[idx]
    $("#name").val(page.name)
    setPageHtmlContent(page.html)
    setPageHtmlMode("visual")
    $("#capture_credentials_checkbox").prop("checked", page.capture_credentials)
    $("#capture_passwords_checkbox").prop("checked", page.capture_passwords)
    $("#redirect_url_input").val(page.redirect_url)
    if (page.capture_credentials) {
        $("#capture_passwords").show()
        $("#redirect_url").show()
    }
    // make not Editable
    $("#modalSubmit").hide()
    $("#modalImport").hide()
    $("#capture_credentials_checkbox").attr("disabled", true)
    $("#capture_passwords_checkbox").attr("disabled", true)
    $("#name").attr('readonly', true)
    $("#redirect_url_input").attr('readonly', true)
    $("#pageVisualMode, #pageSourceMode").prop("disabled", true)
    var sourceEditor = getHTMLSourceEditor("page_html_source_editor")
    if (sourceEditor) sourceEditor.setOption("readOnly", true)
    
}

function copy(idx) {
    pageReadOnly = false
    $("#modalSubmit").unbind('click').click(function () {
        save(-1)
    })
    var page = pages[idx]
    $("#name").val("Copy of " + page.name)
    setPageHtmlContent(page.html)
    setPageHtmlMode("visual")
    $("#pageVisualMode, #pageSourceMode").prop("disabled", false)
    var sourceEditor = getHTMLSourceEditor("page_html_source_editor")
    if (sourceEditor) sourceEditor.setOption("readOnly", false)
}

function load() {
    /*
        load() - Loads the current pages using the API
    */
    $("#pagesTable").hide()
    $("#emptyMessage").hide()
    $("#loading").show()
    api.pages.get()
        .success(function (ps) {
            api.user.current().success(function (u) {
                pages = ps
                teams = u.teams
                $("#loading").hide()
                if (pages.length > 0) {
                    $("#pagesTable").show()
                    pagesTable = $("#pagesTable").DataTable({
                        destroy: true,
                        columnDefs: [{
                            orderable: false,
                            targets: "no-sort"
                        }]
                    });
                    pagesTable.clear()
                    pageRows = []
                    pages = pages.filter((item, index, self) => 
                    index === self.findIndex((t) => t.id === item.id)
                    );
                    
                    $.each(pages, function (i, page) {
                        var permissions = {
                            canDelete : false,
                            canEdit : false,
                        };
                        permissions = CheckTeam(page.teams, u)

                        var isOwner = false;
                        if (u.id == page.user_id){
                            var isOwner = true;
                        }
                        pageRows.push([
                            escapeHtml(page.name),
                            moment(page.modified_date).format('MMMM Do YYYY, h:mm:ss a'),
                            "<div class='pull-right'>\
                                <span data-toggle='modal' data-backdrop='static' data-target='#modal'>\
                                " + (isOwner || permissions.canEdit ? "<button class='btn btn-primary' data-toggle='tooltip' data-placement='left' title='Edit Page' onclick='edit("+ i + ")')>\
                                <i class='fa fa-pencil'></i>\
                                </button>" :
                                "<button class='btn btn-primary' data-toggle='tooltip' data-placement='left' title='View Page' onclick='view("+ i + ")')></i>\
                                <i class='fa fa-eye'></i>\
                                </button>") + "\
                                </span>\
                                <span data-toggle='modal' data-target='#modal'>\
                                    <button class='btn btn-primary' data-toggle='tooltip' data-placement='left' title='Copy Page' onclick='copy(" + i + ")'>\
                                        <i class='fa fa-copy'></i>\
                                    </button>\
                                </span>\
                                <button class='btn " + (isOwner || permissions.canDelete ? "btn-danger" : "btn-secondary disabled") + "' data-toggle='tooltip' data-placement='left' title='" + (isOwner || permissions.canDelete ? "Delete Page" : "You dont have permission to delete this page") + "' " + (isOwner || permissions.canDelete ? "onclick='deletePage(" + i + ")'" : "disabled") + ">\
                                    <i class='fa fa-trash-o'></i>\
                                </button>\
                                <button id='teams_button' type='button' class='btn btn-orange' data-toggle='modal' data-backdrop='static' data-target='#team_modal' onclick='team("+ i + ")'>\
                                <i class='fa fa-users'></i> Update teams\
                                </button>\
                            </div>"
                        ])
                    })
                    pagesTable.rows.add(pageRows).draw()
                    $('[data-toggle="tooltip"]').tooltip()
                } else {
                    $("#emptyMessage").show()
                }
                // })
            })
        })
        .error(function () {
            $("#loading").hide()
            errorFlash("Error fetching pages")
        })
}

$(document).ready(function () {
    $(window).on("resize", function () {
        if ($("#modal").is(":visible") && pageHtmlMode === "visual") resizeGophishVisualEditor(CKEDITOR.instances["html_editor"])
    })
    $("#redirect_url_input").on("input", queuePageSourcePreview)
    // Setup multiple modals
    // Code based on http://miles-by-motorcycle.com/static/bootstrap-modal/index.html
    $('.modal').on('hidden.bs.modal', function (event) {
        $(this).removeClass('fv-modal-stack');
        $('body').data('fv_open_modals', $('body').data('fv_open_modals') - 1);
    });
    $('.modal').on('shown.bs.modal', function (event) {
        if ($(this).attr("id") === "modal" && pageHtmlMode === "visual") {
            ensurePageVisualEditor()
        }
        // Keep track of the number of open modals
        if (typeof ($('body').data('fv_open_modals')) == 'undefined') {
            $('body').data('fv_open_modals', 0);
        }
        // if the z-index of this modal has been set, ignore.
        if ($(this).hasClass('fv-modal-stack')) {
            return;
        }
        $(this).addClass('fv-modal-stack');
        // Increment the number of open modals
        $('body').data('fv_open_modals', $('body').data('fv_open_modals') + 1);
        // Setup the appropriate z-index
        $(this).css('z-index', 1040 + (10 * $('body').data('fv_open_modals')));
        $('.modal-backdrop').not('.fv-modal-stack').css('z-index', 1039 + (10 * $('body').data('fv_open_modals')));
        $('.modal-backdrop').not('fv-modal-stack').addClass('fv-modal-stack');
    });
    $.fn.modal.Constructor.prototype.enforceFocus = function () {
        $(document)
            .off('focusin.bs.modal') // guard against infinite focus loop
            .on('focusin.bs.modal', $.proxy(function (e) {
                if (
                    this.$element[0] !== e.target && !this.$element.has(e.target).length
                    // CKEditor compatibility fix start.
                    &&
                    !$(e.target).closest('.cke_dialog, .cke').length
                    // CKEditor compatibility fix end.
                ) {
                    this.$element.trigger('focus');
                }
            }, this));
    };
    // Scrollbar fix - https://stackoverflow.com/questions/19305821/multiple-modals-overlay
    $(document).on('hidden.bs.modal', '.modal', function () {
        $('.modal:visible').length && $(document.body).addClass('modal-open');
    });
    $('#modal').on('hidden.bs.modal', function (event) {
        dismiss()
    });
    $("#capture_credentials_checkbox").change(function () {
        $("#capture_passwords").toggle()
        $("#redirect_url").toggle()
    })
    CKEDITOR.on('dialogDefinition', function (ev) {
        // Take the dialog name and its definition from the event data.
        var dialogName = ev.data.name;
        var dialogDefinition = ev.data.definition;

        // Check if the definition is from the dialog window you are interested in (the "Link" dialog window).
        if (dialogName == 'link') {
            dialogDefinition.minWidth = 500
            dialogDefinition.minHeight = 100

            // Remove the linkType field
            var infoTab = dialogDefinition.getContents('info');
            infoTab.get('linkType').hidden = true;
        }
    });

    load()
})

function team(i) {
    updateItemTeamsAssignment(pages[i], item_type, teams)
}
