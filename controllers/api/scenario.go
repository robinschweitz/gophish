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

type scenarioPreviewRequest struct {
	Page       models.Page              `json:"page"`
	TemplateId int64                    `json:"template_id"`
	URL        string                   `json:"url"`
	Variables  models.ScenarioVariables `json:"variables"`
}

// ScenarioPreview renders the selected scenario landing page without saving it.
func (as *Server) ScenarioPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		JSONResponse(w, models.Response{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
		return
	}
	request := scenarioPreviewRequest{}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Invalid request"}, http.StatusBadRequest)
		return
	}
	if request.TemplateId != 0 {
		template, err := models.GetTemplate(request.TemplateId, ctx.Get(r, "user_id").(int64))
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: "Email template not found"}, http.StatusNotFound)
			return
		}
		preview, err := models.RenderScenarioTemplatePreview(template, request.URL, request.Variables)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
			return
		}
		JSONResponse(w, preview, http.StatusOK)
		return
	}
	page := request.Page
	if page.Id != 0 {
		var err error
		page, err = models.GetPage(page.Id, ctx.Get(r, "user_id").(int64))
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: "Landing page not found"}, http.StatusNotFound)
			return
		}
	} else if page.HTML == "" {
		JSONResponse(w, models.Response{Success: false, Message: "Landing page HTML not specified"}, http.StatusBadRequest)
		return
	}
	html, err := models.RenderScenarioPagePreview(page, request.URL, request.Variables)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
		return
	}
	JSONResponse(w, map[string]string{"html": html}, http.StatusOK)
}

// Scenarios handles requests for the /api/scenarios/ endpoint
func (as *Server) Scenarios(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == "GET":
		ps, err := models.GetScenarios(ctx.Get(r, "user_id").(int64))
		if err != nil {
			log.Error(err)
		}
		JSONResponse(w, ps, http.StatusOK)
	//POST: Create a new scenario and return it as JSON
	case r.Method == "POST":
		s := models.Scenario{}
		// Put the request into a scenario
		err := json.NewDecoder(r.Body).Decode(&s)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: "Invalid request"}, http.StatusBadRequest)
			return
		}
		//Check if scenario exists
		_, err = models.GetScenario(s.Id, ctx.Get(r, "user_id").(int64))
		if err != gorm.ErrRecordNotFound {
			JSONResponse(w, models.Response{Success: false, Message: "Scenario already exists"}, http.StatusConflict)
			log.Error(err)
			return
		}
		s.UserId = ctx.Get(r, "user_id").(int64)
		err = models.PostScenario(&s, s.UserId)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		JSONResponse(w, s, http.StatusCreated)
	}
}

// Scenario contains functions to handle the GET'ing, DELETE'ing, and PUT'ing
// of a Scenario object
func (as *Server) Scenario(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, _ := strconv.ParseInt(vars["id"], 0, 64)
	s, err := models.GetScenario(id, ctx.Get(r, "user_id").(int64))
	// safe the user_id for later use.
	scenario_owner := s.UserId
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Scenario not found"}, http.StatusNotFound)
		return
	}
	switch {
	case r.Method == "GET":
		JSONResponse(w, s, http.StatusOK)
	case r.Method == "DELETE":
		if models.GetScenarioCampaignsCount(id) >= 1 {
			JSONResponse(w, models.Response{Success: false, Message: "Cant delete scenario since it is still attached to at least one campaign"}, http.StatusUnprocessableEntity)
			return
		}
		err = models.DeleteScenario(id)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: "Error deleting scenario: " + err.Error()}, http.StatusInternalServerError)
			return
		}
		JSONResponse(w, models.Response{Success: true, Message: "Scenario Deleted Successfully"}, http.StatusOK)
	case r.Method == "PUT":
		s = models.Scenario{}
		err = json.NewDecoder(r.Body).Decode(&s)
		if err != nil {
			log.Error(err)
		}
		if s.Id != id {
			JSONResponse(w, models.Response{Success: false, Message: "/:id and /:scenario_id mismatch"}, http.StatusBadRequest)
			return
		}
		s.ModifiedDate = time.Now().UTC()
		// use the original user as the page owner
		s.UserId = scenario_owner
		err = models.PutScenario(&s)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: "Error updating scenario: " + err.Error()}, http.StatusInternalServerError)
			return
		}
		JSONResponse(w, s, http.StatusOK)
	}
}
