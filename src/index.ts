import { withSentry } from './sentry'
import { buildDiscoveryLists } from './scheduled'
import { nextWindowAfter } from './cache'

import type { MediaType, DiscoveryList } from './types'

export default withSentry({
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url)
		const path = url.pathname.replace(/\/+$/, '')

		if (path === '/discover/movies') {
			return handleDiscoveryRequest(request, env, ctx, 'movies')
		}

		if (path === '/discover/series') {
			return handleDiscoveryRequest(request, env, ctx, 'series')
		}

		return Response.json({ message: 'Not Found' }, { status: 404 })
	},

	async scheduled(event, env, ctx): Promise<void> {
		await Promise.all([
			buildDiscoveryLists(env, 'movies'),
			buildDiscoveryLists(env, 'series'),
		])
	},
})

async function handleDiscoveryRequest(request: Request, env: Env, ctx: ExecutionContext, type: MediaType): Promise<Response> {
	const cache = caches.default
	const cached = await cache.match(request)

	if (cached) {
		return cached
	}

	const list = await env.STORE.get<DiscoveryList>(`discover:${type}:live`, 'json')

	if (! list) {
		return Response.json({ message: 'List not built yet' }, { status: 425 })
	}

	const expires = nextWindowAfter(list.timestamp)

	const response = Response.json(list, {
		headers: {
			'Expires': expires.toUTCString(),
		},
	})

	ctx.waitUntil(cache.put(request, response.clone()))

	return response
}
