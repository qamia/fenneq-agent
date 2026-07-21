// Qortex launch key gate — kept dependency-thin ON PURPOSE.
//
// This module is built into its own small chunk (dist/launchGate.js) which the
// TINY entry bundle (dist/extension.js) requires and runs BEFORE the ~20 MB
// core bundle (dist/extension-core.js) is parsed — on modest machines that
// parse alone costs several seconds, and the subscription modal must not wait
// for it. Do not import anything heavy here (no controller, providers,
// HostProvider, protos) or the whole point is lost.

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

/**
 * The FenneQ sidebar view id (= ExtensionRegistryInfo.views.Sidebar). Kept as
 * a literal so the gate does not pull in the registry/webview import tree.
 */
const SIDEBAR_VIEW_ID = "claude-dev.SidebarProvider";

/** Minimal structural slice of the booted core that gate actions need. */
interface GateCoreWebview {
	controller: {
		stateManager: {
			getApiConfiguration(): object | undefined;
			setApiConfiguration(config: object): void;
		};
		postStateToWebview(): Promise<void>;
	};
}

let coreWebview: GateCoreWebview | undefined;
let resolveCoreReady!: () => void;
const coreReady = new Promise<void>((resolve) => {
	resolveCoreReady = resolve;
});

/** Called by the core bundle once StateManager/Controller + sidebar exist. */
export function registerGateCore(webview: GateCoreWebview): void {
	coreWebview = webview;
	resolveCoreReady();
}

/**
 * Read the saved key straight from the shared file-backed secrets
 * (~/.cline/data/secrets.json, CLINE_DIR-overridable) — the same file
 * ClineFileStorage manages, read here without its import tree so the launch
 * decision can happen before the core bundle loads.
 */
function readSavedKeyFromDisk(): string | undefined {
	try {
		const clineDir = process.env.CLINE_DIR || path.join(os.homedir(), ".cline");
		const raw = fs.readFileSync(
			path.join(clineDir, "data", "secrets.json"),
			"utf-8",
		);
		const value = (JSON.parse(raw) as Record<string, unknown>).apiKey;
		return typeof value === "string" ? value.trim() || undefined : undefined;
	} catch {
		return undefined; // missing/unreadable file = no key saved
	}
}
// ── BYOK launch key modal (a big, centered, full-page "enter your Qortex key"
// screen shown as an editor tab when no key is set) ───────────────────────────

/**
 * The Qortex subscription/registration portal (Vercel). Shown as the
 * "Want to subscribe?" link on the key modal. Currently the auto-generated
 * deployment URL; swap for a custom domain when one exists.
 */
const QORTEX_SUBSCRIBE_URL = "https://regis-rosy-ten.vercel.app/";

/** Shape a Qortex key must have before we bother the portal with it. */
const QORTEX_KEY_PATTERN = /^qtx-(pro|proplus|ultra)-[A-Za-z0-9_-]{16,}$/;

/** globalState key caching the last successful validation: {hash, plan, endsAt}. */
const KEY_CACHE_FLAG = "qortex.keyValidationCache";

// Deep-link plumbing (qortex://saoudrizwan.claude-dev/activate?token=…):
// the URI handler may fire before or after the launch gate has set up, and the
// key modal must be closable from outside its closure (its dispose guard quits
// the app unless `complete()` ran first — see the gate).
let qortexKeyModal: {
	panel: vscode.WebviewPanel;
	complete: () => void;
} | null = null;
let applyQortexActivation: ((token: string) => Promise<boolean>) | null = null;
let pendingActivationToken: string | null = null;

