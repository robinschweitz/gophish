package models

import (
	"fmt"

	check "gopkg.in/check.v1"
)

type mockTemplateContext struct {
	URL         string
	FromAddress string
}

func (m mockTemplateContext) getFromAddress() string {
	return m.FromAddress
}

func (m mockTemplateContext) getBaseURL() string {
	return m.URL
}

func (s *ModelsSuite) TestNewTemplateContext(c *check.C) {
	r := Result{
		BaseRecipient: BaseRecipient{
			FirstName: "Foo",
			LastName:  "Bar",
			Email:     "foo@bar.com",
		},
		RId: "1234567",
	}
	ctx := mockTemplateContext{
		URL:         "http://example.com",
		FromAddress: "From Address <from@example.com>",
	}
	expected := PhishingTemplateContext{
		URL:           fmt.Sprintf("%s?rid=%s", ctx.URL, r.RId),
		BaseURL:       ctx.URL,
		BaseRecipient: r.BaseRecipient,
		TrackingURL:   fmt.Sprintf("%s/track?rid=%s", ctx.URL, r.RId),
		From:          "From Address",
		RId:           r.RId,
	}
	expected.Tracker = "<img alt='' style='display: none' src='" + expected.TrackingURL + "'/>"
	got, err := NewPhishingTemplateContext(ctx, r.BaseRecipient, r.RId)
	c.Assert(err, check.Equals, nil)
	c.Assert(got, check.DeepEquals, expected)
}

func (s *ModelsSuite) TestScenarioVariablesAndTemplateHelpers(c *check.C) {
	got, err := ExecuteTemplate(`{{upper .FirstName}} {{.Scenario.Company}} {{default "there" .LastName}} {{urlquery .Email}}`, PhishingTemplateContext{
		BaseRecipient: BaseRecipient{FirstName: "Ada", Email: "ada+test@example.com"},
		Scenario:      ScenarioVariables{"Company": "Example Corp"},
	})
	c.Assert(err, check.Equals, nil)
	c.Assert(got, check.Equals, "ADA Example Corp there ada%2Btest%40example.com")
}

func (s *ModelsSuite) TestRenderScenarioPagePreview(c *check.C) {
	html, err := RenderScenarioPagePreview(Page{HTML: `<h1>{{.Scenario.CompanyName}}</h1><p>Hello {{.FirstName}}</p>`}, "http://example.test", ScenarioVariables{"CompanyName": "Contoso"})
	c.Assert(err, check.Equals, nil)
	c.Assert(html, check.Equals, "<h1>Contoso</h1><p>Hello Alex</p>")
}

func (s *ModelsSuite) TestRenderScenarioTemplatePreview(c *check.C) {
	preview, err := RenderScenarioTemplatePreview(Template{
		Subject: `{{upper .Scenario.CompanyName}} for {{.FirstName}}`,
		Text:    `Visit {{.URL}}`,
		HTML:    `<p>{{.Scenario.Message}}</p>`,
	}, "http://example.test", ScenarioVariables{"CompanyName": "Contoso", "Message": "Scenario preview"})
	c.Assert(err, check.Equals, nil)
	c.Assert(preview.Subject, check.Equals, "CONTOSO for Alex")
	c.Assert(preview.Text, check.Matches, `Visit http://example\.test\?rid=scenario-preview`)
	c.Assert(preview.HTML, check.Equals, `<p>Scenario preview</p>`)
}

func (s *ModelsSuite) TestScenarioPreviewShowsUnfilledVariableNames(c *check.C) {
	email, err := RenderScenarioTemplatePreview(Template{
		Subject: `Hello {{.Scenario.CompanyName}}`,
		Text:    `{{.Scenario.Message}}`,
		HTML:    `<p>{{.Scenario.CompanyName}}: {{.Scenario.Message}}</p>`,
	}, "http://example.test", ScenarioVariables{"CompanyName": "", "Message": "Ready"})
	c.Assert(err, check.Equals, nil)
	c.Assert(email.Subject, check.Equals, "Hello {CompanyName}")
	c.Assert(email.Text, check.Equals, "Ready")
	c.Assert(email.HTML, check.Equals, `<p>{CompanyName}: Ready</p>`)

	page, err := RenderScenarioPagePreview(Page{HTML: `<h1>{{.Scenario.CompanyName}}</h1>`}, "http://example.test", nil)
	c.Assert(err, check.Equals, nil)
	c.Assert(page, check.Equals, `<h1>{CompanyName}</h1>`)
}
