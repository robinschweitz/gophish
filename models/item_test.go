package models

import "gopkg.in/check.v1"

func (s *ModelsSuite) TestGetItem(c *check.C) {
	// Create landing page
	page := Page{Name: "Test Page"}
	page.HTML = "<html>Test</html>"
	page.UserId = 1
	err := PostPage(&page)
	c.Assert(err, check.Equals, nil)

	// Get Information about Page
	page, err = GetPage(page.Id, 1)
	c.Assert(err, check.Equals, nil)

	// Get Information about Page Item
	item, err := GetItem(page.Id, "pages", 1)
	c.Assert(err, check.Equals, nil)
	c.Assert(item.Id, check.Equals, page.Item.Id)
}
