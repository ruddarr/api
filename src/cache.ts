const WINDOW_HOURS = 6

export function currentWindow(): string {
	const now = new Date()
	now.setUTCMinutes(0, 0, 0)
	now.setUTCHours(Math.floor(now.getUTCHours() / WINDOW_HOURS) * WINDOW_HOURS)

	return now.toISOString()
}

export function nextWindowAfter(timestamp: string): Date {
	const date = new Date(timestamp)
	date.setUTCHours(date.getUTCHours() + WINDOW_HOURS)

	return date
}
