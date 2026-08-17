/**
 * Script to install dependencies for running E2E tests in GitHub Actions.
 */
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { downloadAndUnzipVSCode, SilentReporter } from "@vscode/test-electron"
import { execa } from "execa"

const TIMEOUT_MINUTE = 5
const INSTALL_TIMEOUT_MS = TIMEOUT_MINUTE * 60 * 1000
const MAX_VSCODE_ATTEMPTS = 3
// downloadAndUnzipVSCode's default cache; matches the actions/cache path
const VSCODE_CACHE_DIR = path.resolve(process.cwd(), ".vscode-test")

async function installVSCode() {
	const VSCODE_APP_TYPE = "stable"
	console.log("Downloading VS Code...")
	// downloadAndUnzipVSCode with a SilentReporter resolves even when the
	// download or unzip failed, returning a path that doesn't exist on disk.
	// Without this guard every test later dies with `spawn ... ENOENT`
	// (persistent on the macOS runners). Verify the executable is really
	// there and retry from a clean cache if not.
	for (let attempt = 1; attempt <= MAX_VSCODE_ATTEMPTS; attempt++) {
		const executablePath = await downloadAndUnzipVSCode(VSCODE_APP_TYPE, undefined, new SilentReporter())
		if (existsSync(executablePath)) {
			console.log(`VS Code ready at ${executablePath}`)
			return executablePath
		}
		console.warn(
			`VS Code download resolved but ${executablePath} is missing (attempt ${attempt}/${MAX_VSCODE_ATTEMPTS}); clearing ${VSCODE_CACHE_DIR} and retrying...`,
		)
		rmSync(VSCODE_CACHE_DIR, { recursive: true, force: true })
	}
	throw new Error(`VS Code executable still missing after ${MAX_VSCODE_ATTEMPTS} download attempts`)
}

async function installChromium() {
	console.log("Installing Playwright Chromium...")
	try {
		await execa("npm", ["exec", "playwright", "install", "chromium"], {
			stdio: "inherit",
		})
		console.log("Playwright Chromium installation completed successfully")
	} catch (error) {
		throw new Error(`Failed to install Playwright Chromium: ${error}`)
	}
}

async function installDependencies() {
	return Promise.all([installVSCode(), installChromium()])
}

async function main() {
	const timeoutPromise = new Promise((_, reject) =>
		setTimeout(() => reject(new Error("Installation timed out.")), INSTALL_TIMEOUT_MS),
	)
	await Promise.race([installDependencies(), timeoutPromise])
	console.log("Installation complete.")
	process.exit(0)
}

main().catch((error) => {
	console.error("Failed to install dependencies for E2E test", error)
	process.exit(1)
})
