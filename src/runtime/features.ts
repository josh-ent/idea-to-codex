export interface StudioFeatureFlags {
  intake_sessions_v1: boolean;
  proposal_llm_v1: boolean;
}

export function readFeatureFlags(
  env: NodeJS.ProcessEnv = process.env,
): StudioFeatureFlags {
  return {
    intake_sessions_v1: readBooleanFlag(env.IDEA_TO_CODEX_INTAKE_SESSIONS_V1, true),
    proposal_llm_v1: readBooleanFlag(env.IDEA_TO_CODEX_PROPOSAL_LLM_V1, false),
  };
}

function readBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (!value?.trim()) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}
