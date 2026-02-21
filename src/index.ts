import { withSentry } from './sentry'
import { buildPopularList } from './scheduled'
import { nextWindowAfter } from './cache'

import type { MediaType, PopularList } from './types'

export default withSentry({
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url)
		const path = url.pathname.replace(/\/+$/, '')

		if (path === '/popular/movies') {
			return handlePopularList(request, env, ctx, 'movies')
		}

		if (path === '/popular/series') {
			return handlePopularList(request, env, ctx, 'series')
		}

		return Response.json({ message: 'Not Found' }, { status: 404 })
	},

	async scheduled(event, env, ctx): Promise<void> {
		await Promise.all([
			buildPopularList(env, 'movies'),
			buildPopularList(env, 'series'),
		])
	},
})

async function handlePopularList(request: Request, env: Env, ctx: ExecutionContext, type: MediaType): Promise<Response> {
	const cache = caches.default
	const cached = await cache.match(request)

	if (cached) {
		return cached
	}

	const list = await env.STORE.get<PopularList>(`${type}:popular:live`, 'json')

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
