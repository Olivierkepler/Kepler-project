import { createApp } from "./app.js";
import { loadAgentServiceEnv } from "./config/env.js";

const env = loadAgentServiceEnv();

if (!process.env.GOOGLE_GENAI_USE_ENTERPRISE) {
  process.env.GOOGLE_GENAI_USE_ENTERPRISE = "true";
}
if (!process.env.GOOGLE_CLOUD_LOCATION) {
  process.env.GOOGLE_CLOUD_LOCATION = env.googleCloudLocation;
}

const app = createApp({ env });

app.listen(env.port, () => {
  console.log(
    JSON.stringify({
      event: "agent_service_listening",
      port: env.port,
      model: env.geminiModel,
      oidcMode: env.oidcMode,
      timestamp: new Date().toISOString(),
    }),
  );
});
