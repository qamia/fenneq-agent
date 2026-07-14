// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import assert from "node:assert";
import { DIFF_VIEW_URI_SCHEME } from "@hosts/vscode/VscodeDiffViewProvider";
import * as vscode from "vscode";
import { Logger } from "@/shared/services/Logger";
import { sendAccountButtonClickedEvent } from "./core/controller/ui/subscribeToAccountButtonClicked";
import { sendChatButtonClickedEvent } from "./core/controller/ui/subscribeToChatButtonClicked";
import { sendHistoryButtonClickedEvent } from "./core/controller/ui/subscribeToHistoryButtonClicked";
import { sendMcpButtonClickedEvent } from "./core/controller/ui/subscribeToMcpButtonClicked";
import { sendSettingsButtonClickedEvent } from "./core/controller/ui/subscribeToSettingsButtonClicked";
import { sendWorktreesButtonClickedEvent } from "./core/controller/ui/subscribeToWorktreesButtonClicked";
import { WebviewProvider } from "./core/webview";
import { createClineAPI } from "./exports";
import { initializeTestMode } from "./services/test/TestMode";
import "./utils/path"; // necessary to have access to String.prototype.toPosix
import path from "node:path";
import type { ExtensionContext } from "vscode";
import { HostProvider } from "@/hosts/host-provider";
import { vscodeHostBridgeClient } from "@/hosts/vscode/hostbridge/client/host-grpc-client";
import { createStorageContext } from "@/shared/storage/storage-context";
import { readTextFromClipboard, writeTextToClipboard } from "@/utils/env";
import { initialize, tearDown } from "./common";
import { addToCline } from "./core/controller/commands/addToCline";
import { explainWithCline } from "./core/controller/commands/explainWithCline";
import { fixWithCline } from "./core/controller/commands/fixWithCline";
import { improveWithCline } from "./core/controller/commands/improveWithCline";
import { sendAddToInputEvent } from "./core/controller/ui/subscribeToAddToInput";
import { sendShowWebviewEvent } from "./core/controller/ui/subscribeToShowWebview";
import { HookDiscoveryCache } from "./core/hooks/HookDiscoveryCache";
import {
	cleanupMcpMarketplaceCatalogFromGlobalState,
	cleanupOldApiKey,
	migrateCustomInstructionsToGlobalRules,
	migrateTaskHistoryToFile,
	migrateWelcomeViewCompleted,
	migrateWorkspaceToGlobalStorage,
} from "./core/storage/state-migrations";
import { workspaceResolver } from "./core/workspace";
import {
	findMatchingNotebookCell,
	getContextForCommand,
	showWebview,
} from "./hosts/vscode/commandUtils";
import {
	abortCommitGeneration,
	generateCommitMsg,
} from "./hosts/vscode/commit-message-generator";
import { registerClineOutputChannel } from "./hosts/vscode/hostbridge/env/debugLog";
import {
	disposeVscodeCommentReviewController,
	getVscodeCommentReviewController,
} from "./hosts/vscode/review/VscodeCommentReviewController";
import { VscodeTerminalManager } from "./hosts/vscode/terminal/VscodeTerminalManager";
import { VscodeDiffViewProvider } from "./hosts/vscode/VscodeDiffViewProvider";
import { VscodeWebviewProvider } from "./hosts/vscode/VscodeWebviewProvider";
import { exportVSCodeStorageToSharedFiles } from "./hosts/vscode/vscode-to-file-migration";
import { ExtensionRegistryInfo } from "./registry";
import { AuthService } from "./services/auth/AuthService";
import { LogoutReason } from "./services/auth/types";
import { telemetryService } from "./services/telemetry";
import {
	LG_TASK_URI_PATH,
	SharedUriHandler,
	TASK_URI_PATH,
} from "./services/uri/SharedUriHandler";
import { ShowMessageType } from "./shared/proto/host/window";
import { fileExistsAtPath } from "./utils/fs";

// ── BYOK launch key modal (a big, centered, full-page "enter your Qortex key"
// screen shown as an editor tab when no key is set) ───────────────────────────
function makeNonce(): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let out = "";
	for (let i = 0; i < 32; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}

