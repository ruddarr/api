import type { DiscoverMovie, DiscoverMovieResponse, MovieDetails, PopularList, PopularMovie } from './types'

const BATCH_SIZE = 20
const BUILD_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

export default {
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
} satisfies ExportedHandler<Env>

// --- Fetch handler ---

async function handlePopularMovies(env: Env): Promise<Response> {
	const list = await env.MOVIES_KV.get<PopularList>('popular:live', 'json')

	if (! list) {
		return new Response('List not built yet', { status: 503 })
	}

	return Response.json(list)
}

// --- Scheduled handler ---

async function buildPopularList(env: Env): Promise<void> {
	const next = await env.MOVIES_KV.get<PopularList>('popular:next', 'json')

	if (! next) {
		// Check if the current live list is still fresh
		const live = await env.MOVIES_KV.get<PopularList>('popular:live', 'json')

		if (live) {
			const age = Date.now() - new Date(live.fetched_at).getTime()
			if (age < BUILD_INTERVAL_MS) return
		}

		// Start a new build: fetch trending, score, store skeleton
		await startNewBuild(env)
		return
	}

	// Continue building: fetch details for the next batch
	await continueBuild(env, next)
}

async function startNewBuild(env: Env): Promise<void> {
	const headers = {
		Authorization: `Bearer ${env.TMDB_API_KEY}`,
		Accept: 'application/json',
	}

	const [page1, page2] = await Promise.all([
		fetch('https://api.themoviedb.org/3/trending/movie/week?page=1', { headers }),
		fetch('https://api.themoviedb.org/3/trending/movie/week?page=2', { headers }),
	])

	if (! page1.ok || ! page2.ok) return

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
		source: 'popular',
		details: null,
	}))

	movies.sort((a, b) => b.score - a.score)

	const list: PopularList = {
		fetched_at: new Date().toISOString(),
		movies,
	}

	await env.MOVIES_KV.put('popular:next', JSON.stringify(list))
}

async function continueBuild(env: Env, list: PopularList): Promise<void> {
	const headers = {
		Authorization: `Bearer ${env.TMDB_API_KEY}`,
		Accept: 'application/json',
	}

	const pending = list.movies.filter((m) => m.details === null)

	if (pending.length === 0) {
		// All details fetched — promote to live
		await env.MOVIES_KV.put('popular:live', JSON.stringify(list))
		await env.MOVIES_KV.delete('popular:next')
		return
	}

	const batch = pending.slice(0, BATCH_SIZE)

	const responses = await Promise.all(
		batch.map((movie) =>
			fetch(`https://api.themoviedb.org/3/movie/${movie.id}`, { headers })
		)
	)

	for (let i = 0; i < batch.length; i++) {
		if (! responses[i].ok) continue

		const details = await responses[i].json<MovieDetails>()

		// Remove excluded fields
		const { production_companies, production_countries, spoken_languages, ...filtered } =
			details as MovieDetails & {
				production_companies?: unknown
				production_countries?: unknown
				spoken_languages?: unknown
			}

		const movie = list.movies.find((m) => m.id === batch[i].id)
		if (movie) {
			movie.details = filtered as MovieDetails
		}
	}

	// Check if all done after this batch
	const remaining = list.movies.filter((m) => m.details === null)

	if (remaining.length === 0) {
		await env.MOVIES_KV.put('popular:live', JSON.stringify(list))
		await env.MOVIES_KV.delete('popular:next')
	} else {
		await env.MOVIES_KV.put('popular:next', JSON.stringify(list))
	}
}

async function fetchDiscoverPages(params: URLSearchParams, headers: Record<string, string>): Promise<DiscoverMovie[] | Response> {
	const [page1, page2] = await Promise.all([
		fetch(`https://api.themoviedb.org/3/discover/movie?${params}&page=1`, { headers }),
		fetch(`https://api.themoviedb.org/3/discover/movie?${params}&page=2`, { headers }),
	])

	if (! page1.ok) return new Response(page1.body, { status: page1.status })
	if (! page2.ok) return new Response(page2.body, { status: page2.status })

	const [data1, data2] = await Promise.all([
		page1.json<DiscoverMovieResponse>(),
		page2.json<DiscoverMovieResponse>(),
	])

	return [...data1.results, ...data2.results]
}
