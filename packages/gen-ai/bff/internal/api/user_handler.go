package api

import (
	"context"
	"net/http"
	"time"

	"github.com/julienschmidt/httprouter"
	"github.com/opendatahub-io/gen-ai/internal/constants"
	"github.com/opendatahub-io/gen-ai/internal/integrations"
	k8s "github.com/opendatahub-io/gen-ai/internal/integrations/kubernetes"
	"github.com/opendatahub-io/gen-ai/internal/models"
)

type UserEnvelope = Envelope[models.UserModel, None]

// GetCurrentUserHandler returns the current user information
func (app *App) GetCurrentUserHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	ctx := r.Context()

	// Default empty response; we always return 200
	resp := models.UserModel{UserID: ""}

	identity, ok := ctx.Value(constants.RequestIdentityKey).(*integrations.RequestIdentity)
	if !ok || identity == nil {
		_ = app.WriteJSON(w, http.StatusOK, UserEnvelope{Data: resp}, nil)
		return
	}

	// Always use real Kubernetes client for user info, even in mock mode
	// This ensures we get the actual cluster user from the token
	//
	// CEAMLS: the app's own factory is the real one unless the Kubernetes
	// client is mocked, so use it. Building a factory here on every call
	// listed the OpenTelemetry collectors and the MLflow objects of the whole
	// cluster and built a service account client each time, which made this
	// call take about half a second.
	factory := app.kubernetesClientFactory
	if app.config.MockK8sClient {
		realK8sFactory, err := k8s.NewKubernetesClientFactory(app.config, app.logger, app.rootCAs)
		if err != nil {
			app.logger.Error("Failed to create real k8s factory", "error", err)
			_ = app.WriteJSON(w, http.StatusOK, UserEnvelope{Data: resp}, nil)
			return
		}
		factory = realK8sFactory
	}

	client, err := factory.GetClient(ctx)
	if err != nil {
		app.logger.Error("Failed to get k8s client", "error", err)
		_ = app.WriteJSON(w, http.StatusOK, UserEnvelope{Data: resp}, nil)
		return
	}

	tCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	username, err := client.GetUser(tCtx, identity)
	if err != nil {
		app.logger.Error("Failed to get user", "error", err)
		_ = app.WriteJSON(w, http.StatusOK, UserEnvelope{Data: resp}, nil)
		return
	}

	resp.UserID = username
	if err := app.WriteJSON(w, http.StatusOK, UserEnvelope{Data: resp}, nil); err != nil {
		_ = app.WriteJSON(w, http.StatusOK, UserEnvelope{Data: models.UserModel{UserID: ""}}, nil)
		return
	}
}
