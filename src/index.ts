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
	const cutoff = `${today.getFullYear() - 3}-01-01`

	const shared = {
		include_adult: 'false',
		sort_by: 'popularity.desc',
		'release_date.gte': past,
		'release_date.lte': future,
	}

	const mediaParams = new URLSearchParams({ ...shared, include_video: 'true', with_release_type: '4|5|6', 'primary_release_date.gte': cutoff })
	const theatricalParams = new URLSearchParams({ ...shared, include_video: 'false', with_release_type: '1|2|3' })

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

	const score = (movie: DiscoverMovie) => {
		const popularityNormalized = movie.popularity / maxPopularity
		return popularityNormalized * 0.3 + (movie.vote_average / 10) * 0.7
	}

	results.sort((a, b) => score(b) - score(a))

	const movies = results.map((movie) => ({
		id: movie.id,
		title: movie.title,
		overview: movie.overview,
		release_date: movie.release_date,
		popularity: movie.popularity,
		vote_average: movie.vote_average,
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
