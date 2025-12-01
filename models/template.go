package models

import (
	"errors"
	"net/mail"
	"time"

	log "github.com/gophish/gophish/logger"
	"github.com/jinzhu/gorm"
)

// Template models hold the attributes for an email template to be sent to targets
type Template struct {
	Id             int64         `json:"id" gorm:"column:id; primary_key:yes"`
	UserId         int64         `json:"user_id" gorm:"column:user_id"`
	Name           string        `json:"name"`
	EnvelopeSender string        `json:"envelope_sender"`
	Subject        string        `json:"subject"`
	Text           string        `json:"text"`
	HTML           string        `json:"html" gorm:"column:html"`
	ModifiedDate   time.Time     `json:"modified_date"`
	Attachments    []Attachment  `json:"attachments"`
	Item           Item          `json:"-" gorm:"ForeignKey:item_type_id"`
	Teams          []TeamSummary `json:"teams" gorm:"-"`
}

// ErrTemplateNameNotSpecified is thrown when a template name is not specified
var ErrTemplateNameNotSpecified = errors.New("Template name not specified")

// ErrTemplateMissingParameter is thrown when a needed parameter is not provided
var ErrTemplateMissingParameter = errors.New("Need to specify at least plaintext or HTML content")

// Validate checks the given template to make sure values are appropriate and complete
func (t *Template) Validate() error {
	switch {
	case t.Name == "":
		return ErrTemplateNameNotSpecified
	case t.Text == "" && t.HTML == "":
		return ErrTemplateMissingParameter
	case t.EnvelopeSender != "":
		_, err := mail.ParseAddress(t.EnvelopeSender)
		if err != nil {
			return err
		}
	}
	if err := ValidateTemplate(t.HTML); err != nil {
		return err
	}
	if err := ValidateTemplate(t.Text); err != nil {
		return err
	}
	for _, a := range t.Attachments {
		if err := a.Validate(); err != nil {
			return err
		}
	}

	return nil
}

// GetTemplates returns the templates owned by the given user.
func GetTemplates(uid int64) ([]Template, error) {
	templates := []Template{}

	// Fetch all the templates from the db
	err := db.Preload("Item", "item_type = ?", "templates").Preload("Item.Teams.Users.Teams.Role").Find(&templates).Error
	if err != nil {
		log.Error(err)
		return templates, err
	}

	ts := []Template{}

	for _, template := range templates {
		if template.UserId == uid || checkForValue(uid, template.Item.Teams) {
			teams := []TeamSummary{}
			for _, team := range template.Item.Teams {
				teams = append(teams, convertTeamSummary(team))
			}
			template.Teams = teams
			ts = append(ts, template)
		}
	}
	for i := range ts {
		// Get Attachments
		err = db.Where("template_id=?", ts[i].Id).Find(&ts[i].Attachments).Error
		if err == nil && len(ts[i].Attachments) == 0 {
			ts[i].Attachments = make([]Attachment, 0)
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			log.Error(err)
			return ts, err
		}
	}
	return ts, err
}

// GetTemplate returns the template, if it exists, specified by the given id and user_id.
func GetTemplate(id int64, uid int64) (Template, error) {
	t := Template{}
	err := db.Preload("Item", "item_type = ?", "templates").Preload("Item.Teams.Users").Find(&t, "id =?", id).Error
	if err != nil {
		log.Error(err)
		return t, err
	}

	if !(t.UserId == uid || checkForValue(uid, t.Item.Teams)) {
		return t, ErrTemplateNotFound
	}

	ts := []TeamSummary{}
	for _, team := range t.Item.Teams {
		ts = append(ts, convertTeamSummary(team))
	}
	t.Teams = ts

	// Get Attachments
	err = db.Where("template_id=?", t.Id).Find(&t.Attachments).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		log.Error(err)
		return t, err
	}
	if err == nil && len(t.Attachments) == 0 {
		t.Attachments = make([]Attachment, 0)
	}
	return t, err
}

// PostTemplate creates a new template in the database.
func PostTemplate(t *Template) error {
	err := t.Validate()
	if err != nil {
		log.Error(err)
		return err
	}
	// Insert into the DB
	tx := db.Begin()
	err = tx.Save(t).Error
	if err != nil {
		tx.Rollback()
		log.Error(err)
		return err
	}
	err = tx.Create(&Item{ItemType: "templates", ItemTypeID: t.Id}).Error
	if err != nil {
		tx.Rollback()
		log.Error(err)
		return err
	}
	// Save every attachment
	for i := range t.Attachments {
		t.Attachments[i].TemplateId = t.Id
		err := tx.Save(&t.Attachments[i]).Error
		if err != nil {
			tx.Rollback()
			log.Error(err)
			return err
		}
	}
	err = tx.Commit().Error
	if err != nil {
		tx.Rollback()
		return err
	}
	return nil
}

// PutTemplate edits an existing template in the database.
// Per the PUT Method RFC, it presumes all data for a template is provided.
func PutTemplate(t *Template) error {

	if err := t.Validate(); err != nil {
		return err
	}
	tx := db.Begin()
	// Delete all attachments, and replace with new ones
	err := tx.Where("template_id=?", t.Id).Delete(&Attachment{}).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		tx.Rollback()
		log.Error(err)
		return err
	}
	if err == gorm.ErrRecordNotFound {
		err = nil
	}
	for i := range t.Attachments {
		t.Attachments[i].TemplateId = t.Id
		err := tx.Save(&t.Attachments[i]).Error
		if err != nil {
			tx.Rollback()
			log.Error(err)
			return err
		}
	}
	// Save final template
	err = tx.Where("id=?", t.Id).Save(t).Error
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
	return nil
}

// DeleteTemplate deletes an existing template in the database.
// An error is returned if a template with the given user id and template id is not found.
func DeleteTemplate(id int64, uid int64) error {
	tx := db.Begin()
	// Delete attachments
	err := tx.Where("template_id=?", id).Delete(&Attachment{}).Error
	if err != nil {
		tx.Rollback()
		log.Error(err)
		return err
	}
	// Delete associated items from Item and TeamItem tables
	item := Item{}
	err = tx.Where("item_type = ? AND item_type_id = ?", "templates", id).Delete(&item).Error
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
	err = tx.Where("template_id = ?", id).Delete(&ScenarioTemplates{}).Error
	if err != nil {
		tx.Rollback()
		log.Error(err)
		return err
	}
	// Finally, delete the template itself
	err = tx.Delete(Template{Id: id}).Error
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
	return nil
}
