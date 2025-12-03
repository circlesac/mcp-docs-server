FROM node:lts-slim

# Base setup
RUN apt-get update && apt-get install -y procps curl net-tools unzip && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Build npm package (workspace)
WORKDIR /workspace
COPY . .
RUN bun install
RUN npx wrangler types
RUN bun run build
RUN npm pack && TARBALL=$(ls *.tgz | head -1) && mv $TARBALL /workspace/package.tgz
RUN npm install -g /workspace/package.tgz
RUN npx @circlesac/mcp-docs-server --help || true
RUN timeout 2 npx @circlesac/mcp-docs-server serve || true
RUN npx @circlesac/mcp-docs-server cloudflare --dry-run || true

# Setup mcp-docs-server
WORKDIR /mcp-docs-server
COPY docs ./docs
COPY mcp-docs-server.json ./

# Publish test-mcp-docs-server package
RUN node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('mcp-docs-server.json'));c.package='test-mcp-docs-server';fs.writeFileSync('mcp-docs-server.json',JSON.stringify(c))"
RUN npx @circlesac/mcp-docs-server publish --output /tmp/test-mcp-docs-server-package
# Update package.json to use local package instead of "latest" from npm
RUN node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('/tmp/test-mcp-docs-server-package/package.json'));pkg.dependencies['@circlesac/mcp-docs-server']='file:/workspace/package.tgz';fs.writeFileSync('/tmp/test-mcp-docs-server-package/package.json',JSON.stringify(pkg,null,2))"
RUN npm pack /tmp/test-mcp-docs-server-package && TARBALL=$(ls test-mcp-docs-server-*.tgz | head -1) && mv $TARBALL /workspace/test-mcp-docs-server.tgz
RUN npm install -g /workspace/test-mcp-docs-server.tgz
RUN timeout 2 npx test-mcp-docs-server || true

# Pre-build Cloudflare Worker for faster tests (save to /tmp to avoid volume mount override)
RUN npx @circlesac/mcp-docs-server cloudflare --dry-run --output /tmp/cloudflare-build || true

CMD ["sh"]
