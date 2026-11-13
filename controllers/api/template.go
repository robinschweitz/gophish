package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	ctx "github.com/gophish/gophish/context"
	log "github.com/gophish/gophish/logger"
	"github.com/gophish/gophish/models"
	"github.com/gorilla/mux"
	"github.com/jinzhu/gorm"
)

type templatePreviewRequest struct {
	Template  models.Template          `json:"template"`
	URL       string                   `json:"url"`
	Variables models.ScenarioVariables `json:"variables"`
}

// TemplatePreview renders an unsaved email template with sample recipient data.
func (as *Server) TemplatePreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		JSONResponse(w, models.Response{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
		return
	}
	request := templatePreviewRequest{}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Invalid request"}, http.StatusBadRequest)
		return
	}
	preview, err := models.RenderScenarioTemplatePreview(request.Template, request.URL, request.Variables)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
		return
	}
	JSONResponse(w, preview, http.StatusOK)
}

// Templates handles the functionality for the /api/templates endpoint
func (as *Server) Templates(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == "GET":
		ts, err := models.GetTemplates(ctx.Get(r, "user_id").(int64))
		if err != nil {
			log.Error(err)
		}
		JSONResponse(w, ts, http.StatusOK)
	//POST: Create a new template and return it as JSON
	case r.Method == "POST":
		t := models.Template{}
		// Put the request into a template
		err := json.NewDecoder(r.Body).Decode(&t)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: "Invalid JSON structure"}, http.StatusBadRequest)
			return
		}
		//Check if template exists
		_, err = models.GetTemplate(t.Id, ctx.Get(r, "user_id").(int64))
		if err != gorm.ErrRecordNotFound {
			JSONResponse(w, models.Response{Success: false, Message: "Template already exists"}, http.StatusConflict)
			log.Error(err)
			return
		}
		t.ModifiedDate = time.Now().UTC()
		t.UserId = ctx.Get(r, "user_id").(int64)
		err = models.PostTemplate(&t)
		if err == models.ErrTemplateNameNotSpecified {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
			return
		}
		if err == models.ErrTemplateMissingParameter {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
			return
		}
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: "Error inserting template into database"}, http.StatusInternalServerError)
			log.Error(err)
			return
		}
		JSONResponse(w, t, http.StatusCreated)
	}
}

// Template handles the functions for the /api/templates/:id endpoint
func (as *Server) Template(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, _ := strconv.ParseInt(vars["id"], 0, 64)
	t, err := models.GetTemplate(id, ctx.Get(r, "user_id").(int64))
	template_owner := t.UserId
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Template not found"}, http.StatusNotFound)
		return
	}
	switch {
	case r.Method == "GET":
		JSONResponse(w, t, http.StatusOK)
	case r.Method == "DELETE":
		if models.GetTemplateScenariosCount(id) >= 1 {
			JSONResponse(w, models.Response{Success: false, Message: "Cant delete template since it is still attached to at least one scenario"}, http.StatusUnprocessableEntity)
			return
		}
		err = models.DeleteTemplate(id, ctx.Get(r, "user_id").(int64))
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: "Error deleting template"}, http.StatusInternalServerError)
			return
		}
		JSONResponse(w, models.Response{Success: true, Message: "Template deleted successfully!"}, http.StatusOK)
	case r.Method == "PUT":
		t = models.Template{}
		err = json.NewDecoder(r.Body).Decode(&t)
		if err != nil {
			log.Error(err)
		}
		if t.Id != id {
			JSONResponse(w, models.Response{Success: false, Message: "Error: /:id and template_id mismatch"}, http.StatusBadRequest)
			return
		}
		t.ModifiedDate = time.Now().UTC()
		t.UserId = template_owner
		err = models.PutTemplate(&t)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
			return
		}
		JSONResponse(w, t, http.StatusOK)
	}
}
