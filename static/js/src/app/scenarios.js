var scenarios = []
var teams = []
var item_type = "scenarios"
var scenarioTemplateLibrary = []
var scenarioPageLibrary = []
var scenarioVariableValues = {}
var scenarioReadOnly = false
var currentScenarioTab = "details"
var currentScenarioPreviewType = "email"
var previewRequestId = 0
var previewTimer = null

function showScenarioTab(tab) {
    currentScenarioTab = tab === "assets" ? "assets" : "details"
    $("#scenarioDetailsTab").toggle(currentScenarioTab === "details")
    $("#scenarioAssetsTab").toggle(currentScenarioTab === "assets")
    $("#scenarioLivePreviewColumn").toggle(currentScenarioTab === "assets")
    if (currentScenarioTab === "details") {
        $("#scenarioSetupColumn").removeClass("col-md-5").addClass("col-md-12")
    } else {
        $("#scenarioSetupColumn").removeClass("col-md-12").addClass("col-md-5")
    }
    $(".scenario-section-tab").each(function () {
        var button = $(this)
        var active = button.attr("data-tab") === currentScenarioTab
        button.toggleClass("btn-primary", active).toggleClass("btn-default", !active)
        button.attr("aria-selected", active ? "true" : "false")
    })
    if (currentScenarioTab === "assets") {
        renderScenarioVariableFields()
        updateScenarioPreviewOptions()
        renderScenarioPreview()
    }
}

function getScenarioVariableValues() {
    var variables = Object.assign({}, scenarioVariableValues)
    $("#scenarioVariableFields [data-scenario-variable]").each(function () {
        variables[$(this).attr("data-scenario-variable")] = $(this).val()
    })
    scenarioVariableValues = variables
    return variables
}

function findScenarioVariableNames(content, names) {
    var expression = /\.Scenario\.([A-Za-z_][A-Za-z0-9_]*)/g
    var match
    while ((match = expression.exec(content || "")) !== null) names[match[1]] = true
}

function renderScenarioVariableFields() {
    var names = {}
    var templateIds = $("#template").val() || []
    templateIds.forEach(function (id) {
        var template = scenarioTemplateLibrary.find(function (item) { return String(item.id) === String(id) })
        if (!template) return
        findScenarioVariableNames(template.subject, names)
        findScenarioVariableNames(template.text, names)
        findScenarioVariableNames(template.html, names)
    })
    var pageId = $("#page").val()
    var page = scenarioPageLibrary.find(function (item) { return String(item.id) === String(pageId) })
    if (page) {
        findScenarioVariableNames(page.html, names)
        findScenarioVariableNames(page.redirect_url, names)
    }

    var values = getScenarioVariableValues()
    Object.keys(scenarioVariableValues).forEach(function (name) { names[name] = true })
    var container = $("#scenarioVariableFields").empty()
    var keys = Object.keys(names).sort()
    if (!keys.length) {
        container.append('<div class="col-sm-12"><p class="text-muted">Select email templates or a landing page to see the variables they use.</p></div>')
        return
    }
    keys.forEach(function (name) {
        var field = $('<div class="col-sm-6 form-group"></div>')
        var label = $('<label></label>').attr("for", "scenario-variable-" + name).text(name)
        var input = $('<input type="text" class="form-control" />')
            .attr("id", "scenario-variable-" + name)
            .attr("data-scenario-variable", name)
            .attr("placeholder", "Value for " + name)
            .val(values[name] || "")
        input.prop("readonly", scenarioReadOnly)
        field.append(label, input)
        container.append(field)
    })
}

