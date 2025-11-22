# Dockerfile for testing the npm package locally
# Use Debian-based image for better compatibility with Cloudflare workerd
FROM node:lts-slim

# Install bun and npm
RUN npm install -g bun@1.3.1

# Install common utilities (ps, curl, pkill, etc.)
RUN apt-get update && apt-get install -y \
    procps \
    curl \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy all necessary files (exclusions in .dockerignore)
COPY . .

# Install dependencies
RUN bun install

# Generate worker-configuration.d.ts using wrangler types
RUN npx wrangler types

# Build the package
RUN bun run build

# Create npm pack tarball
RUN npm pack && TARBALL=$(ls *.tgz | head -1) && echo "Created: $TARBALL" && mv $TARBALL /workspace/package.tgz

# Install the package globally so npx can find it from any directory
RUN npm install -g /workspace/package.tgz

# Create a test project directory (without package.json) to simulate real usage
WORKDIR /acme-docs
RUN mkdir -p /acme-docs

# Copy docs and config for testing
COPY docs ./docs
COPY mcp-docs-server.json ./

# Test that the CLI works
RUN npx @circlesac/mcp-docs-server --help || true

# Test serve command (should work with copied content)
RUN timeout 2 npx @circlesac/mcp-docs-server serve || true

# Test cloudflare command (dry-run)
RUN npx @circlesac/mcp-docs-server cloudflare --dry-run || true

# Keep container running for interactive testing
CMD ["sh"]

