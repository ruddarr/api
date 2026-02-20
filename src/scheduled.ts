import * as Sentry from '@sentry/cloudflare'
import { tmdbHeaders, tmdbUrl } from './tmdb'
import { trendingScore } from './scoring'
import type { DiscoverMovie, DiscoverSeries, TrendingResponse, MovieDetails, SeriesDetails } from './tmdb'
import type { MediaType, MovieInfo, SeriesInfo, PopularItem, PopularList } from './types'

const BATCH_SIZE = 6
const BATCH_COUNT = 4

function currentWindow(): string {
	const now = new Date()
	now.setUTCMinutes(0, 0, 0)
	now.setUTCHours(Math.floor(now.getUTCHours() / 6) * 6)
	return now.toISOString()
}

export async function buildPopularList(env: Env, type: MediaType): Promise<void> {
	const liveKey = `${type}:popular:live`
	const nextKey = `${type}:popular:next`

	const isIncomplete = (item: PopularItem) => type === 'movies'
		? item.movie === null
		: item.series === null

	const live = await env.STORE.get<PopularList>(liveKey, 'json')

	// Ensure live key exists
	if (! live) {
		await startNewBuild(env, type, liveKey)
		return
	}

	// Fill in any missing details
	if (live.items.some(isIncomplete)) {
		await continueBuild(env, type, live, liveKey)
		return
	}

	// Complete — nothing to do if still in the current window
	if (live.timestamp === currentWindow()) {
		return
	}

	// Stale — build the next window
	const next = await env.STORE.get<PopularList>(nextKey, 'json')

	// No in-progress build for the current window
	if (! next || next.timestamp !== currentWindow()) {
		await startNewBuild(env, type, nextKey)
		return
	}

	// Continue fetching details
	await continueBuild(env, type, next, nextKey)

	// All details fetched — promote next to live
	if (next.items.every((m) => !isIncomplete(m))) {
		await env.STORE.put(liveKey, JSON.stringify(next))
	}
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
		title: 'title' in result ? result.title : result.name,
		overview: result.overview,
		release_date: 'release_date' in result ? result.release_date : result.first_air_date,
		popularity: result.popularity,
		vote_average: result.vote_average,
		vote_count: result.vote_count,
		score: trendingScore(result, index, results.length),
		poster_path: `https://image.tmdb.org/t/p/w342/${result.poster_path}`,
		movie: null,
		series: null,
	}))

	items.sort((a, b) => b.score - a.score)

	const list: PopularList = {
		timestamp: currentWindow(),
		items,
	}

	await env.STORE.put(key, JSON.stringify(list))
}

async function continueBuild(env: Env, type: MediaType, list: PopularList, key: string): Promise<void> {
	const headers = tmdbHeaders(env.TMDB_API_KEY)

	const detailsUrl = type === 'movies'
		? tmdbUrl.movieDetails
		: tmdbUrl.seriesDetails

	const isIncomplete = (item: PopularItem) => type === 'movies'
		? item.movie === null
		: item.series === null

	const pending = list.items.filter(isIncomplete)

	if (pending.length === 0) {
		return
	}

	const batch = pending.slice(0, BATCH_SIZE * BATCH_COUNT)

	for (let offset = 0; offset < batch.length; offset += BATCH_SIZE) {
		const chunk = batch.slice(offset, offset + BATCH_SIZE)

		const responses = await Promise.all(
			chunk.map((item) =>
				fetch(detailsUrl(item.id), { headers })
			)
		)

		for (let i = 0; i < chunk.length; i++) {
			try {
				if (! responses[i].ok) {
					Sentry.captureMessage(`TMDB detail request failed: id=${chunk[i].id} status=${responses[i].status}`)

					continue
				}

				const item = list.items.find((m) => m.id === chunk[i].id)

				if (item && type === 'movies') {
					item.movie = await parseMovieDetails(responses[i])
				} else if (item) {
					item.series = await parseSeriesDetails(responses[i])
				}
			} catch (error) {
				Sentry.captureException(error)
			}
		}
	}

	await env.STORE.put(key, JSON.stringify(list))
}

async function parseMovieDetails(response: Response): Promise<MovieInfo> {
	const details = await response.json<MovieDetails>()

	return {
		imdb_id: details.imdb_id,
		runtime: details.runtime,
		status: details.status,
		genres: details.genres.map((g) => g.name),
	}
}

async function parseSeriesDetails(response: Response): Promise<SeriesInfo> {
	const details = await response.json<SeriesDetails>()

	return {
		seasons: details.number_of_seasons,
		episodes: details.number_of_episodes,
		status: details.status,
		genres: details.genres.map((g) => g.name),
	}
}
