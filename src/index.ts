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

	const shared = {
		include_adult: 'false',
		sort_by: 'vote_average.desc',
		'release_date.gte': past,
		'release_date.lte': future,
	}

	const mediaParams = new URLSearchParams({ ...shared, include_video: 'true', with_release_type: '4|5|6' })
	const theatricalParams = new URLSearchParams({ ...shared, include_video: 'false', with_release_type: '1|2|3' })

	const headers = {
		Authorization: `Bearer ${env.TMDB_API_KEY}`,
		Accept: 'application/json',
	}

	const responses = await Promise.all([
		fetch(`https://api.themoviedb.org/3/discover/movie?${mediaParams}&page=1`, { headers }),
		fetch(`https://api.themoviedb.org/3/discover/movie?${mediaParams}&page=2`, { headers }),
		fetch(`https://api.themoviedb.org/3/discover/movie?${theatricalParams}&page=1`, { headers }),
		fetch(`https://api.themoviedb.org/3/discover/movie?${theatricalParams}&page=2`, { headers }),
	])

	for (const response of responses) {
		if (! response.ok) {
			return new Response(response.body, { status: response.status })
		}
	}

	const pages = await Promise.all(
		responses.map((r) => r.json<DiscoverMovieResponse>())
	)

	const seen = new Set<number>()
	const results: DiscoverMovie[] = []

	for (const page of pages) {
		for (const movie of page.results) {
			if (! seen.has(movie.id)) {
				seen.add(movie.id)
				results.push(movie)
			}
		}
	}

	results.sort((a, b) => b.popularity - a.popularity)

	const movies = results.map((movie) => ({
		id: movie.id,
		title: movie.title,
		overview: movie.overview,
		release_date: movie.release_date,
		popularity: movie.popularity,
		vote_average: movie.vote_average,
		poster_path: `https://image.tmdb.org/t/p/w342/${movie.poster_path}`,
	}))

	return Response.json(movies)
}