function updateScenarioPreviewOptions() {
    var selectedTemplates = []
    try {
        selectedTemplates = $("#template").select2("data") || []
    } catch (e) {
        selectedTemplates = []
    }
    var previewSelect = $("#scenarioPreviewTemplate")
    var previous = previewSelect.val()
    previewSelect.empty()
    selectedTemplates.forEach(function (template) {
        previewSelect.append(new Option(template.name || template.text || "Email template", template.id))
    })
    if (previous && previewSelect.find("option[value='" + previous + "']").length) previewSelect.val(previous)
    else if (selectedTemplates.length) previewSelect.val(String(selectedTemplates[0].id))

    var hasPage = !!$("#page").val()
    var hasEmail = selectedTemplates.length > 0
    $("#scenarioEmailPreviewType").prop("disabled", !hasEmail)
    $("#scenarioPagePreviewType").prop("disabled", !hasPage)
    if (currentScenarioPreviewType === "email" && !hasEmail && hasPage) currentScenarioPreviewType = "page"
    if (currentScenarioPreviewType === "page" && !hasPage && hasEmail) currentScenarioPreviewType = "email"
    var hasAnyAsset = hasEmail || hasPage
    $("#scenarioPreviewEmpty").toggle(!hasAnyAsset)
    $("#scenarioEmailPreviewType").toggleClass("btn-primary", currentScenarioPreviewType === "email").toggleClass("btn-default", currentScenarioPreviewType !== "email")
    $("#scenarioPagePreviewType").toggleClass("btn-primary", currentScenarioPreviewType === "page").toggleClass("btn-default", currentScenarioPreviewType !== "page")
    $("#scenarioEmailPreviewPanel").toggle(hasAnyAsset && currentScenarioPreviewType === "email")
    $("#scenarioPagePreviewPanel").toggle(hasAnyAsset && currentScenarioPreviewType === "page")
    return hasAnyAsset
}

function save(idx) {
    var variables = getScenarioVariableValues()
    var scenario = {
        name: $("#name").val(),
        description: $("#description").val(),
        variables: variables,
        url: $("#url").val(),
        page: {
            id: parseInt($("#page").select2("data")[0].id)
        }
    }
    var selected = $("#template").select2("data")
    var templates = []

    for (var i = 0; i < selected.length; i++) {
        templates.push({ id: parseInt($("#template").select2("data")[i].id) })
    }
    scenario["templates"] = templates

    if (idx !== -1) {
        scenario.id = scenarios[idx].id
        api.scenarios.put(scenario)
            .success(function (data) {
                successFlash("Scenario edited successfully!")
                load()
                dismiss()
            })
            .error(function (data) {
                modalError(data.responseJSON.message)
            })
    } else {
        // Submit the scenario
        api.scenarios.post(scenario)
            .success(function (data) {
                successFlash("Scenario added successfully!")
                load()
                dismiss()
            })
            .error(function (data) {
                modalError(data.responseJSON.message)
            })
    }
}

function dismiss() {
    clearTimeout(previewTimer)
    previewRequestId++
    showScenarioTab("details")
    currentScenarioPreviewType = "email"
    $("#modal\\.flashes").empty();
    $("#name").val("");
    $("#template").val("").change();
    $("#page").val("").change();
    $("#url").val("");
    scenarioVariableValues = {}
    $("#scenarioVariableFields").empty();
    $("#users").val("").change();
    $("#scenarioEmailPreviewPanel, #scenarioPagePreviewPanel").hide();
    $("#scenarioPreviewEmpty").show();
    $("#scenarioPreviewSubject, #scenarioEmailPreviewText").empty();
    document.getElementById("scenarioPreviewFrame").srcdoc = "";
    document.getElementById("scenarioEmailPreviewFrame").srcdoc = "";
    $("#modal").modal('hide');
}

function scenarioPreviewVariables() {
    return getScenarioVariableValues()
}

function queueScenarioPreview() {
    if (currentScenarioTab !== "assets") return
    clearTimeout(previewTimer)
    previewTimer = setTimeout(renderScenarioPreview, 250)
}

function showScenarioPreviewType(type) {
    currentScenarioPreviewType = type === "page" ? "page" : "email"
    updateScenarioPreviewOptions()
    renderScenarioPreview()
}

