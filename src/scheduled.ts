import { tmdbHeaders, tmdbUrl } from './tmdb'
import type { DiscoverMovie, DiscoverMovieResponse, MovieDetails } from './tmdb'
import type { MovieInfo, PopularList, PopularMovie } from './types'

const BATCH_SIZE = 20

function currentWindow(): string {
	const now = new Date()
	now.setUTCMinutes(0, 0, 0)
	now.setUTCHours(Math.floor(now.getUTCHours() / 6) * 6)
	return now.toISOString()
}

export async function buildPopularList(env: Env): Promise<void> {
	const live = await env.STORE.get<PopularList>('popular:live', 'json')

	// Ensure `popular:live` exists
	if (! live) {
		await startNewBuild(env, 'popular:live')
		return
	}

	// Fill in any missing details on `popular:live`
	if (live.movies.some((m) => m.details === null)) {
		await continueBuild(env, live, 'popular:live')
		return
	}

	// `popular:live` is complete — nothing to do if still in the current window
	if (live.timestamp === currentWindow()) {
		return
	}

	// `popular:live` is stale — build the next window
	const next = await env.STORE.get<PopularList>('popular:next', 'json')

	// No in-progress build for the current window — start `popular:next`
	if (! next || next.timestamp !== currentWindow()) {
		await startNewBuild(env, 'popular:next')
		return
	}

	// Continue fetching details for `popular:next`
	await continueBuild(env, next, 'popular:next')

	// All details fetched — promote `popular:next` to `popular:live`
	if (next.movies.every((m) => m.details !== null)) {
		await env.STORE.put('popular:live', JSON.stringify(next))
	}
}

async function startNewBuild(env: Env, key: string): Promise<void> {
	const headers = tmdbHeaders(env.TMDB_API_KEY)

	const [page1, page2] = await Promise.all([
		fetch(tmdbUrl.trendingMovies(1), { headers }),
		fetch(tmdbUrl.trendingMovies(2), { headers }),
	])

	if (! page1.ok || ! page2.ok) {
		return
	}

	const [data1, data2] = await Promise.all([
		page1.json<DiscoverMovieResponse>(),
		page2.json<DiscoverMovieResponse>(),
	])

	const results = [...data1.results, ...data2.results]

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

	const movies: PopularMovie[] = results.map((movie, index) => ({
		id: movie.id,
		title: movie.title,
		overview: movie.overview,
		release_date: movie.release_date,
		popularity: movie.popularity,
		vote_average: movie.vote_average,
		vote_count: movie.vote_count,
		score: Math.round(score(movie, index) * 100) / 100,
		poster_path: `https://image.tmdb.org/t/p/w342/${movie.poster_path}`,
		details: null,
	}))

	movies.sort((a, b) => b.score - a.score)

	const list: PopularList = {
		timestamp: currentWindow(),
		movies,
	}

	await env.STORE.put(key, JSON.stringify(list))
}

async function continueBuild(env: Env, list: PopularList, key: string): Promise<void> {
	const headers = tmdbHeaders(env.TMDB_API_KEY)

	const pending = list.movies.filter((m) => m.details === null)

	if (pending.length === 0) {
		return
	}

	const batch = pending.slice(0, BATCH_SIZE)

	const responses = await Promise.all(
		batch.map((movie) =>
			fetch(tmdbUrl.movieDetails(movie.id), { headers })
		)
	)

	for (let i = 0; i < batch.length; i++) {
		if (! responses[i].ok) {
			continue
		}

		const details = await responses[i].json<MovieDetails>()

		const movie = list.movies.find((m) => m.id === batch[i].id)
		if (movie) {
			movie.details = {
				imdb_id: details.imdb_id,
				runtime: details.runtime,
				status: details.status,
				genres: details.genres.map((g) => g.name),
			} satisfies MovieInfo
		}
	}

	await env.STORE.put(key, JSON.stringify(list))
}
