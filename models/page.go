package models

import (
	"errors"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	log "github.com/gophish/gophish/logger"
)

// Page contains the fields used for a Page model
type Page struct {
	Id                 int64         `json:"id" gorm:"column:id; primary_key:yes"`
	UserId             int64         `json:"user_id" gorm:"column:user_id"`
	Name               string        `json:"name"`
	HTML               string        `json:"html" gorm:"column:html"`
	CaptureCredentials bool          `json:"capture_credentials" gorm:"column:capture_credentials"`
	CapturePasswords   bool          `json:"capture_passwords" gorm:"column:capture_passwords"`
	RedirectURL        string        `json:"redirect_url" gorm:"column:redirect_url"`
	ModifiedDate       time.Time     `json:"modified_date"`
	Item               Item          `json:"-" gorm:"ForeignKey:item_type_id"`
	Teams              []TeamSummary `json:"teams" gorm:"-"`
}

// ErrPageNameNotSpecified is thrown if the name of the landing page is blank.
var ErrPageNameNotSpecified = errors.New("Page Name not specified")

// parseHTML parses the page HTML on save to handle the
// capturing (or lack thereof!) of credentials and passwords
func (p *Page) parseHTML() error {
	d, err := goquery.NewDocumentFromReader(strings.NewReader(p.HTML))
	if err != nil {
		return err
	}
	forms := d.Find("form")
	forms.Each(func(i int, f *goquery.Selection) {
		// We always want the submitted events to be
		// sent to our server
		f.SetAttr("action", "")
		if p.CaptureCredentials {
			// If we don't want to capture passwords,
			// find all the password fields and remove the "name" attribute.
			if !p.CapturePasswords {
				inputs := f.Find("input")
				inputs.Each(func(j int, input *goquery.Selection) {
					if t, _ := input.Attr("type"); strings.EqualFold(t, "password") {
						input.RemoveAttr("name")
					}
				})
			} else {
				// If the user chooses to re-enable the capture passwords setting,
				// we need to re-add the name attribute
				inputs := f.Find("input")
				inputs.Each(func(j int, input *goquery.Selection) {
					if t, _ := input.Attr("type"); strings.EqualFold(t, "password") {
						input.SetAttr("name", "password")
					}
				})
			}
		} else {
			// Otherwise, remove the name from all
			// inputs.
			inputFields := f.Find("input")
			inputFields.Each(func(j int, input *goquery.Selection) {
				input.RemoveAttr("name")
			})
		}
	})
	p.HTML, err = d.Html()
	return err
}

// Validate ensures that a page contains the appropriate details
func (p *Page) Validate() error {
	if p.Name == "" {
		return ErrPageNameNotSpecified
	}
	// If the user specifies to capture passwords,
	// we automatically capture credentials
	if p.CapturePasswords && !p.CaptureCredentials {
		p.CaptureCredentials = true
	}
	if err := ValidateTemplate(p.HTML); err != nil {
		return err
	}
	if err := ValidateTemplate(p.RedirectURL); err != nil {
		return err
	}
	return p.parseHTML()
}

// GetPages returns the pages owned or shared to the given user.
func GetPages(uid int64) ([]Page, error) {

	// Query to get all pages associated with a specific user either by team or by user_id
	var pages []Page

	err := db.Preload("Item", "item_type = ?", "pages").Preload("Item.Teams.Users.Teams.Role").Find(&pages).Error
	if err != nil {
		log.Error(err)
		return pages, err
	}

	results := []Page{}

	// Convert the Team into the correct format
	for _, page := range pages {
		if page.UserId == uid || checkForValue(uid, page.Item.Teams) {
			ts := []TeamSummary{}
			for _, team := range page.Item.Teams {
				ts = append(ts, convertTeamSummary(team))
			}
			// page.Teams = page.Item.Teams
			page.Teams = ts
			results = append(results, page)
		}
	}

	return results, err
}

// GetPage returns the page, if it exists, specified by the given id and user_id.
func GetPage(id int64, uid int64) (Page, error) {

	var p Page
	// Fetch the page from the db
	err := db.Preload("Item", "item_type = ?", "pages").Preload("Item.Teams.Users").Find(&p, "id =?", id).Error
	if err != nil {
		log.Error(err)
		return p, err
	}
	// Check if User is allowed
	if !(p.UserId == uid || checkForValue(uid, p.Item.Teams)) {
		return p, ErrPageNotFound
	}
	// Convert Team into the correct format
	ts := []TeamSummary{}
	for _, team := range p.Item.Teams {
		ts = append(ts, convertTeamSummary(team))
	}
	p.Teams = ts

	return p, err
}

// PostPage creates a new page in the database.
func PostPage(p *Page) error {

	err := p.Validate()
	if err != nil {
		log.Error(err)
		return err
	}
	// Insert into the DB
	tx := db.Begin()
	err = tx.Save(p).Error
	if err != nil {
		tx.Rollback()
		log.Error(err)
		return err
	}
	err = tx.Save(&Item{ItemType: "pages", ItemTypeID: p.Id}).Error
	if err != nil {
		tx.Rollback()
		log.Error(err)
		return err
	}
	err = tx.Commit().Error
	if err != nil {
		tx.Rollback()
		return err
	}
	return err
}

// PutPage edits an existing Page in the database.
// Per the PUT Method RFC, it presumes all data for a page is provided.
func PutPage(p *Page) error {
	err := p.Validate()
	if err != nil {
		return err
	}
	err = db.Where("id=?", p.Id).Save(p).Error
	if err != nil {
		log.Error(err)
	}
	return err
}

// DeletePage deletes an existing page in the database.
// An error is returned if a page with the given user id and page id is not found.
func DeletePage(id int64, uid int64) error {
	tx := db.Begin()
	// Delete associated items from Item and TeamItem tables
	item := Item{}
	err := tx.Where("item_type = ? AND item_type_id = ?", "pages", id).Delete(&item).Error
	if err != nil {
		tx.Rollback()
		log.Error(err)
		return err
	}
	err = tx.Where("item_id = ?", item.Id).Delete(&ItemTeams{}).Error
	if err != nil {
		tx.Rollback()
		log.Error(err)
		return err
	}
	// Delete the page itself
	err = tx.Delete(Page{Id: id}).Error
	if err != nil {
		tx.Rollback()
		log.Error(err)
		return err
	}
	err = tx.Commit().Error
	if err != nil {
		tx.Rollback()
		return err
	}
	return err
}