function renderScenarioPreview() {
    clearTimeout(previewTimer)
    if (currentScenarioTab !== "assets") return
    var requestId = ++previewRequestId
    var variables = scenarioPreviewVariables()
    var selectedPageId = parseInt($("#page").val())
    var selectedTemplateId = parseInt($("#scenarioPreviewTemplate").val())
    var isEmail = currentScenarioPreviewType === "email"

    if ((isEmail && !selectedTemplateId) || (!isEmail && !selectedPageId)) {
        $("#scenarioEmailPreviewPanel, #scenarioPagePreviewPanel").hide()
        $("#scenarioPreviewEmpty").show()
        $("#scenarioPreviewHint").text(isEmail ? "Select an email template in Assets" : "Select a landing page in Assets")
        return
    }

    $("#scenarioPreviewEmpty").hide()
    $("#scenarioEmailPreviewPanel").toggle(isEmail)
    $("#scenarioPagePreviewPanel").toggle(!isEmail)
    $("#scenarioPreviewHint").text("Updating preview…")
    var payload = {
        url: $("#url").val(),
        variables: variables
    }
    if (isEmail) payload.template_id = selectedTemplateId
    else payload.page = { id: selectedPageId }

    api.scenarioPreview.post(payload)
        .success(function (data) {
            if (requestId !== previewRequestId) return
            if (isEmail) {
                $("#scenarioPreviewSubject").text(data.subject || "(no subject)")
                document.getElementById("scenarioEmailPreviewFrame").srcdoc = data.html || "<html><body><p>This template has no HTML part.</p></body></html>"
                $("#scenarioEmailPreviewText").text(data.text || "This template has no plain-text part.")
                showScenarioEmailFormat(data.html ? "html" : "text")
            } else {
                document.getElementById("scenarioPreviewFrame").srcdoc = data.html
            }
            $("#scenarioPreviewHint").text("Preview updates as you edit scenario values")
        })
        .error(function (data) {
            if (requestId !== previewRequestId) return
            $("#scenarioPreviewHint").text(data.responseJSON && data.responseJSON.message ? data.responseJSON.message : "Unable to render preview")
        })
}

function showScenarioEmailFormat(format) {
    var showHtml = format === "html"
    $("#scenarioEmailPreviewFrame").toggle(showHtml)
    $("#scenarioEmailPreviewText").toggle(!showHtml)
    $("#scenarioPreviewHtmlTab").toggleClass("btn-primary", showHtml).toggleClass("btn-default", !showHtml)
    $("#scenarioPreviewTextTab").toggleClass("btn-primary", !showHtml).toggleClass("btn-default", showHtml)
}

function setupScenarioOptions(onReady) {
    var loaded = 0
    function ready() {
        loaded++
        if (loaded === 2) {
            updateScenarioPreviewOptions()
            if (onReady) onReady()
        }
    }
    api.templates.get()
        .success(function (templates) {
            if (!templates.length) modalError("No templates found!")
            scenarioTemplateLibrary = templates
            var templateSelect = $("#template")
            var previous = templateSelect.val() || []
            templateSelect.empty()
            templates.forEach(function (template) { templateSelect.append(new Option(template.name, template.id)) })
            if (!templateSelect.hasClass("select2-hidden-accessible")) {
                templateSelect.select2({ placeholder: "Select email templates", width: "100%" })
            }
            templateSelect.val(previous).trigger("change")
            ready()
        }).error(ready)
    api.pages.get()
        .success(function (pages) {
            if (!pages.length) modalError("No pages found!")
            scenarioPageLibrary = pages
            var pageSelect = $("#page")
            var previous = pageSelect.val()
            pageSelect.empty()
            pages.forEach(function (page) { pageSelect.append(new Option(page.name, page.id)) })
            if (!pageSelect.hasClass("select2-hidden-accessible")) {
                pageSelect.select2({ placeholder: "Select a landing page", width: "100%" })
            }
            pageSelect.val(previous).trigger("change")
            ready()
        }).error(ready)
}

function populateScenarioForm(scenario) {
    $("#name").val(scenario.name || "")
    $("#description").val(scenario.Description || "")
    $("#scenarioVariableFields").empty()
    scenarioVariableValues = Object.assign({}, scenario.variables || {})
    $("#url").val(scenario.url || "")
    var templateIds = (scenario.templates || []).filter(function (template) { return template && template.id }).map(function (template) { return String(template.id) })
    $("#template").val(templateIds).trigger("change")
    $("#page").val(scenario.page && scenario.page.id ? String(scenario.page.id) : "").trigger("change")
    var hasPreviewAsset = updateScenarioPreviewOptions()
    renderScenarioVariableFields()
    if (hasPreviewAsset) renderScenarioPreview()
}