function buildQortexKeyModalHtml(nonce: string, notice?: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; align-items: center; justify-content: center;
    font-family: var(--vscode-font-family); color: var(--vscode-foreground);
    /* dimmed backdrop, like a web modal overlay */
    background: color-mix(in srgb, var(--vscode-editor-background) 55%, black); }
  .card { width: min(560px, 88vw); display: flex; flex-direction: column;
    align-items: center; gap: 22px; text-align: center; padding: 44px 40px 32px;
    position: relative; border-radius: 16px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #3a3a3a));
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55); }
  .close { position: absolute; top: 12px; right: 12px; width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center; border: none;
    border-radius: 6px; background: transparent; cursor: pointer; font-size: 16px;
    line-height: 1; color: var(--vscode-descriptionForeground); padding: 0; }
  .close:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
    color: var(--vscode-foreground); }
  .badge { width: 84px; height: 84px; border-radius: 22px; background: #fff;
    display: flex; align-items: center; justify-content: center; }
  .badge svg { width: 56px; height: 56px; }
  h1 { margin: 0; font-size: 30px; font-weight: 600; letter-spacing: -0.01em; }
  p.sub { margin: 0; font-size: 14px; color: var(--vscode-descriptionForeground); }
  .field { width: 100%; }
  input { width: 100%; box-sizing: border-box; font-size: 16px; padding: 16px 18px;
    border-radius: 14px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #3a3a3a));
    background: var(--vscode-input-background); color: var(--vscode-input-foreground); outline: none; }
  input::placeholder { color: var(--vscode-input-placeholderForeground, #888); }
  input:focus { border-color: var(--vscode-focusBorder); }
  button { width: 100%; font-size: 15px; font-weight: 500; padding: 13px; border: none;
    border-radius: 12px; cursor: pointer; background: var(--vscode-button-background);
    color: var(--vscode-button-foreground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  .note { font-size: 12px; color: var(--vscode-descriptionForeground); margin: 0; }
  .note a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  .note a:hover { text-decoration: underline; }
  .error { font-size: 13px; margin: 0; color: var(--vscode-errorForeground, #f66); }
  .notice { font-size: 13px; margin: 0; color: var(--vscode-editorWarning-foreground, #e2c08d); }
  .remember { width: 100%; display: flex; align-items: center; gap: 8px; font-size: 13px;
    color: var(--vscode-descriptionForeground); cursor: pointer; user-select: none; }
  .remember input { width: 15px; height: 15px; margin: 0; cursor: pointer;
    accent-color: var(--vscode-button-background); }
</style>
</head>
<body>
  <div class="card">
    <button class="close" id="close" title="Quit Qortex" aria-label="Quit Qortex">✕</button>
    <div class="badge">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#1f8f4e" d="M6 3 H19 V7 H10 V11 H17 V15 H10 V21 H6 Z" /></svg>
    </div>
    <h1>Welcome to Qortex</h1>
    <p class="sub">Enter your Qortex key to start using FenneQ</p>
    ${notice ? `<p class="notice">${notice}</p>` : ""}
    <div class="field">
      <input id="key" type="password" placeholder="Enter your Qortex key…" autocomplete="off" spellcheck="false" />
    </div>
    <label class="remember"><input id="remember" type="checkbox" checked /> Remember this key on this device</label>
    <p class="error" id="err" hidden></p>
    <button id="go" disabled>Start coding</button>
    <p class="note">Your Qortex key is your Anthropic API key — get one at <a href="https://console.anthropic.com/settings/keys">console.anthropic.com</a>.</p>
    <p class="note">Stored locally on this machine. Never shared.</p>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('key');
    const go = document.getElementById('go');
    const err = document.getElementById('err');
    let busy = false;
    const sync = () => { go.disabled = busy || input.value.trim().length === 0; };
    const submit = () => {
      const v = input.value.trim();
      if (!v || busy) { return; }
      busy = true;
      err.hidden = true;
      go.textContent = 'Checking your key…';
      sync();
      vscode.postMessage({ type: 'submitKey', key: v, remember: document.getElementById('remember').checked });
    };
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg && msg.type === 'keyStatus' && !msg.ok) {
        busy = false;
        go.textContent = 'Start coding';
        err.textContent = msg.message;
        err.hidden = false;
        sync();
        input.focus();
      }
    });
    input.addEventListener('input', () => { err.hidden = true; sync(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    go.addEventListener('click', submit);
    document.getElementById('close').addEventListener('click', () => {
      vscode.postMessage({ type: 'closeModal' });
    });
    input.focus();
  </script>
</body>
</html>`;
}

/**
 * Best-effort check that an Anthropic API key is real: GET /v1/models is free,
 * fast, and returns 401 for a bad key. Network trouble must not lock the user
 * out, so anything other than a definitive auth rejection counts as "ok".
 */
async function validateAnthropicKey(key: string): Promise<"ok" | "invalid"> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);
		try {
			const response = await fetch(
				"https://api.anthropic.com/v1/models?limit=1",
				{
					method: "GET",
					headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
					signal: controller.signal,
				},
			);
			return response.status === 401 || response.status === 403
				? "invalid"
				: "ok";
		} finally {
			clearTimeout(timeout);
		}
	} catch {
		return "ok"; // offline / DNS / timeout — fail open
	}
}

// This method is called when the VS Code extension is activated.
// NOTE: This is VS Code specific - services that should be registered
// for all-platform should be registered in common.ts.
export async function activate(context: vscode.ExtensionContext) {
	const activationStartTime = performance.now();

	// 1. Set up HostProvider for VSCode
	// IMPORTANT: This must be done before any service can be registered
	setupHostProvider(context);

	// 2. Clean up legacy data patterns within VSCode's native storage.
	// Moves workspace→global keys, task history→file, custom instructions→rules, etc.
	// Must run BEFORE the file export so we copy clean state.
	await cleanupLegacyVSCodeStorage(context);

	// 3. One-time export of VSCode's native storage to shared file-backed stores.
	// After this, all platforms (VSCode, CLI, JetBrains) read from ~/.cline/data/.
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const storageContext = createStorageContext({ workspacePath });
	await exportVSCodeStorageToSharedFiles(context, storageContext);

	// 4. Register services and perform common initialization
	// IMPORTANT: Must be done after host provider is setup and migrations are complete
	const webview = (await initialize(storageContext)) as VscodeWebviewProvider;

	// 5. Register services and commands specific to VS Code
	// Initialize test mode and add disposables to context
	const testModeWatchers = await initializeTestMode(webview);
	context.subscriptions.push(...testModeWatchers);

	// Initialize hook discovery cache for performance optimization
	HookDiscoveryCache.getInstance().initialize(
		context as any, // Adapt VSCode ExtensionContext to generic interface
		(dir: string) => {
			try {
				const pattern = new vscode.RelativePattern(dir, "*");
				const watcher = vscode.workspace.createFileSystemWatcher(pattern);
				// Ensure watcher is disposed when extension is deactivated
				context.subscriptions.push(watcher);
				// Adapt VSCode FileSystemWatcher to generic interface
				return {
					onDidCreate: (listener: () => void) => watcher.onDidCreate(listener),
					onDidChange: (listener: () => void) => watcher.onDidChange(listener),
					onDidDelete: (listener: () => void) => watcher.onDidDelete(listener),
					dispose: () => watcher.dispose(),
				};
			} catch {
				return null;
			}
		},
		(callback: () => void) => {
			// Adapt VSCode Disposable to generic interface
			const disposable = vscode.workspace.onDidChangeWorkspaceFolders(callback);
			context.subscriptions.push(disposable);
			return disposable;
		},
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			VscodeWebviewProvider.SIDEBAR_ID,
			webview,
			{
				webviewOptions: { retainContextWhenHidden: true },
			},
		),
	);

	// BYOK launch key gate:
	// - No key saved → show the key modal.
	// - Key saved but the user unchecked "Remember" last time → honor that: wipe
	//   the session-only key and ask again.
	// - Key saved and remembered → silently re-check it against Anthropic (fail
	//   open on network trouble); if it was revoked, wipe it and ask again with a
	//   notice. Valid → straight into the editor, no modal.
	void (async () => {
		try {
			const REMEMBER_FLAG = "qortex.rememberKeyOnDevice";
			const clearSavedKey = async () => {
				const current = webview.controller.stateManager.getApiConfiguration();
				webview.controller.stateManager.setApiConfiguration({
					...current,
					apiKey: undefined,
				});
				await webview.controller.postStateToWebview();
			};

			const savedKey = webview.controller.stateManager
				.getApiConfiguration()
				?.apiKey?.trim();
			const remembered = context.globalState.get<boolean>(REMEMBER_FLAG, true);
			let notice: string | undefined;
			if (savedKey && !remembered) {
				await clearSavedKey();
				notice =
					"Enter your key to start this session — you chose not to stay signed in on this device.";
			} else if (savedKey) {
				if ((await validateAnthropicKey(savedKey)) === "ok") {
					return; // remembered + still valid → no modal
				}
				await clearSavedKey();
				notice =
					"Your saved key is no longer valid — it may have been revoked. Enter a new one.";
			}

			const nonce = makeNonce();
			const panel = vscode.window.createWebviewPanel(
				"qortexKeySetup",
				"Welcome to Qortex",
				vscode.ViewColumn.Active,
				{ enableScripts: true, retainContextWhenHidden: true },
			);
			panel.webview.html = buildQortexKeyModalHtml(nonce, notice);
			// Modal semantics: the key is mandatory. Completing the form is the ONLY
			// way past this screen — the ✕ button quits Qortex, closing the tab quits
			// Qortex, and switching away snaps back to it.
			let completed = false;
			panel.onDidDispose(() => {
				if (!completed) {
					void vscode.commands.executeCommand("workbench.action.quit");
				}
			});
			panel.onDidChangeViewState(() => {
				if (!completed && !panel.active) {
					panel.reveal(vscode.ViewColumn.Active);
				}
			});
			panel.webview.onDidReceiveMessage(async (msg) => {
				if (msg?.type === "closeModal") {
					completed = true; // suppress the dispose handler; we're quitting anyway
					await vscode.commands.executeCommand("workbench.action.quit");
					return;
				}
				if (msg?.type !== "submitKey") {
					return;
				}
				const key = String(msg.key ?? "").trim();
				if (!key) {
					return;
				}
				// Validate against Anthropic before saving so a mistyped key fails
				// HERE (with a friendly message) instead of mid-task with a red error.
				// Fail open on network problems — validation is best-effort.
				const verdict = await validateAnthropicKey(key);
				if (verdict === "invalid") {
					panel.webview.postMessage({
						type: "keyStatus",
						ok: false,
						message:
							"That key doesn't look valid. Check it at console.anthropic.com/settings/keys and try again.",
					});
					return;
				}
				const rememberChoice = msg.remember !== false;
				await context.globalState.update(REMEMBER_FLAG, rememberChoice);
				const current = webview.controller.stateManager.getApiConfiguration();
				webview.controller.stateManager.setApiConfiguration({
					...current,
					apiKey: key,
				});
				await webview.controller.postStateToWebview();
				completed = true; // valid key — allow the modal to close normally
				panel.dispose();
				await vscode.commands
					.executeCommand(`${VscodeWebviewProvider.SIDEBAR_ID}.focus`)
					.then(undefined, () => {});
				vscode.window.showInformationMessage(
					rememberChoice
						? "FenneQ is ready — your Qortex key is saved on this device."
						: "FenneQ is ready for this session — you'll be asked for your key next time.",
				);
			});
		} catch (err) {
			Logger.error(`[BYOK] launch key modal failed: ${err}`);
		}
	})();

	// NOTE: Commands must be added to the internal registry before registering them with VSCode
	const { commands } = ExtensionRegistryInfo;

	context.subscriptions.push(
		vscode.commands.registerCommand(commands.PlusButton, async () => {
			const sidebarInstance = WebviewProvider.getInstance();
			await sidebarInstance.controller.clearTask();
			await sidebarInstance.controller.postStateToWebview();
			await sendChatButtonClickedEvent();
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.McpButton, () =>
			sendMcpButtonClickedEvent(),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.SettingsButton, () =>
			sendSettingsButtonClickedEvent(),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.HistoryButton, () =>
			sendHistoryButtonClickedEvent(),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.AccountButton, () =>
			sendAccountButtonClickedEvent(),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.WorktreesButton, () =>
			sendWorktreesButtonClickedEvent(),
		),
	);

	/*
	We use the text document content provider API to show the left side for diff view by creating a
	virtual document for the original content. This makes it readonly so users know to edit the right
	side if they want to keep their changes.

	- This API allows you to create readonly documents in VSCode from arbitrary sources, and works by
	claiming an uri-scheme for which your provider then returns text contents. The scheme must be
	provided when registering a provider and cannot change afterwards.
	- Note how the provider doesn't create uris for virtual documents - its role is to provide contents
	 given such an uri. In return, content providers are wired into the open document logic so that
	 providers are always considered.
	https://code.visualstudio.com/api/extension-guides/virtual-documents
	*/
	const diffContentProvider = new (class
		implements vscode.TextDocumentContentProvider
	{
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8");
		}
	})();
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(
			DIFF_VIEW_URI_SCHEME,
			diffContentProvider,
		),
	);

	const handleUri = async (uri: vscode.Uri) => {
		const url = decodeURIComponent(uri.toString());
		const uriPath = getUriPath(url);
		const isTaskUri = uriPath === TASK_URI_PATH || uriPath === LG_TASK_URI_PATH;

		if (isTaskUri) {
			await openClineSidebarForTaskUri();
		}

		let success = await SharedUriHandler.handleUri(url);

		// Task deeplinks can race with first-time sidebar initialization.
		if (!success && isTaskUri) {
			await openClineSidebarForTaskUri();
			success = await SharedUriHandler.handleUri(url);
		}

		if (!success) {
			Logger.warn(
				"Extension URI handler: Failed to process URI:",
				uri.toString(),
			);
		}
	};
	context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }));

	// Register size testing commands in development mode
	if (IS_DEV) {
		vscode.commands.executeCommand("setContext", "cline.isDevMode", IS_DEV);
		// Use dynamic import to avoid loading the module in production
		import("./dev/commands/tasks")
			.then((module) => {
				const devTaskCommands = module.registerTaskCommands(webview.controller);
				context.subscriptions.push(...devTaskCommands);
				Logger.log("[Cline Dev] Dev mode activated & dev commands registered");
			})
			.catch((error) => {
				Logger.log("[Cline Dev] Failed to register dev commands: " + error);
			});
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(commands.TerminalOutput, async () => {
			const terminal = vscode.window.activeTerminal;
			if (!terminal) {
				return;
			}

			// Save current clipboard content
			const tempCopyBuffer = await readTextFromClipboard();

			try {
				// Copy the *existing* terminal selection (without selecting all)
				await vscode.commands.executeCommand(
					"workbench.action.terminal.copySelection",
				);

				// Get copied content
				const terminalContents = (await readTextFromClipboard()).trim();

				// Restore original clipboard content
				await writeTextToClipboard(tempCopyBuffer);

				if (!terminalContents) {
					// No terminal content was copied (either nothing selected or some error)
					return;
				}
				// Ensure the sidebar view is visible but preserve editor focus
				await showWebview(true);

				await sendAddToInputEvent(
					`Terminal output:\n\`\`\`\n${terminalContents}\n\`\`\``,
				);

				Logger.log(
					"addSelectedTerminalOutputToChat",
					terminalContents,
					terminal.name,
				);
			} catch (error) {
				// Ensure clipboard is restored even if an error occurs
				await writeTextToClipboard(tempCopyBuffer);
				Logger.error("Error getting terminal contents:", error);
				HostProvider.window.showMessage({
					type: ShowMessageType.ERROR,
					message: "Failed to get terminal contents",
				});
			}
		}),
	);

	// Register code action provider
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			"*",
			new (class implements vscode.CodeActionProvider {
				public static readonly providedCodeActionKinds = [
					vscode.CodeActionKind.QuickFix,
					vscode.CodeActionKind.Refactor,
				];

				provideCodeActions(
					document: vscode.TextDocument,
					range: vscode.Range,
					context: vscode.CodeActionContext,
				): vscode.CodeAction[] {
					const CONTEXT_LINES_TO_EXPAND = 3;
					const START_OF_LINE_CHAR_INDEX = 0;
					const LINE_COUNT_ADJUSTMENT_FOR_ZERO_INDEXING = 1;

					const actions: vscode.CodeAction[] = [];
					const editor = vscode.window.activeTextEditor; // Get active editor for selection check

					// Expand range to include surrounding 3 lines or use selection if broader
					const selection = editor?.selection;
					let expandedRange = range;
					if (
						editor &&
						selection &&
						!selection.isEmpty &&
						selection.contains(range.start) &&
						selection.contains(range.end)
					) {
						expandedRange = selection;
					} else {
						expandedRange = new vscode.Range(
							Math.max(0, range.start.line - CONTEXT_LINES_TO_EXPAND),
							START_OF_LINE_CHAR_INDEX,
							Math.min(
								document.lineCount - LINE_COUNT_ADJUSTMENT_FOR_ZERO_INDEXING,
								range.end.line + CONTEXT_LINES_TO_EXPAND,
							),
							document.lineAt(
								Math.min(
									document.lineCount - LINE_COUNT_ADJUSTMENT_FOR_ZERO_INDEXING,
									range.end.line + CONTEXT_LINES_TO_EXPAND,
								),
							).text.length,
						);
					}

					// Add to Cline (Always available)
					const addAction = new vscode.CodeAction(
						"Add to FenneQ",
						vscode.CodeActionKind.QuickFix,
					);
					addAction.command = {
						command: commands.AddToChat,
						title: "Add to FenneQ",
						arguments: [expandedRange, context.diagnostics],
					};
					actions.push(addAction);

					// Explain with Cline (Always available)
					const explainAction = new vscode.CodeAction(
						"Explain with FenneQ",
						vscode.CodeActionKind.RefactorExtract,
					); // Using a refactor kind
					explainAction.command = {
						command: commands.ExplainCode,
						title: "Explain with FenneQ",
						arguments: [expandedRange],
					};
					actions.push(explainAction);

					// Improve with Cline (Always available)
					const improveAction = new vscode.CodeAction(
						"Improve with FenneQ",
						vscode.CodeActionKind.RefactorRewrite,
					); // Using a refactor kind
					improveAction.command = {
						command: commands.ImproveCode,
						title: "Improve with FenneQ",
						arguments: [expandedRange],
					};
					actions.push(improveAction);

					// Fix with Cline (Only if diagnostics exist)
					if (context.diagnostics.length > 0) {
						const fixAction = new vscode.CodeAction(
							"Fix with FenneQ",
							vscode.CodeActionKind.QuickFix,
						);
						fixAction.isPreferred = true;
						fixAction.command = {
							command: commands.FixWithCline,
							title: "Fix with FenneQ",
							arguments: [expandedRange, context.diagnostics],
						};
						actions.push(fixAction);
					}
					return actions;
				}
			})(),
			{
				providedCodeActionKinds: [
					vscode.CodeActionKind.QuickFix,
					vscode.CodeActionKind.RefactorExtract,
					vscode.CodeActionKind.RefactorRewrite,
				],
			},
		),
	);

	// Register the command handlers
	context.subscriptions.push(
		vscode.commands.registerCommand(
			commands.AddToChat,
			async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
				const context = await getContextForCommand(range, diagnostics);
				if (!context) {
					return;
				}
				await addToCline(context.controller, context.commandContext);
			},
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			commands.FixWithCline,
			async (range: vscode.Range, diagnostics: vscode.Diagnostic[]) => {
				const context = await getContextForCommand(range, diagnostics);
				if (!context) {
					return;
				}
				await fixWithCline(context.controller, context.commandContext);
			},
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			commands.ExplainCode,
			async (range: vscode.Range) => {
				const context = await getContextForCommand(range);
				if (!context) {
					return;
				}
				await explainWithCline(context.controller, context.commandContext);
			},
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			commands.ImproveCode,
			async (range: vscode.Range) => {
				const context = await getContextForCommand(range);
				if (!context) {
					return;
				}
				await improveWithCline(context.controller, context.commandContext);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			commands.FocusChatInput,
			async (preserveEditorFocus = false) => {
				const webview = WebviewProvider.getInstance() as VscodeWebviewProvider;

				// Show the webview
				const webviewView = webview.getWebview();
				if (webviewView) {
					if (preserveEditorFocus) {
						// Only make webview visible without forcing focus
						webviewView.show(false);
					} else {
						// Show and force focus (default behavior for explicit focus actions)
						webviewView.show(true);
					}
				}

				// Send show webview event with preserveEditorFocus flag
				sendShowWebviewEvent(preserveEditorFocus);
				telemetryService.captureButtonClick(
					"command_focusChatInput",
					webview.controller?.task?.ulid,
				);
			},
		),
	);

	// Register Jupyter Notebook command handlers
	const NOTEBOOK_EDIT_INSTRUCTIONS = `Special considerations for using replace_in_file on *.ipynb files:
* Jupyter notebook files are JSON format with specific structure for source code cells
* Source code in cells is stored as JSON string arrays ending with explicit \\n characters and commas
* Always match the exact JSON format including quotes, commas, and escaped newlines.`;

	// Helper to get notebook context for Jupyter commands
	async function getNotebookCommandContext(
		range?: vscode.Range,
		diagnostics?: vscode.Diagnostic[],
	) {
		const activeNotebook = vscode.window.activeNotebookEditor;
		if (!activeNotebook) {
			HostProvider.window.showMessage({
				type: ShowMessageType.ERROR,
				message:
					"No active Jupyter notebook found. Please open a .ipynb file first.",
			});
			return null;
		}

		const ctx = await getContextForCommand(range, diagnostics);
		if (!ctx) {
			return null;
		}

		const filePath = ctx.commandContext.filePath || "";
		let cellJson: string | null = null;
		if (activeNotebook.notebook.cellCount > 0) {
			const cellIndex = activeNotebook.notebook.cellAt(
				activeNotebook.selection.start,
			).index;
			cellJson = await findMatchingNotebookCell(filePath, cellIndex);
		}

		return { ...ctx, cellJson };
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(
			commands.JupyterGenerateCell,
			async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
				const userPrompt = await showJupyterPromptInput(
					"Generate Notebook Cell",
					"Enter your prompt for generating notebook cell (press Enter to confirm & Esc to cancel)",
				);
				if (!userPrompt) return;

				const ctx = await getNotebookCommandContext(range, diagnostics);
				if (!ctx) return;

				const notebookContext = `User prompt: ${userPrompt}
Insert a new Jupyter notebook cell above or below the current cell based on user prompt.
${NOTEBOOK_EDIT_INSTRUCTIONS}

Current Notebook Cell Context (JSON, sanitized of image data):
\`\`\`json
${ctx.cellJson || "{}"}
\`\`\``;

				await addToCline(ctx.controller, ctx.commandContext, notebookContext);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			commands.JupyterExplainCell,
			async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
				const ctx = await getNotebookCommandContext(range, diagnostics);
				if (!ctx) return;

				const notebookContext = ctx.cellJson
					? `\n\nCurrent Notebook Cell Context (JSON, sanitized of image data):\n\`\`\`json\n${ctx.cellJson}\n\`\`\``
					: undefined;

				await explainWithCline(
					ctx.controller,
					ctx.commandContext,
					notebookContext,
				);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			commands.JupyterImproveCell,
			async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
				const userPrompt = await showJupyterPromptInput(
					"Improve Notebook Cell",
					"Enter your prompt for improving the current notebook cell (press Enter to confirm & Esc to cancel)",
				);
				if (!userPrompt) return;

				const ctx = await getNotebookCommandContext(range, diagnostics);
				if (!ctx) return;

				const notebookContext = `User prompt: ${userPrompt}
${NOTEBOOK_EDIT_INSTRUCTIONS}

Current Notebook Cell Context (JSON, sanitized of image data):
\`\`\`json
${ctx.cellJson || "{}"}
\`\`\``;

				await improveWithCline(
					ctx.controller,
					ctx.commandContext,
					notebookContext,
				);
			},
		),
	);

	// Register the openWalkthrough command handler
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.Walkthrough, async () => {
			await vscode.commands.executeCommand(
				"workbench.action.openWalkthrough",
				`${context.extension.id}#ClineWalkthrough`,
			);
			telemetryService.captureButtonClick("command_openWalkthrough");
		}),
	);

	// Register the reconstructTaskHistory command handler
	context.subscriptions.push(
		vscode.commands.registerCommand(
			commands.ReconstructTaskHistory,
			async () => {
				const { reconstructTaskHistory } = await import(
					"./core/commands/reconstructTaskHistory"
				);
				await reconstructTaskHistory();
				telemetryService.captureButtonClick("command_reconstructTaskHistory");
			},
		),
	);

	// Register the generateGitCommitMessage command handler
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.GenerateCommit, async (scm) => {
			generateCommitMsg(webview.controller, scm);
		}),
		vscode.commands.registerCommand(commands.AbortCommit, () => {
			abortCommitGeneration();
		}),
	);

	// Listen for secrets changes (e.g., cross-window login/logout sync)
	const unsubSecrets = storageContext.secrets.onDidChange((event) => {
		if (event.key === "cline:clineAccountId") {
			const secretValue = storageContext.secrets.get<string>(event.key);
			const activeWebview = WebviewProvider.getVisibleInstance();
			const controller = activeWebview?.controller;

			const authService = AuthService.getInstance(controller);
			if (secretValue) {
				// Secret was added or updated - restore auth info (login from another window)
				authService?.restoreRefreshTokenAndRetrieveAuthInfo();
			} else {
				// Secret was removed - handle logout for all windows
				authService?.handleDeauth(LogoutReason.CROSS_WINDOW_SYNC);
			}
		}
	});
	context.subscriptions.push({ dispose: unsubSecrets });

	Logger.log(
		`[Cline] extension activated in ${performance.now() - activationStartTime} ms`,
	);

	return createClineAPI(webview.controller);
}

