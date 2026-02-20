import * as Sentry from '@sentry/cloudflare'
import { tmdbHeaders, tmdbUrl } from './tmdb'
import type { DiscoverMovie, DiscoverMovieResponse, MovieDetails } from './tmdb'
import type { MovieInfo, PopularItem, PopularList } from './types'

const BATCH_SIZE = 6
const BATCH_COUNT = 4

function currentWindow(): string {
	const now = new Date()
	now.setUTCMinutes(0, 0, 0)
	now.setUTCHours(Math.floor(now.getUTCHours() / 6) * 6)
	return now.toISOString()
}

export async function buildPopularList(env: Env): Promise<void> {
	const live = await env.STORE.get<PopularList>('movies:popular:live', 'json')

	// Ensure `movies:popular:live` exists
	if (! live) {
		await startNewBuild(env, 'movies:popular:live')
		return
	}

	// Fill in any missing details on `movies:popular:live`
	if (live.items.some((m) => m.movie === null)) {
		await continueBuild(env, live, 'movies:popular:live')
		return
	}

	// `movies:popular:live` is complete — nothing to do if still in the current window
	if (live.timestamp === currentWindow()) {
		return
	}

	// `movies:popular:live` is stale — build the next window
	const next = await env.STORE.get<PopularList>('movies:popular:next', 'json')

	// No in-progress build for the current window — start `movies:popular:next`
	if (! next || next.timestamp !== currentWindow()) {
		await startNewBuild(env, 'movies:popular:next')
		return
	}

	// Continue fetching details for `movies:popular:next`
	await continueBuild(env, next, 'movies:popular:next')

	// All details fetched — promote `movies:popular:next` to `movies:popular:live`
	if (next.items.every((m) => m.movie !== null)) {
		await env.STORE.put('movies:popular:live', JSON.stringify(next))
	}
}

async function startNewBuild(env: Env, key: string): Promise<void> {
	const headers = tmdbHeaders(env.TMDB_API_KEY)

	const [page1, page2] = await Promise.all([
		fetch(tmdbUrl.trendingMovies(1), { headers }),
		fetch(tmdbUrl.trendingMovies(2), { headers }),
	])

	if (! page1.ok || ! page2.ok) {
		Sentry.captureMessage(`TMDB trending request failed: page1=${page1.status} page2=${page2.status}`)

		return
	}

	const [data1, data2] = await Promise.all([
		page1.json<DiscoverMovieResponse>(),
		page2.json<DiscoverMovieResponse>(),
	])

	const results = [...data1.results, ...data2.results]
		.filter((movie, index, arr) => arr.findIndex((m) => m.id === movie.id) === index)

	// The rating threshold where a movie is considered "neutral" (score = 0.5).
	// Below this: score drops steeply toward 0. Above this: rises toward 1.
	// 7.5 is strict — only well-reviewed films get a meaningful boost.
	const sigmoidCenter = 7.5

	const score = (movie: DiscoverMovie, index: number) => {
		// TMDB's trending rank as a score: 1st place = 1.0, last place ≈ 0.
		const trendingRank = 1 - index / results.length

		// Sigmoid curve centered at sigmoidCenter
		const ratingNormalized = 1 / (1 + Math.exp(-1.5 * (movie.vote_average - sigmoidCenter)))

		// Linear ramp from 0 to 1 based on vote count, capped at 250.
		const voteConfidence = Math.min(movie.vote_count / 250, 1)

		// Rating is only as trustworthy as its vote count
		const weightedRating = ratingNormalized * voteConfidence

		// 20% trending rank, 80% confidence-weighted rating
		return trendingRank * 0.2 + weightedRating * 0.8
	}

	const movies: PopularItem[] = results.map((movie, index) => ({
		id: movie.id,
		title: movie.title,
		overview: movie.overview,
		release_date: movie.release_date,
		popularity: movie.popularity,
		vote_average: movie.vote_average,
		vote_count: movie.vote_count,
		score: Math.round(score(movie, index) * 100) / 100,
		poster_path: `https://image.tmdb.org/t/p/w342/${movie.poster_path}`,
		movie: null,
		series: null,
	}))

	movies.sort((a, b) => b.score - a.score)

	const list: PopularList = {
		timestamp: currentWindow(),
		items: movies,
	}

	await env.STORE.put(key, JSON.stringify(list))
}

async function continueBuild(env: Env, list: PopularList, key: string): Promise<void> {
	const headers = tmdbHeaders(env.TMDB_API_KEY)

	const pending = list.items.filter((m) => m.movie === null)

	if (pending.length === 0) {
		return
	}

	const batch = pending.slice(0, BATCH_SIZE * BATCH_COUNT)

	for (let offset = 0; offset < batch.length; offset += BATCH_SIZE) {
		const chunk = batch.slice(offset, offset + BATCH_SIZE)

		const responses = await Promise.all(
			chunk.map((movie) =>
				fetch(tmdbUrl.movieDetails(movie.id), { headers })
			)
		)

		for (let i = 0; i < chunk.length; i++) {
			try {
				if (! responses[i].ok) {
					Sentry.captureMessage(
						`TMDB movie detail request failed: movie=${chunk[i].id} status=${responses[i].status}`
					)

					continue
				}

				const details = await responses[i].json<MovieDetails>()

				const movie = list.items.find((m) => m.id === chunk[i].id)

				if (movie) {
					movie.movie = {
						imdb_id: details.imdb_id,
						runtime: details.runtime,
						status: details.status,
						genres: details.genres.map((g) => g.name),
					} satisfies MovieInfo
				}
			} catch (error) {
				Sentry.captureException(error)
			}
		}
	}

	await env.STORE.put(key, JSON.stringify(list))
}