function view(idx) {
    scenarioReadOnly = true
    showScenarioTab("details")
    $("#modalSubmit").unbind('click').click(function () {
        save(idx)
    })
    $("#scenarioModalLabel").text("View Scenario")
    setupScenarioOptions(function () { populateScenarioForm(scenarios[idx]) })
    // make not Editable
    $("#modalSubmit").hide()
    $("#template, #page").prop("disabled", true)
    $("#name").attr('readonly', true)
    $("#description").attr('readonly', true)
    $("#url").attr('readonly', true)
}

function edit(idx) {
    scenarioReadOnly = false
    showScenarioTab("details")
    $("#modalSubmit").show()
    $("#template, #page").prop("disabled", false)
    $("#name").attr('readonly', false)
    $("#description").attr('readonly', false)
    $("#url").attr('readonly', false)
    $("#modalSubmit").unbind('click').click(function () {
        save(idx)
    })
    setupScenarioOptions(function () {
        if (idx !== -1) {
            $("#scenarioModalLabel").text("Edit Scenario")
            populateScenarioForm(scenarios[idx])
        } else {
            $("#scenarioModalLabel").text("New Scenario")
            populateScenarioForm({})
            if ($("#template option").length === 1) $("#template").val([$("#template option:first").val()]).trigger("change")
            if ($("#page option").length === 1) $("#page").val($("#page option:first").val()).trigger("change")
        }
    })
    if (idx !== -1) {
        $("#scenarioModalLabel").text("Edit Scenario")
    }
}

function copy(idx) {
    scenarioReadOnly = false
    showScenarioTab("details")
    $("#modalSubmit").show()
    $("#template, #page").prop("disabled", false)
    $("#modalSubmit").unbind('click').click(function () {
        save(-1)
    })
    $("#name").attr('readonly', false)
    $("#description").attr('readonly', false)
    $("#url").attr('readonly', false)
    setupScenarioOptions(function () {
    // Set our initial values
    api.scenarioId.get(scenarios[idx].id)
        .success(function (scenario) {
            $("#name").val("Copy of " + scenario.name)
            $("#description").val(scenario.Description)
            $("#scenarioVariableFields").empty()
            scenarioVariableValues = Object.assign({}, scenario.variables || {})
            var scenarioTemplates = scenario.templates.filter(i => i.hasOwnProperty('id')).map(i => i.id.toString())
            
            if (scenarioTemplates.length === 0){
                $("#template").val([]).trigger("change");
            } else {
                $('#template').val(scenarioTemplates);
                $("#template").trigger("change")
            }
            if (!scenario.page.hasOwnProperty('id')) {
                $("#page").val("").trigger("change");
            } else {
                $("#page").val(scenario.page.id.toString());
                $("#page").trigger("change")
            }
            $("#url").val(scenario.url)
            renderScenarioVariableFields()
            if (updateScenarioPreviewOptions()) renderScenarioPreview()
        })
        .error(function (data) {
            $("#modal\\.flashes").empty().append("<div style=\"text-align:center\" class=\"alert alert-danger\">\
            <i class=\"fa fa-exclamation-circle\"></i> " + data.responseJSON.message + "</div>")
        })
    })
}

