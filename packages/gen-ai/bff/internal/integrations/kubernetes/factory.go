package kubernetes

import (
	"context"
	"crypto/x509"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/opendatahub-io/gen-ai/internal/config"
	"github.com/opendatahub-io/gen-ai/internal/constants"
	helper "github.com/opendatahub-io/gen-ai/internal/helpers"
	"github.com/opendatahub-io/gen-ai/internal/integrations"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/rest"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/apiutil"
)

// sharedClientParts holds what every per-request Kubernetes client has in
// common: the kubeconfig of the pod, the scheme, and the REST mapper, which
// is the cache of the API discovery. None of them depends on the user.
//
// CEAMLS: before, newTokenKubernetesClient loaded the kubeconfig, built the
// scheme and started a new REST mapper on every request. A new mapper
// discovers the API groups again on its first use, so each request to this
// backend made several serial round trips to the API server before the real
// call, and the Gateway page waited more than a second for its three calls.
// Discovery runs with the credentials of the pod; the request itself still
// carries the token of the user. When the kubeconfig is not available (unit
// tests), the parts stay empty and the per-request path builds its own.
type sharedClientParts struct {
	baseConfig *rest.Config
	scheme     *runtime.Scheme
	mapper     meta.RESTMapper
}

func newSharedClientParts(logger *slog.Logger) sharedClientParts {
	baseConfig, err := helper.GetKubeconfig()
	if err != nil {
		logger.Warn("kubeconfig not available, per-request clients build their own", "error", err)
		return sharedClientParts{}
	}
	scheme, err := helper.BuildScheme()
	if err != nil {
		logger.Warn("failed to build the shared scheme, per-request clients build their own", "error", err)
		return sharedClientParts{}
	}
	httpClient, err := rest.HTTPClientFor(baseConfig)
	if err != nil {
		logger.Warn("failed to build the discovery HTTP client, per-request clients build their own", "error", err)
		return sharedClientParts{}
	}
	mapper, err := apiutil.NewDynamicRESTMapper(baseConfig, httpClient)
	if err != nil {
		logger.Warn("failed to build the shared REST mapper, per-request clients build their own", "error", err)
		return sharedClientParts{}
	}
	return sharedClientParts{baseConfig: baseConfig, scheme: scheme, mapper: mapper}
}

func NewKubernetesClientFactory(cfg config.EnvConfig, logger *slog.Logger, rootCAs *x509.CertPool) (KubernetesClientFactory, error) {
	// TODO: Add support for internal auth method wherein we use the same
	// k8s static client for all requests in dev mode.
	// Leaving the code to be a switch statemenent so that it can be added later.
	// TODO: Add support for auth method disabled
	switch cfg.AuthMethod {
	case config.AuthMethodUser:
		k8sFactory := NewTokenClientFactory(logger, cfg, rootCAs)
		return k8sFactory, nil

	default:
		return nil, fmt.Errorf("invalid auth method: %q", cfg.AuthMethod)
	}
}

type KubernetesClientFactory interface {
	GetClient(ctx context.Context) (KubernetesClientInterface, error)
	ExtractRequestIdentity(httpHeader http.Header) (*integrations.RequestIdentity, error)
	ValidateRequestIdentity(identity *integrations.RequestIdentity) error
}

type TokenClientFactory struct {
	Logger            *slog.Logger
	Header            string
	Prefix            string
	Config            config.EnvConfig
	SAClient          client.Client // in-cluster SA client for elevated operations (nil in local dev)
	OTelConfigManager *otelConfigManager
	shared            sharedClientParts
}

func NewTokenClientFactory(logger *slog.Logger, cfg config.EnvConfig, rootCAs *x509.CertPool) *TokenClientFactory {
	ocm, err := newOTelConfigManager(logger, cfg, rootCAs)
	if err != nil {
		logger.Warn("failed to create OTel config manager, tracing route management will be unavailable", "error", err)
	}

	f := &TokenClientFactory{
		Logger:            logger,
		Header:            cfg.AuthTokenHeader,
		Prefix:            cfg.AuthTokenPrefix,
		Config:            cfg,
		OTelConfigManager: ocm,
		shared:            newSharedClientParts(logger),
	}

	if !cfg.MockK8sClient {
		saClient, err := buildSAClient(logger)
		if err != nil {
			logger.Warn("SA client unavailable (expected outside cluster)", "error", err)
		} else {
			f.SAClient = saClient
			logger.Info("SA client initialized for pgvector provisioning")
		}
	}

	return f
}

// buildSAClient creates a controller-runtime client using the pod's service
// account. Used for operations that require elevated permissions (creating
// Deployments, Services, PVCs) that the user's bearer token may not have.
func buildSAClient(logger *slog.Logger) (client.Client, error) {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("not running in cluster: %w", err)
	}

	scheme, err := helper.BuildScheme()
	if err != nil {
		return nil, fmt.Errorf("failed to build scheme: %w", err)
	}

	c, err := client.New(cfg, client.Options{Scheme: scheme})
	if err != nil {
		return nil, fmt.Errorf("failed to create SA client: %w", err)
	}
	return c, nil
}

func (f *TokenClientFactory) ExtractRequestIdentity(httpHeader http.Header) (*integrations.RequestIdentity, error) {
	raw := httpHeader.Get(f.Header)

	// Fallback: when the primary header (e.g. x-forwarded-access-token) is absent,
	// try the Authorization header with Bearer prefix. OGX's remote::passthrough
	// provider sends the user JWT this way on proxy endpoints.
	if raw == "" {
		if auth := httpHeader.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			token := strings.TrimPrefix(auth, "Bearer ")
			return &integrations.RequestIdentity{
				Token: strings.TrimSpace(token),
			}, nil
		}
		return nil, fmt.Errorf("missing required Header: %s", f.Header)
	}

	token := raw
	if f.Prefix != "" {
		if !strings.HasPrefix(raw, f.Prefix) {
			return nil, fmt.Errorf("expected token Header %s to start with Prefix %q", f.Header, f.Prefix)
		}
		token = strings.TrimPrefix(raw, f.Prefix)
	}

	return &integrations.RequestIdentity{
		Token: strings.TrimSpace(token),
	}, nil
}

func (f *TokenClientFactory) GetClient(ctx context.Context) (KubernetesClientInterface, error) {
	identityVal := ctx.Value(constants.RequestIdentityKey)
	if identityVal == nil {
		return nil, fmt.Errorf("missing RequestIdentity in context")
	}

	identity, ok := identityVal.(*integrations.RequestIdentity)
	if !ok || identity.Token == "" {
		return nil, fmt.Errorf("invalid or missing identity token")
	}

	return newTokenKubernetesClient(identity.Token, f.Logger, f.Config, f.SAClient, f.OTelConfigManager, f.shared)
}

func (f *TokenClientFactory) ValidateRequestIdentity(identity *integrations.RequestIdentity) error {
	if identity == nil {
		return errors.New("missing identity")
	}

	if identity.Token == "" {
		return errors.New("token is required for token-based authentication")
	}

	return nil
}
