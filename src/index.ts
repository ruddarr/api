import { withSentry } from './sentry'
import { buildPopularList } from './scheduled'
import type { PopularList } from './types'

export default withSentry({
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url)
		const path = url.pathname.replace(/\/+$/, '')

		if (path === '/popular/movies') {
			return handlePopularMovies(env)
		}

		return Response.json({ error: 'Not Found' }, { status: 404 })
	},

	async scheduled(event, env, ctx): Promise<void> {
		await buildPopularList(env)
	},
})

async function handlePopularMovies(env: Env): Promise<Response> {
	const list = await env.STORE.get<PopularList>('movies:popular:live', 'json')

	if (! list) {
		return Response.json({ error: 'List not built yet' }, { status: 503 })
	}

	return Response.json(list)
}
