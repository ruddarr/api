import type { DiscoverMovie, DiscoverMovieResponse } from './types'

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url)

		if (url.pathname === '/movies/popular') {
			return handlePopularMovies(env)
		}

		return new Response('Not Found', { status: 404 })
	},
} satisfies ExportedHandler<Env>

async function handlePopularMovies(env: Env): Promise<Response> {
	const headers = {
		Authorization: `Bearer ${env.TMDB_API_KEY}`,
		Accept: 'application/json',
	}

	const [page1, page2] = await Promise.all([
		fetch('https://api.themoviedb.org/3/trending/movie/week?page=1', { headers }),
		fetch('https://api.themoviedb.org/3/trending/movie/week?page=2', { headers }),
	])

	if (! page1.ok) return new Response(page1.body, { status: page1.status })
	if (! page2.ok) return new Response(page2.body, { status: page2.status })

	const [data1, data2] = await Promise.all([
		page1.json<DiscoverMovieResponse>(),
		page2.json<DiscoverMovieResponse>(),
	])

	const results = [...data1.results, ...data2.results]
	const maxPopularity = Math.max(...results.map((m) => m.popularity))

	// Letterboxd-style scoring: heavily favors well-reviewed films.
	// Uses trending as the base pool, then re-ranks to surface
	// the kind of films enthusiast audiences gravitate toward.
	// The rating threshold where a movie is considered "neutral" (score = 0.5).
	// Below this: score drops steeply toward 0. Above this: rises toward 1.
	// 7.0 is strict — only well-reviewed films get a meaningful boost.
	const sigmoidCenter = 7.5

	const score = (movie: DiscoverMovie) => {
		const popularityNormalized = movie.popularity / maxPopularity

		const ratingNormalized = 1 / (1 + Math.exp(-1.5 * (movie.vote_average - sigmoidCenter)))

		// Higher confidence threshold of 250 votes — enthusiast picks tend to have more engaged voters
		const voteConfidence = Math.min(movie.vote_count / 250, 1)

		const weightedRating = ratingNormalized * voteConfidence

		// 20% popularity, 80% confidence-weighted rating
		return popularityNormalized * 0.2 + weightedRating * 0.8
	}

	const scored = results.map((movie) => ({
		...movie,
		score: Math.round(score(movie) * 100) / 100,
	}))

	scored.sort((a, b) => b.score - a.score)

	const movies = scored.map((movie) => ({
		id: movie.id,
		title: movie.title,
		overview: movie.overview,
		release_date: movie.release_date,
		popularity: movie.popularity,
		vote_average: movie.vote_average,
		vote_count: movie.vote_count,
		score: movie.score,
		poster_path: `https://image.tmdb.org/t/p/w342/${movie.poster_path}`,
		source: 'popular',
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
