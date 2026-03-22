import { withSentry } from './sentry'
import { buildDiscoveryList, buildUpcomingList } from './build'
import { nextWindowAfter } from './cache'

import type { MediaType } from './types'

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

		if (path === '/upcoming/movies') {
			return handleUpcomingRequest(request, env, ctx, 'movies')
		}

		if (path === '/upcoming/series') {
			return handleUpcomingRequest(request, env, ctx, 'series')
		}

		return Response.json({ message: 'Not Found' }, { status: 404 })
	},
})

async function handleUpcomingRequest(request: Request, env: Env, ctx: ExecutionContext, type: MediaType): Promise<Response> {
	const url = new URL(request.url)
	const rawLanguage = url.searchParams.get('language') ?? 'en-US'
	const language = /^[a-z]{2,3}(-[a-zA-Z\d]{2,8})*$/.test(rawLanguage) ? rawLanguage : 'en-US'
	const rawRegion = url.searchParams.get('region') ?? 'US'
	const region = /^[A-Z]{2}$/.test(rawRegion.toUpperCase()) ? rawRegion.toUpperCase() : 'US'

	const cache = caches.default
	const cached = await cache.match(request)

	if (cached) {
		return cached
	}

	const list = await buildUpcomingList(env, type, language, region)

	if (! list) {
		return Response.json({ message: 'Failed to build list' }, { status: 503 })
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

async function handleDiscoveryRequest(request: Request, env: Env, ctx: ExecutionContext, type: MediaType): Promise<Response> {
	const url = new URL(request.url)
	const rawLanguage = url.searchParams.get('language') ?? 'en-US'
	const language = /^[a-z]{2,3}(-[a-zA-Z\d]{2,8})*$/.test(rawLanguage) ? rawLanguage : 'en-US'

	const cache = caches.default
	const cached = await cache.match(request)

	if (cached) {
		return cached
	}

	const list = await buildDiscoveryList(env, type, language)

	if (! list) {
		return Response.json({ message: 'Failed to build list' }, { status: 503 })
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
