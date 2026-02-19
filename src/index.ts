import type { DiscoverMovie, DiscoverMovieResponse } from './types'

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url)

		if (url.pathname === '/movies/trending') {
			return handleTrendingMovies(env)
		}

		return new Response('Not Found', { status: 404 })
	},
} satisfies ExportedHandler<Env>

async function handleTrendingMovies(env: Env): Promise<Response> {
	const today = new Date()
	const past = new Date(today.getTime() - 7 * 86400000).toISOString().split('T')[0]
	const future = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0]
	const cutoff = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()).toISOString().split('T')[0]

	const shared = {
		include_adult: 'false',
		sort_by: 'popularity.desc',
		'release_date.gte': past,
		'release_date.lte': future,
	}

	const mediaParams = new URLSearchParams({
		...shared,
		include_video: 'true',
		with_release_type: '4|5',
		'primary_release_date.gte': cutoff,
	})

	const theatricalParams = new URLSearchParams({
		...shared,
		include_video: 'false',
		with_release_type: '1|2|3',
	})

	const headers = {
		Authorization: `Bearer ${env.TMDB_API_KEY}`,
		Accept: 'application/json',
	}

	const mediaMovies = await fetchDiscoverPages(mediaParams, headers)
	const theatricalMovies = await fetchDiscoverPages(theatricalParams, headers)

	if (mediaMovies instanceof Response) return mediaMovies
	if (theatricalMovies instanceof Response) return theatricalMovies

	const seen = new Set<number>()
	const results: (DiscoverMovie & { source: string })[] = []

	for (const movie of mediaMovies) {
		if (! seen.has(movie.id)) {
			seen.add(movie.id)
			results.push({ ...movie, source: 'media' })
		}
	}

	for (const movie of theatricalMovies) {
		if (! seen.has(movie.id)) {
			seen.add(movie.id)
			results.push({ ...movie, source: 'theatrical' })
		}
	}

	const maxPopularity = Math.max(...results.map((m) => m.popularity))

	// Blended ranking score combining popularity (30%) and rating (70%).
	// Rating uses a sigmoid curve so poorly rated movies are penalized
	// exponentially, and a vote count confidence factor so movies with
	// few votes don't get undeserved boosts.
	const score = (movie: DiscoverMovie) => {
		// Scale popularity to 0–1 relative to the most popular movie in the set
		const popularityNormalized = movie.popularity / maxPopularity

		// Sigmoid curve centered at 6.5: crushes ratings below 5 toward ~0,
		// treats 8+ as ~1, with a smooth transition in between
		const ratingNormalized = 1 / (1 + Math.exp(-1.5 * (movie.vote_average - 6.5)))

		// Linear ramp from 0 to 1 based on vote count, capped at 250 votes.
		// Movies with <25 votes have very little rating influence,
		// movies with 250+ votes get full rating weight.
		const voteConfidence = Math.min(movie.vote_count / 250, 1)

		// Rating is only as trustworthy as its vote count
		const weightedRating = ratingNormalized * voteConfidence

		// Final score: 30% popularity, 70% confidence-weighted rating
		return popularityNormalized * 0.3 + weightedRating * 0.7
	}

	results.sort((a, b) => score(b) - score(a))

	const movies = results.map((movie) => ({
		id: movie.id,
		title: movie.title,
		overview: movie.overview,
		release_date: movie.release_date,
		popularity: movie.popularity,
		vote_average: movie.vote_average,
		vote_count: movie.vote_count,
		score: Math.round(score(movie) * 100) / 100,
		poster_path: `https://image.tmdb.org/t/p/w342/${movie.poster_path}`,
		source: movie.source,
	}))

	return Response.json(movies)
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