async function showJupyterPromptInput(
	title: string,
	placeholder: string,
): Promise<string | undefined> {
	return new Promise((resolve) => {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = title;
		quickPick.placeholder = placeholder;
		quickPick.ignoreFocusOut = true;

		// Allow free text input
		quickPick.canSelectMany = false;

		let userInput = "";

		quickPick.onDidChangeValue((value) => {
			userInput = value;
			// Update items to show the current input
			if (value) {
				quickPick.items = [
					{
						label: "$(check) Use this prompt",
						detail: value,
						alwaysShow: true,
					},
				];
			} else {
				quickPick.items = [];
			}
		});

		quickPick.onDidAccept(() => {
			if (userInput) {
				resolve(userInput);
				quickPick.hide();
			}
		});

		quickPick.onDidHide(() => {
			if (!userInput) {
				resolve(undefined);
			}
			quickPick.dispose();
		});

		quickPick.show();
	});
}

function setupHostProvider(context: ExtensionContext) {
	const outputChannel = registerClineOutputChannel(context);
	outputChannel.appendLine("[Cline] Setting up VS Code host...");

	const createWebview = () => new VscodeWebviewProvider(context);
	const createDiffView = () => new VscodeDiffViewProvider();
	const createCommentReview = () => getVscodeCommentReviewController();
	const createTerminalManager = () => new VscodeTerminalManager();

	const getCallbackUrl = async (path: string, _preferredPort?: number) => {
		const scheme = vscode.env.uriScheme || "vscode";
		const callbackUri = vscode.Uri.parse(
			`${scheme}://${context.extension.id}${path}`,
		);

		if (vscode.env.uiKind === vscode.UIKind.Web) {
			// In VS Code Web (Codespaces, code serve-web), vscode:// URIs redirect to the
			// desktop app instead of staying in the browser. Use asExternalUri to convert
			// to a web-reachable HTTPS URL that routes back to the extension's URI handler.
			const externalUri = await vscode.env.asExternalUri(callbackUri);
			return externalUri.toString(true);
		}

		// In regular desktop VS Code, use the vscode:// URI protocol handler directly.
		return callbackUri.toString(true);
	};
	HostProvider.initialize(
		createWebview,
		createDiffView,
		createCommentReview,
		createTerminalManager,
		vscodeHostBridgeClient,
		() => {}, // No-op logger, logging is handled via HostProvider.env.debugLog
		getCallbackUrl,
		getBinaryLocation,
		context.extensionUri.fsPath,
		context.globalStorageUri.fsPath,
	);
}

