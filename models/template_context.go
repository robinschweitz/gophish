package models

import (
	"bytes"
	"fmt"
	"net/mail"
	"net/url"
	"path"
	"regexp"
	"strings"
	"text/template"

	"github.com/gophish/gophish/evilginx"
)

var scenarioVariableReferencePattern = regexp.MustCompile(`\.Scenario\.([A-Za-z_][A-Za-z0-9_]*)`)

// TemplateContext is an interface that allows both campaigns and email
// requests to have a PhishingTemplateContext generated for them.
type TemplateContext interface {
	getFromAddress() string
	getBaseURL() string
	getEncryptionKey() string
}

// PhishingTemplateContext is the context that is sent to any template, such
// as the email or landing page content.
type PhishingTemplateContext struct {
	From          string
	URL           string
	Tracker       string
	TrackingURL   string
	RId           string
	BaseURL       string
	EncryptionKey string
	BaseRecipient
	Scenario map[string]string
}

// NewPhishingTemplateContext returns a populated PhishingTemplateContext,
// parsing the correct fields from the provided TemplateContext and recipient.
func NewPhishingTemplateContext(ctx TemplateContext, r BaseRecipient, rid string, scenario ...ScenarioVariables) (PhishingTemplateContext, error) {
	f, err := mail.ParseAddress(ctx.getFromAddress())
	if err != nil {
		return PhishingTemplateContext{}, err
	}
	fn := f.Name
	if fn == "" {
		fn = f.Address
	}
	templateURL, err := ExecuteTemplate(ctx.getBaseURL(), r)
	if err != nil {
		return PhishingTemplateContext{}, err
	}

	// For the base URL, we'll reset the the path and the query
	// This will create a URL in the form of http://example.com
	baseURL, err := url.Parse(templateURL)
	if err != nil {
		return PhishingTemplateContext{}, err
	}
	baseURL.Path = ""
	baseURL.RawQuery = ""

	baseLureURL, err := url.Parse(templateURL)
	if err != nil {
		return PhishingTemplateContext{}, err
	}

	q := url.Values{}
	urlQuery := url.Values{}
	_query := baseLureURL.Query()
	for k, v := range _query {
		params, ok, _ := evilginx.ExtractPhishUrlParams(v[0], ctx.getEncryptionKey())
		if ok {
			for pk, pv := range params {
				q.Set(pk, pv)
			}
		} else {
			urlQuery.Set(k, v[0])
		}
	}
	baseLureURL.RawQuery = urlQuery.Encode()

	phishURL := *baseLureURL

	if ctx.getEncryptionKey() != "" {
		q.Set("fname", r.FirstName)
		q.Set("lname", r.LastName)
		q.Set("email", r.Email)
	}
	q.Set("rid", rid)

	evilginx.AddPhishUrlParams(&phishURL, q, ctx.getEncryptionKey())

	trackingURL := *baseLureURL

	q = url.Values{}
	q.Set("rid", rid)
	if ctx.getEncryptionKey() == "" {
		trackingURL.Path = path.Join(trackingURL.Path, "track")
	} else {
		q.Set("o", "track")
	}

	evilginx.AddPhishUrlParams(&trackingURL, q, ctx.getEncryptionKey())

	var variables map[string]string
	if len(scenario) > 0 && scenario[0] != nil {
		variables = scenario[0]
	}
	return PhishingTemplateContext{
		BaseRecipient: r,
		BaseURL:       baseURL.String(),
		URL:           phishURL.String(),
		TrackingURL:   trackingURL.String(),
		Tracker:       "<img alt='' style='display: none' src='" + trackingURL.String() + "'/>",
		From:          fn,
		RId:           rid,
		EncryptionKey: ctx.getEncryptionKey(),
		Scenario:      variables,
	}, nil
}

// ExecuteTemplate creates a templated string based on the provided
// template body and data.
func ExecuteTemplate(text string, data interface{}) (string, error) {
	buff := bytes.Buffer{}
	tmpl, err := template.New("template").Funcs(template.FuncMap{
		"upper":    strings.ToUpper,
		"lower":    strings.ToLower,
		"title":    strings.Title,
		"trim":     strings.TrimSpace,
		"urlquery": url.QueryEscape,
		"default": func(fallback, value interface{}) interface{} {
			if value == nil || fmt.Sprint(value) == "" {
				return fallback
			}
			return value
		},
	}).Parse(text)
	if err != nil {
		return buff.String(), err
	}
	err = tmpl.Execute(&buff, data)
	return buff.String(), err
}