var deleteScenario = function (idx) {
    Swal.fire({
        title: "Are you sure?",
        text: "This will delete the scenario. This can't be undone!",
        type: "warning",
        animation: false,
        showCancelButton: true,
        confirmButtonText: "Delete " + escapeHtml(scenarios[idx].name),
        confirmButtonColor: "#428bca",
        reverseButtons: true,
        allowOutsideClick: false,
        preConfirm: function () {
            return new Promise(function (resolve, reject) {
                api.scenarios.delete(scenarios[idx].id)
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
                'Scenario Deleted!',
                'This scenario has been deleted!',
                'success'
            );
        }
        $('button:contains("OK")').on('click', function () {
            location.reload()
        })
    })
}

function load() {
    $("#scenarioTable").hide()
    $("#emptyMessage").hide()
    $("#loading").show()
    api.scenarios.get()
        .success(function (ss) {
            api.user.current().success(function (u) {
                teams = u.teams
                scenarios = ss
                $("#loading").hide()
                if (scenarios.length > 0) {
                    $("#scenarioTable").show()
                    scenarioTable = $("#scenarioTable").DataTable({
                        destroy: true,
                        columnDefs: [{
                            orderable: false,
                            targets: "no-sort"
                        }]
                    });
                    scenarioTable.clear()
                    scenarioRows = []
                    scenarios = scenarios.filter((item, index, self) => 
                    index === self.findIndex((t) => t.id === item.id)
                    );
                    
                    $.each(scenarios, function (i, scenario) {
                        var permissions = {
                            canDelete : false,
                            canEdit : false,
                        };
                        permissions = CheckTeam(scenario.teams, u)

                        var isOwner = false;
                        if (u.id == scenario.user_id){
                            var isOwner = true;
                        }
                        scenarioRows.push([
                            escapeHtml(scenario.name),
                            moment(scenario.modified_date).format('MMMM Do YYYY, h:mm:ss a'),
                            "<div class='pull-right'>\
                                <span data-toggle='modal' data-backdrop='static' data-target='#modal'>\
                                " + (isOwner || permissions.canEdit ? "<button class='btn btn-primary' data-toggle='tooltip' data-placement='left' title='Edit Scenarios' onclick='edit("+ i + ")')>\
                                <i class='fa fa-pencil'></i>\
                                </button>" :
                                "<button class='btn btn-primary' data-toggle='tooltip' data-placement='left' title='View Scenarios' onclick='view("+ i + ")')></i>\
                                <i class='fa fa-eye'></i>\
                                </button>") + "\
                                </span>\
                                <span data-toggle='modal' data-target='#modal'>\
                                    <button class='btn btn-primary' data-toggle='tooltip' data-placement='left' title='Copy Scenarios' onclick='copy(" + i + ")'>\
                                        <i class='fa fa-copy'></i>\
                                    </button>\
                                </span>\
                                <button class='btn " + (isOwner || permissions.canDelete ? "btn-danger" : "btn-secondary disabled") + "' data-toggle='tooltip' data-placement='left' title='" + (isOwner || permissions.canDelete ? "Delete Page" : "You dont have permission to delete this scenario") + "' " + (isOwner || permissions.canDelete ? "onclick='deleteScenario(" + i + ")'" : "disabled") + ">\
                                    <i class='fa fa-trash-o'></i>\
                                </button>\
                                <button id='teams_button' type='button' class='btn "+ (isOwner ? "btn-orange" : "btn-secondary disabled") + "' data-toggle='modal' data-backdrop='static' data-target='#team_modal'" + (isOwner ? "onclick='team("+ i + ")'" : "disabled") + "'>\
                                <i class='fa fa-users'></i> Update teams\
                                </button>\
                            </div>"
                        ])
                    })
                    scenarioTable.rows.add(scenarioRows).draw()
                    $('[data-toggle="tooltip"]').tooltip()
                } else {
                    $("#emptyMessage").show()
                }
            })
        })
        .error(function () {
            $("#loading").hide()
            errorFlash("Error fetching scenarios")
        })
}

$(document).ready(function () {
    $("#template, #page").on("change", function () {
        updateScenarioPreviewOptions()
        renderScenarioVariableFields()
        queueScenarioPreview()
    })
    $("#scenarioVariableFields").on("input", "[data-scenario-variable]", function () {
        getScenarioVariableValues()
        queueScenarioPreview()
    })
    $("#scenarioPreviewTemplate").on("change", queueScenarioPreview)
    $("#url").on("input", queueScenarioPreview)
    // Setup multiple modals
    // Code based on http://miles-by-motorcycle.com/static/bootstrap-modal/index.html
    $('.modal').on('hidden.bs.modal', function (event) {
        $(this).removeClass('fv-modal-stack');
        $('body').data('fv_open_modals', $('body').data('fv_open_modals') - 1);
    });
    $('.modal').on('shown.bs.modal', function (event) {
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
    load()

})

function team(i) {
    updateItemTeamsAssignment(scenarios[i], item_type, teams)
}