function hashKey(key: string): string {
	return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

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
  :root {
    --acc: #1f8f4e;
    --acc-hi: #2aa35d;
    --ink: var(--vscode-foreground);
    --muted: var(--vscode-descriptionForeground);
    --surface: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    --hairline: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display: flex; align-items: center; justify-content: center;
    font-family: var(--vscode-font-family); color: var(--ink);
    /* layered backdrop: soft brand glow over a dimmed vignette */
    background:
      radial-gradient(640px 420px at 50% 32%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%),
      radial-gradient(120% 120% at 50% 110%, color-mix(in srgb, black 30%, transparent), transparent 60%),
      color-mix(in srgb, var(--vscode-editor-background) 52%, black); }
  @keyframes rise { from { opacity: 0; transform: translateY(14px) scale(0.975); }
    to { opacity: 1; transform: none; } }
  .card { width: min(460px, 90vw); display: flex; flex-direction: column;
    gap: 26px; text-align: center; padding: 44px 44px 30px; position: relative;
    border-radius: 20px;
    background: linear-gradient(180deg,
      color-mix(in srgb, var(--surface) 94%, white), var(--surface) 38%);
    border: 1px solid var(--hairline);
    box-shadow:
      0 0 0 1px color-mix(in srgb, black 18%, transparent),
      0 2px 6px rgba(0, 0, 0, 0.25),
      0 32px 72px -20px rgba(0, 0, 0, 0.6),
      0 0 90px -24px color-mix(in srgb, var(--acc) 42%, transparent);
    animation: rise 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
  .close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center; border: none;
    border-radius: 8px; background: transparent; cursor: pointer; font-size: 14px;
    line-height: 1; color: var(--muted); padding: 0; transition: all 0.15s ease; }
  .close:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18));
    color: var(--ink); }
  .head { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .badge { width: 66px; height: 66px; border-radius: 18px; margin-bottom: 8px;
    background: linear-gradient(180deg, #ffffff, #eef3ef);
    display: flex; align-items: center; justify-content: center;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.25),
      0 10px 36px -8px color-mix(in srgb, var(--acc) 55%, transparent); }
  .badge svg { width: 40px; height: 40px; }
  h1 { margin: 0; font-size: 23px; font-weight: 650; letter-spacing: -0.02em; }
  p.sub { margin: 0; font-size: 13px; color: var(--muted); letter-spacing: 0.01em; }
  .form { display: flex; flex-direction: column; gap: 14px; }
  .field { width: 100%; }
  input#key { width: 100%; font-size: 14px; padding: 14px 16px; border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--vscode-foreground) 16%, transparent);
    background: color-mix(in srgb, var(--vscode-input-background) 88%, transparent);
    color: var(--vscode-input-foreground); outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease; }
  input#key::placeholder { color: color-mix(in srgb, var(--muted) 80%, transparent); }
  input#key:hover { border-color: color-mix(in srgb, var(--vscode-foreground) 26%, transparent); }
  input#key:focus { border-color: var(--acc);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 22%, transparent); }
  .remember { display: flex; align-items: center; gap: 8px; font-size: 12px;
    color: var(--muted); cursor: pointer; user-select: none; padding-left: 2px;
    transition: color 0.15s ease; }
  .remember:hover { color: var(--ink); }
  .remember input { width: 14px; height: 14px; margin: 0; cursor: pointer; accent-color: var(--acc); }
  button#go { width: 100%; font-size: 14px; font-weight: 600; padding: 13px;
    border: none; border-radius: 12px; cursor: pointer; color: #fff;
    background: linear-gradient(180deg, var(--acc-hi), var(--acc));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 2px 10px -2px color-mix(in srgb, var(--acc) 60%, transparent);
    transition: all 0.15s ease; letter-spacing: 0.01em; }
  button#go:hover:not(:disabled) { filter: brightness(1.07); transform: translateY(-1px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 6px 18px -4px color-mix(in srgb, var(--acc) 70%, transparent); }
  button#go:active:not(:disabled) { transform: none; filter: brightness(0.97); }
  button#go:disabled { cursor: default; filter: saturate(0.35); opacity: 0.55; box-shadow: none; }
  button#go.working::before { content: ''; display: inline-block; width: 12px; height: 12px;
    margin-right: 8px; vertical-align: -2px; border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.35); border-top-color: #fff;
    animation: whirl 0.8s linear infinite; }
  @keyframes whirl { to { transform: rotate(360deg); } }
  .error { font-size: 12.5px; margin: -2px 0 0; color: var(--vscode-errorForeground, #f66); text-align: left; padding-left: 2px; }
  .notice { font-size: 12.5px; margin: -8px 0 0; color: var(--vscode-editorWarning-foreground, #e2c08d); }
  .notes { display: flex; flex-direction: column; gap: 3px; padding-top: 2px;
    border-top: 1px solid var(--hairline); padding-top: 14px; }
  .note { font-size: 11.5px; line-height: 1.55; color: color-mix(in srgb, var(--muted) 85%, transparent); margin: 0; }
  .note a { color: var(--acc-hi); text-decoration: none; font-weight: 500; }
  .note a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <div class="card">
    <button class="close" id="close" title="Quit Qortex" aria-label="Quit Qortex">✕</button>
    <div class="head">
      <div class="badge">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#1f8f4e" d="M6 3 H19 V7 H10 V11 H17 V15 H10 V21 H6 Z" /></svg>
      </div>
      <h1>Welcome to Qortex</h1>
      <p class="sub">Enter your Qortex key to start using FenneQ</p>
      <p class="notice" id="notice" ${notice ? "" : "hidden"}>${notice ?? ""}</p>
    </div>
    <div class="form">
      <div class="field">
        <input id="key" type="password" placeholder="Enter your Qortex key…" autocomplete="off" spellcheck="false" />
      </div>
      <label class="remember"><input id="remember" type="checkbox" checked /> Remember this key on this device</label>
      <p class="error" id="err" hidden></p>
      <button id="go" disabled>Start solving</button>
    </div>
    <div class="notes">
      <p class="note"><strong>Want to subscribe?</strong> Get your key at <a href="${QORTEX_SUBSCRIBE_URL}">the Qortex portal</a>.</p>
      <p class="note">Stored locally on this machine. Never shared.</p>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('key');
    const go = document.getElementById('go');
    const err = document.getElementById('err');
    const notice = document.getElementById('notice');
    let busy = false;
    let lastPrefill = '';
    const sync = () => { go.disabled = busy || input.value.trim().length === 0; };
    const submit = () => {
      const v = input.value.trim();
      if (!v || busy) { return; }
      busy = true;
      err.hidden = true;
      go.textContent = 'Checking your key…';
      go.classList.add('working');
      sync();
      vscode.postMessage({ type: 'submitKey', key: v, remember: document.getElementById('remember').checked });
    };
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg && msg.type === 'keyStatus' && !msg.ok) {
        busy = false;
        go.textContent = 'Start solving';
        go.classList.remove('working');
        err.textContent = msg.message;
        err.hidden = false;
        sync();
        input.focus();
        return;
      }
      // A fresh qtx-… key found on the clipboard: fill it in, but signing in
      // stays a deliberate click — auto-submitting here logs the user in
      // silently whenever an old key lingers on the clipboard.
      if (msg && msg.type === 'prefillKey' && !busy && msg.key !== lastPrefill && !input.value) {
        lastPrefill = msg.key;
        input.value = msg.key;
        err.hidden = true;
        notice.textContent = 'We found a Qortex key on your clipboard — press Start solving to use it.';
        notice.hidden = false;
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
 * Validate/activate a Qortex key (a subscription token from the Qortex portal)
 * against the portal's /api/activate:
 * - 200  → valid (first activation, or re-login on a still-valid subscription)
 * - 404/400 → the key doesn't exist / is malformed
 * - 403  → the subscription expired
 * Network trouble or portal 5xx must not lock the user out → fail open.
 */
interface QortexKeyVerdict {
	verdict: "ok" | "invalid" | "expired";
	plan?: string;
	endsAt?: string;
}

async function validateQortexKey(key: string): Promise<QortexKeyVerdict> {
	try {
		const controller = new AbortController();
		// Fail-open policy makes long waits pure downside — keep the budget short.
		const timeout = setTimeout(() => controller.abort(), 4000);
		try {
			const response = await fetch(`${QORTEX_SUBSCRIBE_URL}api/activate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token: key }),
				signal: controller.signal,
			});
			if (response.ok) {
				const data = (await response.json().catch(() => ({}))) as {
					plan?: string;
					endsAt?: string;
				};
				return { verdict: "ok", plan: data.plan, endsAt: data.endsAt };
			}
			if (response.status === 403) {
				return { verdict: "expired" };
			}
			if (response.status === 404 || response.status === 400) {
				return { verdict: "invalid" };
			}
			return { verdict: "ok" }; // portal-side 5xx — don't lock users out
		} finally {
			clearTimeout(timeout);
		}
	} catch {
		return { verdict: "ok" }; // offline / DNS / timeout — fail open
	}
}

// BYOK launch key gate:
// - No key saved → show the key modal.
// - Key saved but the user unchecked "Remember" last time → honor that: wipe
//   the session-only key and ask again.
// - Key saved and remembered → enter INSTANTLY from the cached validation
//   when the subscription is known-good for >24h (refresh in the background);
//   otherwise re-check against the portal (fail open). Revoked/expired →
//   wipe and ask again with a notice.
// The modal is escape-proof but polite: ✕/close asks before quitting, a
// qtx-… key on the clipboard auto-fills the form, and a deep link
// (qortex://…/activate?token=…) completes the whole thing hands-free.
export function startQortexKeyGate(context: vscode.ExtensionContext): void {
	const REMEMBER_FLAG = "qortex.rememberKeyOnDevice";

	const saveValidatedKey = async (
		key: string,
		rememberChoice: boolean,
		info: QortexKeyVerdict,
	) => {
		await context.globalState.update(REMEMBER_FLAG, rememberChoice);
		await context.globalState.update(KEY_CACHE_FLAG, {
			hash: hashKey(key),
			plan: info.plan,
			endsAt: info.endsAt,
			// Daily check-in: the saved key expires 24h after the user provided
			// it (savedAt is only ever written here — background validation
			// refreshes preserve it).
			savedAt: new Date().toISOString(),
		});
		await coreReady;
		const stateManager = coreWebview!.controller.stateManager;
		const current = stateManager.getApiConfiguration();
		stateManager.setApiConfiguration({
			...current,
			apiKey: key,
		});
		await coreWebview!.controller.postStateToWebview();
	};

	const clearSavedKey = async () => {
		await context.globalState.update(KEY_CACHE_FLAG, undefined);
		await coreReady;
		const stateManager = coreWebview!.controller.stateManager;
		const current = stateManager.getApiConfiguration();
		stateManager.setApiConfiguration({
			...current,
			apiKey: undefined,
		});
		await coreWebview!.controller.postStateToWebview();
	};

	const keyErrorMessage = (verdict: "invalid" | "expired") =>
		verdict === "expired"
			? "This subscription has expired. Renew your plan at the Qortex portal to get a new key."
			: "That Qortex key isn't valid. Check the key from the Qortex portal and try again.";

	const openKeyModal = (notice?: string) => {
		const nonce = makeNonce();
		const panel = vscode.window.createWebviewPanel(
			"qortexKeySetup",
			"Welcome to Qortex",
			vscode.ViewColumn.Active,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		panel.webview.html = buildQortexKeyModalHtml(nonce, notice);
		// Take over the window: the gate is a screen, not a tab among tabs.
		// closeOtherEditors only when OUR panel is the active editor —
		// otherwise a focus race could close the modal itself.
		const takeOverWindow = () => {
			for (const cmd of [
				"workbench.action.closeSidebar",
				"workbench.action.closeAuxiliaryBar",
			]) {
				void vscode.commands.executeCommand(cmd).then(undefined, () => {});
			}
			if (panel.active) {
				void vscode.commands
					.executeCommand("workbench.action.closeOtherEditors")
					.then(undefined, () => {});
			}
		};
		takeOverWindow();
		let completed = false;
		qortexKeyModal = {
			panel,
			complete: () => {
				completed = true;
			},
		};
		// Warm the portal's serverless functions while the user reads the modal,
		// so their eventual click doesn't pay the cold-start.
		void fetch(`${QORTEX_SUBSCRIBE_URL}api/activate`).catch(() => {});
		void fetch(`${QORTEX_SUBSCRIBE_URL}api/token`).catch(() => {});

		const confirmQuit = async () => {
			const pick = await vscode.window.showWarningMessage(
				"Quit Qortex? A Qortex key is required to continue.",
				{ modal: true },
				"Quit Qortex",
			);
			return pick === "Quit Qortex";
		};
		// A qtx-… key on the clipboard (fresh from the portal) auto-fills the
		// form the moment the user comes back.
		const tryClipboardPrefill = async () => {
			try {
				const clip = (await vscode.env.clipboard.readText())?.trim();
				if (clip && QORTEX_KEY_PATTERN.test(clip)) {
					panel.webview.postMessage({ type: "prefillKey", key: clip });
				}
			} catch {
				/* clipboard unavailable — ignore */
			}
		};
		void tryClipboardPrefill();

		panel.onDidDispose(() => {
			if (qortexKeyModal?.panel === panel) {
				qortexKeyModal = null;
			}
			if (!completed) {
				// The tab was closed without a key: confirm the quit; "stay" reopens.
				void (async () => {
					if (await confirmQuit()) {
						void vscode.commands.executeCommand("workbench.action.quit");
					} else {
						openKeyModal(notice);
					}
				})();
			}
		});
		panel.onDidChangeViewState(() => {
			if (completed) {
				return;
			}
			if (!panel.active) {
				panel.reveal(vscode.ViewColumn.Active);
			} else {
				takeOverWindow();
				void tryClipboardPrefill();
			}
		});
		panel.webview.onDidReceiveMessage(async (msg) => {
			if (msg?.type === "closeModal") {
				if (await confirmQuit()) {
					completed = true; // suppress the dispose handler; we're quitting anyway
					await vscode.commands.executeCommand("workbench.action.quit");
				}
				return;
			}
			if (msg?.type !== "submitKey") {
				return;
			}
			const key = String(msg.key ?? "").trim();
			if (!key) {
				return;
			}
			// Validate/activate the Qortex key against the portal before saving,
			// so a bad key fails HERE with a friendly message. Fail open on
			// network problems — validation is best-effort.
			const result = await validateQortexKey(key);
			if (result.verdict !== "ok") {
				panel.webview.postMessage({
					type: "keyStatus",
					ok: false,
					message: keyErrorMessage(result.verdict),
				});
				return;
			}
			const rememberChoice = msg.remember !== false;
			await saveValidatedKey(key, rememberChoice, result);
			completed = true; // valid key — allow the modal to close normally
			panel.dispose();
			await vscode.commands
				.executeCommand(`${SIDEBAR_VIEW_ID}.focus`)
				.then(undefined, () => {});
			vscode.window.showInformationMessage(
				rememberChoice
					? "FenneQ is ready — your Qortex key is saved on this device."
					: "FenneQ is ready for this session — you'll be asked for your key next time.",
			);
		});
	};

	// Deep-link completion (qortex://…/activate?token=…): validate, save as
	// remembered, close any open key modal, land in FenneQ. Returns success.
	applyQortexActivation = async (token: string) => {
		const result = await validateQortexKey(token);
		if (result.verdict !== "ok") {
			vscode.window.showErrorMessage(keyErrorMessage(result.verdict));
			return false;
		}
		await saveValidatedKey(token, true, result);
		if (qortexKeyModal) {
			qortexKeyModal.complete();
			qortexKeyModal.panel.dispose();
			qortexKeyModal = null;
		}
		await vscode.commands
			.executeCommand(`${SIDEBAR_VIEW_ID}.focus`)
			.then(undefined, () => {});
		vscode.window.showInformationMessage(
			"FenneQ is ready — your Qortex key is saved on this device.",
		);
		return true;
	};

	void (async () => {
		try {
			// A deep link that raced ahead of the gate wins outright.
			if (pendingActivationToken) {
				const token = pendingActivationToken;
				pendingActivationToken = null;
				if (await applyQortexActivation?.(token)) {
					return;
				}
			}

			// Read the saved key straight from the shared secrets file —
			// deciding must not wait for the core bundle to even be parsed.
			const savedKey = readSavedKeyFromDisk();
			const remembered = context.globalState.get<boolean>(REMEMBER_FLAG, true);
			let notice: string | undefined;
			if (savedKey && !remembered) {
				void clearSavedKey();
				notice =
					"Enter your key to start this session — you chose not to stay signed in on this device.";
			} else if (savedKey) {
				const cache = context.globalState.get<{
					hash: string;
					plan?: string;
					endsAt?: string;
					savedAt?: string;
				}>(KEY_CACHE_FLAG);

				// Daily check-in: a saved key is good for 24 hours from the
				// moment the user provided it, then it must be entered again.
				const savedMs = cache?.savedAt ? Date.parse(cache.savedAt) : Number.NaN;
				const checkInDue =
					!Number.isFinite(savedMs) ||
					Date.now() - savedMs > 24 * 60 * 60 * 1000;
				if (checkInDue) {
					void clearSavedKey();
					openKeyModal(
						"Daily check-in: Qortex asks for your key once every 24 hours. Enter it below, or grab it again from the portal.",
					);
					return;
				}

				// Cache fast-path: a subscription known-good for >24h means zero
				// network before the editor — refresh the cache in the background.
				const endsMs = cache?.endsAt ? Date.parse(cache.endsAt) : Number.NaN;
				if (
					cache?.hash === hashKey(savedKey) &&
					Number.isFinite(endsMs) &&
					endsMs - Date.now() > 24 * 60 * 60 * 1000
				) {
					void validateQortexKey(savedKey).then((r) => {
						void context.globalState.update(
							KEY_CACHE_FLAG,
							r.verdict === "ok"
								? {
										hash: hashKey(savedKey),
										plan: r.plan,
										endsAt: r.endsAt,
										savedAt: cache?.savedAt, // refresh ≠ re-entry
									}
								: undefined, // revoked mid-cycle → next launch re-checks
						);
					});
					return;
				}
				const result = await validateQortexKey(savedKey);
				if (result.verdict === "ok") {
					await context.globalState.update(KEY_CACHE_FLAG, {
						hash: hashKey(savedKey),
						plan: result.plan,
						endsAt: result.endsAt,
						savedAt: cache?.savedAt, // refresh ≠ re-entry
					});
					return;
				}
				void clearSavedKey();
				notice =
					result.verdict === "expired"
						? "Your subscription has expired — renew your plan at the Qortex portal, then enter your new key."
						: "Your saved key is no longer valid. Enter a new one.";
			}

			openKeyModal(notice);
		} catch (err) {
			console.error(`[BYOK] launch key modal failed: ${err}`);
		}
	})();
}

/**
 * Deep-link entry (qortex://…/activate?token=…) — called by the core's URI
 * handler; buffers the token if a link somehow fires before the gate is up.
 */
export async function handleQortexActivationToken(
	token: string,
): Promise<void> {
	if (applyQortexActivation) {
		await applyQortexActivation(token);
	} else {
		pendingActivationToken = token;
	}
}
