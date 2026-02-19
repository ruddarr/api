import { withSentry as sentryWrapper } from '@sentry/cloudflare'

export function withSentry(handler: ExportedHandler<Env>) {
	return sentryWrapper<Env>(
		(env) => ({
			dsn: env.SENTRY_DSN,
			sendDefaultPii: true,
		}),
		handler,
	)
}
