import { withSentry } from './sentry'
import { buildPopularList } from './scheduled'
import { nextWindowAfter } from './cache'

import type { MediaType, PopularList } from './types'

export default withSentry({
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url)
		const path = url.pathname.replace(/\/+$/, '')

		if (path === '/popular/movies') {
			return handlePopularList(env, 'movies')
		}

		if (path === '/popular/series') {
			return handlePopularList(env, 'series')
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

async function handlePopularList(env: Env, type: MediaType): Promise<Response> {
	const list = await env.STORE.get<PopularList>(`${type}:popular:live`, 'json')

	if (! list) {
		return Response.json({ message: 'List not built yet' }, { status: 425 })
	}

	const expires = nextWindowAfter(list.timestamp)
	const maxAge = Math.floor((expires.getTime() - Date.now()) / 1000)

	return Response.json(list, {
		headers: {
			'Cache-Control': `public, s-maxage=${maxAge}`,
		},
	})
}
