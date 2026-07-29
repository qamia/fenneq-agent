/**
 * Constants used across the chat view components
 */
export const CHAT_CONSTANTS = {
	MAX_IMAGES_AND_FILES_PER_MESSAGE: 20,
	// Show the starter briefs until the user has this many engagements, then
	// the welcome screen yields to the task-history preview instead.
	QUICK_WINS_HISTORY_THRESHOLD: 8,
} as const;
