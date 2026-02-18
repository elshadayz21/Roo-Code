import type OpenAI from "openai"

const SELECT_ACTIVE_INTENT_DESCRIPTION = `Select an active intent from the orchestration layer to begin work. This MUST be your first action in any task as per the Constitution.

Parameters:
- intent_id: (required) The Intent ID identified from .orchestration/active_intents.yaml`

const INTENT_ID_PARAMETER_DESCRIPTION = `The Intent ID of the intent you are selecting (e.g., INT-001)`

export default {
	type: "function",
	function: {
		name: "select_active_intent",
		description: SELECT_ACTIVE_INTENT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: INTENT_ID_PARAMETER_DESCRIPTION,
				},
			},
			required: ["intent_id"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
