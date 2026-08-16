import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"

/**
 * FenneQ runs in one of two modes. Both keep the full Cline feature set —
 * switching only changes which backend answers the task.
 *
 * - "assistant": the FenneQ MCP server responds as a normal Claude-style
 *   assistant. This is the default and matches stock Cline behaviour.
 * - "harness": the FenneQ agentic platform drives the task instead, with
 *   Cline acting as the shell around it.
 */
export type FenneqMode = "assistant" | "harness"

export const FENNEQ_MODES: readonly FenneqMode[] = ["assistant", "harness"] as const

const STORAGE_KEY = "fenneq.mode"
const DEFAULT_MODE: FenneqMode = "assistant"

const isFenneqMode = (value: unknown): value is FenneqMode => FENNEQ_MODES.includes(value as FenneqMode)

const readStoredMode = (): FenneqMode => {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		return isFenneqMode(stored) ? stored : DEFAULT_MODE
	} catch {
		// localStorage is unavailable in some webview hosts; fall back to the default.
		return DEFAULT_MODE
	}
}

interface FenneqModeContextType {
	mode: FenneqMode
	setMode: (mode: FenneqMode) => void
	showFenneq: boolean
	openFenneq: () => void
	hideFenneq: () => void
}

const FenneqModeContext = createContext<FenneqModeContextType | undefined>(undefined)

export const FenneqModeProvider = ({ children }: { children: ReactNode }) => {
	const [mode, setModeState] = useState<FenneqMode>(readStoredMode)
	const [showFenneq, setShowFenneq] = useState(false)

	const setMode = useCallback((next: FenneqMode) => {
		setModeState(next)
		try {
			localStorage.setItem(STORAGE_KEY, next)
		} catch {
			// Persistence is best-effort — the mode still applies for this session.
		}
	}, [])

	// Expose the mode on the document root so plain CSS (and any view that isn't
	// wrapped in a React tree) can key off it without threading props around.
	useEffect(() => {
		document.documentElement.dataset.fenneqMode = mode
	}, [mode])

	const openFenneq = useCallback(() => setShowFenneq(true), [])
	const hideFenneq = useCallback(() => setShowFenneq(false), [])

	const value = useMemo(
		() => ({ mode, setMode, showFenneq, openFenneq, hideFenneq }),
		[mode, setMode, showFenneq, openFenneq, hideFenneq],
	)

	return <FenneqModeContext.Provider value={value}>{children}</FenneqModeContext.Provider>
}

export const useFenneqMode = () => {
	const context = useContext(FenneqModeContext)
	if (context === undefined) {
		throw new Error("useFenneqMode must be used within a FenneqModeProvider")
	}
	return context
}