function getUriPath(url: string): string | undefined {
	try {
		return new URL(url).pathname;
	} catch {
		return undefined;
	}
}

async function openClineSidebarForTaskUri(): Promise<void> {
	const sidebarWaitTimeoutMs = 3000;
	const sidebarWaitIntervalMs = 50;

	await vscode.commands.executeCommand(
		`${ExtensionRegistryInfo.views.Sidebar}.focus`,
	);

	const startedAt = Date.now();
	while (Date.now() - startedAt < sidebarWaitTimeoutMs) {
		if (WebviewProvider.getVisibleInstance()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, sidebarWaitIntervalMs));
	}

	Logger.warn(
		"Task URI handling timed out waiting for Cline sidebar visibility",
	);
}

async function getBinaryLocation(name: string): Promise<string> {
	// The only binary currently supported is the rg binary from the VSCode installation.
	if (!name.startsWith("rg")) {
		throw new Error(`Binary '${name}' is not supported`);
	}

	const checkPath = async (pkgFolder: string) => {
		const fullPathResult = workspaceResolver.resolveWorkspacePath(
			vscode.env.appRoot,
			path.join(pkgFolder, name),
			"Services.ripgrep.getBinPath",
		);
		const fullPath =
			typeof fullPathResult === "string"
				? fullPathResult
				: fullPathResult.absolutePath;
		return (await fileExistsAtPath(fullPath)) ? fullPath : undefined;
	};

	// VS Code 1.122.0 (microsoft/vscode#317978 et al.) migrated from @vscode/ripgrep
	// to @vscode/ripgrep-universal, which ships per-platform/arch subdirectories.
	// Probe the new layout first; fall back to the legacy paths for ≤1.121.x.
	const platformArch = `${process.platform}-${process.arch}`;
	const binPath =
		(await checkPath(
			`node_modules/@vscode/ripgrep-universal/bin/${platformArch}/`,
		)) ||
		(await checkPath(
			`node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/${platformArch}/`,
		)) ||
		(await checkPath("node_modules/@vscode/ripgrep/bin/")) ||
		(await checkPath("node_modules/vscode-ripgrep/bin")) ||
		(await checkPath("node_modules.asar.unpacked/vscode-ripgrep/bin/")) ||
		(await checkPath("node_modules.asar.unpacked/@vscode/ripgrep/bin/"));
	if (!binPath) {
		throw new Error("Could not find ripgrep binary");
	}
	return binPath;
}

