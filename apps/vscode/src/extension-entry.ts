// Thin activation entry — see launchGate.ts for the why.
//
// The real extension lives in extension-core.js, a ~20 MB bundle whose parse
// alone costs several seconds on modest machines. VS Code loads THIS tiny
// bundle instead: it puts the subscription gate on screen first, and only then
// pays for the core parse — the modal renders (in the separate webview
// process) while the extension host is still evaluating the core.
import type * as vscode from "vscode";
import { startQortexKeyGate } from "./launchGate";

export async function activate(context: vscode.ExtensionContext) {
	try {
		startQortexKeyGate(context);
	} catch (err) {
		console.error("[Qortex] launch key gate failed to start:", err);
	}
	// The heavy parse happens on this require — after the modal is already up.
	const core = require("./extension-core.js") as typeof import("./extension");
	return core.activate(context);
}

export function deactivate() {
	const core = require("./extension-core.js") as typeof import("./extension");
	return core.deactivate();
}
