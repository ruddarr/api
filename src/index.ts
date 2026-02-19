import { withSentry } from './sentry'
import { buildPopularList } from './scheduled'
import type { PopularList } from './types'

export default withSentry({
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url)

		if (url.pathname === '/movies/popular') {
			return handlePopularMovies(env)
		}

		return new Response('Not Found', { status: 404 })
	},

	async scheduled(event, env, ctx): Promise<void> {
		await buildPopularList(env)
	},
})

async function handlePopularMovies(env: Env): Promise<Response> {
	const list = await env.STORE.get<PopularList>('popular:live', 'json')

	if (! list) {
		return new Response('List not built yet', { status: 503 })
	}

	return Response.json(list)
}
