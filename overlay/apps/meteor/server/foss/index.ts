// Stands in for the licensed `ee/server` entry point imported by server/main.ts.
// The Apps-Engine orchestrator it starts is licensed code, so a FOSS build runs without apps.
export const startupApp = async (): Promise<void> => undefined;
