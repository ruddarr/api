import { withSentry } from './sentry'
import { buildPopularList } from './scheduled'
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
		const type: MediaType = event.cron === '5/10 * * * *'
			? 'series'
			: 'movies'

		await buildPopularList(env, type)
	},
})

async function handlePopularList(env: Env, type: MediaType): Promise<Response> {
	const list = await env.STORE.get<PopularList>(`${type}:popular:live`, 'json')

	if (! list) {
		return Response.json({ message: 'List not built yet' }, { status: 503 })
	}

	return Response.json(list)
}
