export function generatePnpmWorkspace(): string {
	return `packages:
  - "apps/*"
  - "packages/*"

allowBuilds:
  agent-browser: true
  core-js: true
  esbuild: true
  sharp: true
  protobufjs: true
`;
}
