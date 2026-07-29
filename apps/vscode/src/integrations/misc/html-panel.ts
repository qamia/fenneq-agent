/**
 * Show a self-contained HTML document in an editor webview panel beside the
 * chat. Used by render_plan so the client report appears inside Qortex rather
 * than bouncing to an external browser. The vscode module is resolved lazily:
 * on hosts without it (standalone/JetBrains) this returns false and callers
 * fall back to opening the file externally.
 */
export async function showHtmlPanel(
	title: string,
	html: string,
): Promise<boolean> {
	try {
		// Late require so this module stays loadable on non-VS Code hosts.
		const vscode = require("vscode") as typeof import("vscode");
		const panel = vscode.window.createWebviewPanel(
			"qortex.planReport",
			title,
			{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
			{ enableScripts: false },
		);
		panel.webview.html = html;
		return true;
	} catch {
		return false;
	}
}
