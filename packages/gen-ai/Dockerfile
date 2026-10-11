# Frontend build stage
# Build from repository root: docker build -f packages/gen-ai/Dockerfile .
FROM registry.access.redhat.com/ubi9/nodejs-20 AS ui-builder
USER root
WORKDIR /usr/src/workspace
# Copy root workspace manifest (needed for npm workspaces)
COPY package.json package-lock.json* ./
# Copy frontend workspace manifests (for @odh-dashboard/internal)
COPY frontend/package.json ./frontend/
COPY frontend/src/package.json ./frontend/src/
# CEAMLS: copy every workspace package. @odh-dashboard/internal (frontend/src)
# imports ui-core, k8s-core, foundation, analytics and, through those,
# model-serving, hardware-profiles, trustyai and connection-types; the
# short list this file used to carry broke the build with "Module not
# found: @odh-dashboard/ui-core/..." (CI run 38132007221, 2026-10-11).
COPY packages/ ./packages/
# Copy frontend source (for @odh-dashboard/internal exports)
COPY frontend/src/ ./frontend/src/
RUN chown -R default:root /usr/src/workspace && chmod -R g+w /usr/src/workspace
USER default
# Install workspace dependencies at root level
RUN npm ci --ignore-scripts
# Change to module directory and install module dependencies
WORKDIR /usr/src/workspace/packages/gen-ai/frontend
RUN npm ci --ignore-scripts
ENV DEPLOYMENT_MODE=standalone
RUN npm run build:prod

# Backend build stage
# CEAMLS: the public mirror of the same image; GitHub Actions has no registry.redhat.io login.
FROM registry.access.redhat.com/ubi9/go-toolset:1.26 AS bff-builder
WORKDIR /usr/src/app
COPY packages/gen-ai/bff/go.mod packages/gen-ai/bff/go.sum ./
COPY pkg/tls/go.mod pkg/tls/go.sum /pkg/tls/
RUN go mod download
COPY pkg/tls/ /pkg/tls/
COPY packages/gen-ai/bff/cmd/ cmd/
COPY packages/gen-ai/bff/internal/ internal/
RUN CGO_ENABLED=0 GOOS=linux go build -a -o /tmp/bff ./cmd

# Final minimal image
FROM registry.access.redhat.com/ubi9/ubi-minimal:9.3
WORKDIR /
COPY --from=bff-builder /tmp/bff ./
COPY --from=ui-builder /usr/src/workspace/packages/gen-ai/frontend/dist/ ./static/
COPY packages/gen-ai/bff/openapi/ ./openapi/

# OAuth environment variables
ENV OAUTH_ENABLED=false \
    OAUTH_CLIENT_ID="" \
    OAUTH_CLIENT_SECRET="" \
    OAUTH_REDIRECT_URI="" \
    OAUTH_SERVER_URL=""

USER 1001
EXPOSE 8080
# CEAMLS: ENTRYPOINT, not CMD. The dashboard operator runs deploy/gen-ai-ui
# with args only (--auth-method=... --port=8143 ...), and args replace a CMD.
# Dockerfile.workspace, which the stock image comes from, uses ENTRYPOINT too.
ENTRYPOINT ["/bff"]
