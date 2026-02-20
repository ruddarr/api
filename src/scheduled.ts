import * as Sentry from '@sentry/cloudflare'
import { tmdbHeaders, tmdbUrl } from './tmdb'
import { trendingScore } from './scoring'
import type { DiscoverMovie, DiscoverSeries, TrendingResponse } from './tmdb'
import type { MediaType, PopularItem, PopularList } from './types'

function currentWindow(): string {
	const now = new Date()
	now.setUTCMinutes(0, 0, 0)
	now.setUTCHours(Math.floor(now.getUTCHours() / 6) * 6)

	return now.toISOString()
}

export async function buildPopularList(env: Env, type: MediaType): Promise<void> {
	const liveKey = `${type}:popular:live`
	const live = await env.STORE.get<PopularList>(liveKey, 'json')

	if (live && live.timestamp === currentWindow()) {
		return
	}

	await startNewBuild(env, type, liveKey)
}

async function startNewBuild(env: Env, type: MediaType, key: string): Promise<void> {
	const headers = tmdbHeaders(env.TMDB_API_KEY)

	const trendingUrl = type === 'movies'
		? tmdbUrl.trendingMovies
		: tmdbUrl.trendingSeries

	const [page1, page2] = await Promise.all([
		fetch(trendingUrl(1), { headers }),
		fetch(trendingUrl(2), { headers }),
	])

	if (! page1.ok || ! page2.ok) {
		Sentry.captureMessage(`TMDB trending request failed: page1=${page1.status} page2=${page2.status}`)

		return
	}

	const [data1, data2] = await Promise.all([
		page1.json<TrendingResponse<DiscoverMovie | DiscoverSeries>>(),
		page2.json<TrendingResponse<DiscoverMovie | DiscoverSeries>>(),
	])

	const results = [...data1.results, ...data2.results]
		.filter((item, index, arr) => arr.findIndex((m) => m.id === item.id) === index)

	const items: PopularItem[] = results.map((result, index) => ({
		id: result.id,
		type: type === 'movies' ? 'movie' : 'series',
		title: 'title' in result ? result.title : result.name,
		overview: result.overview,
		release_date: 'release_date' in result
			? result.release_date
			: result.first_air_date,
		popularity: result.popularity,
		vote_average: result.vote_average,
		vote_count: result.vote_count,
		score: trendingScore(result, index, results.length),
		poster_path: `https://image.tmdb.org/t/p/w342/${result.poster_path}`,
	}))

	items.sort((a, b) => b.score - a.score)

	const list: PopularList = {
		timestamp: currentWindow(),
		items,
	}

	await env.STORE.put(key, JSON.stringify(list))
}
