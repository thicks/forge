export function generateStandalonePnpmWorkspace(): string {
	return `allowBuilds:
  agent-browser: true
  core-js: true
  esbuild: true
  sharp: true
  protobufjs: true
`;
}