// RenderScenarioPagePreview renders a landing page with the supplied scenario variables and sample recipient.
func RenderScenarioPagePreview(page Page, baseURL string, variables ScenarioVariables) (string, error) {
	variables = addScenarioPreviewPlaceholders(variables, page.HTML, page.RedirectURL)
	ptx, err := newScenarioPreviewContext(baseURL, variables)
	if err != nil {
		return "", err
	}
	return ExecuteTemplate(page.HTML, ptx)
}

// ScenarioTemplatePreview contains rendered fields for an email template preview.
type ScenarioTemplatePreview struct {
	Subject string `json:"subject"`
	Text    string `json:"text"`
	HTML    string `json:"html"`
}

// RenderScenarioTemplatePreview renders the subject and bodies with sample recipient data.
func RenderScenarioTemplatePreview(email Template, baseURL string, variables ScenarioVariables) (ScenarioTemplatePreview, error) {
	variables = addScenarioPreviewPlaceholders(variables, email.Subject, email.Text, email.HTML)
	ptx, err := newScenarioPreviewContext(baseURL, variables)
	if err != nil {
		return ScenarioTemplatePreview{}, err
	}
	preview := ScenarioTemplatePreview{}
	preview.Subject, err = ExecuteTemplate(email.Subject, ptx)
	if err != nil {
		return ScenarioTemplatePreview{}, err
	}
	preview.Text, err = ExecuteTemplate(email.Text, ptx)
	if err != nil {
		return ScenarioTemplatePreview{}, err
	}
	preview.HTML, err = ExecuteTemplate(email.HTML, ptx)
	if err != nil {
		return ScenarioTemplatePreview{}, err
	}
	return preview, nil
}

func addScenarioPreviewPlaceholders(variables ScenarioVariables, contents ...string) ScenarioVariables {
	previewVariables := ScenarioVariables{}
	for name, value := range variables {
		previewVariables[name] = value
	}
	for _, content := range contents {
		for _, match := range scenarioVariableReferencePattern.FindAllStringSubmatch(content, -1) {
			name := match[1]
			if previewVariables[name] == "" {
				previewVariables[name] = "{" + name + "}"
			}
		}
	}
	return previewVariables
}

func newScenarioPreviewContext(baseURL string, variables ScenarioVariables) (PhishingTemplateContext, error) {
	if baseURL == "" {
		baseURL = "http://localhost/"
	}
	ctx := Context{From: "Preview <preview@example.com>", URL: baseURL}
	recipient := BaseRecipient{Email: "alex@example.com", FirstName: "Alex", LastName: "Example", Position: "Preview recipient"}
	return NewPhishingTemplateContext(ctx, recipient, "scenario-preview", variables)
}

// ValidationContext is used for validating templates and pages
type ValidationContext struct {
	FromAddress   string
	BaseURL       string
	EncryptionKey string
}

func (vc ValidationContext) getFromAddress() string {
	return vc.FromAddress
}

func (vc ValidationContext) getBaseURL() string {
	return vc.BaseURL
}

func (vc ValidationContext) getEncryptionKey() string {
	return vc.EncryptionKey
}

// ValidateTemplate ensures that the provided text in the page or template
// uses the supported template variables correctly.
func ValidateTemplate(text string) error {
	vc := ValidationContext{
		FromAddress:   "foo@bar.com",
		BaseURL:       "http://example.com",
		EncryptionKey: "",
	}
	td := Result{
		BaseRecipient: BaseRecipient{
			Email:     "foo@bar.com",
			FirstName: "Foo",
			LastName:  "Bar",
			Position:  "Test",
		},
		RId: "123456",
	}
	ptx, err := NewPhishingTemplateContext(vc, td.BaseRecipient, td.RId)
	if err != nil {
		return err
	}
	_, err = ExecuteTemplate(text, ptx)
	if err != nil {
		return err
	}
	return nil
}