// This method is called when your extension is deactivated
export async function deactivate() {
	// Dispose Non-VSCode-specific services
	tearDown();

	// VSCode-specific services
	disposeVscodeCommentReviewController();
}

// TODO: Find a solution for automatically removing DEV related content from production builds.
//  This type of code is fine in production to keep. We just will want to remove it from production builds
//  to bring down built asset sizes.
//
// This is a workaround to reload the extension when the source code changes
// since vscode doesn't support hot reload for extensions
const IS_DEV = process.env.IS_DEV === "true";
const DEV_WORKSPACE_FOLDER = process.env.DEV_WORKSPACE_FOLDER;

// Set up development mode file watcher
if (IS_DEV) {
	assert(
		DEV_WORKSPACE_FOLDER,
		"DEV_WORKSPACE_FOLDER must be set in development",
	);
	const watcher = vscode.workspace.createFileSystemWatcher(
		new vscode.RelativePattern(DEV_WORKSPACE_FOLDER, "src/**/*"),
	);

	watcher.onDidChange(({ scheme, path }) => {
		Logger.info(`${scheme} ${path} changed. Reloading VSCode...`);

		vscode.commands.executeCommand("workbench.action.reloadWindow");
	});
}

// VSCode-specific storage migrations
async function cleanupLegacyVSCodeStorage(
	context: ExtensionContext,
): Promise<void> {
	try {
		await cleanupOldApiKey(context);
		// Migrate is not done if the new storage does not have the lastShownAnnouncementId flag
		const hasMigrated = context.globalState.get("lastShownAnnouncementId");
		if (hasMigrated !== undefined) {
			return;
		}

		Logger.info("[VS Code Storage Migrations] Starting");

		// Migrate custom instructions to global Cline rules (one-time cleanup)
		await migrateCustomInstructionsToGlobalRules(context);

		// Migrate welcomeViewCompleted setting based on existing API keys (one-time cleanup)
		await migrateWelcomeViewCompleted(context);

		// Migrate workspace storage values back to global storage (reverting previous migration)
		await migrateWorkspaceToGlobalStorage(context);

		// Ensure taskHistory.json exists and migrate legacy state (runs once)
		await migrateTaskHistoryToFile(context);

		// Clean up MCP marketplace catalog from global state (moved to disk cache)
		await cleanupMcpMarketplaceCatalogFromGlobalState(context);

		// lastShownAnnouncementId will be set when announcement is shown
		// after activation so we don't need to set it here.

		Logger.info("[VS Code Storage Migrations] Completed");
	} catch (error) {
		Logger.warn(
			"[VS Code Storage Migrations] Failed" +
				(error instanceof Error ? `: ${error.message}` : ""),
		);
	}
}
