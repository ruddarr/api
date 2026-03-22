const BASE = 'https://api.themoviedb.org/3'

export function tmdbHeaders(apiKey: string): Record<string, string> {
	return {
		Authorization: `Bearer ${apiKey}`,
		Accept: 'application/json',
	}
}

export const tmdbUrl = {
	trendingMovies: (page: number, language: string) => `${BASE}/trending/movie/week?page=${page}&language=${language}`,
	trendingSeries: (page: number, language: string) => `${BASE}/trending/tv/week?page=${page}&language=${language}`,
	upcomingMovies: (page: number, language: string, region: string, today: string, ninetyDaysFromNowISO: string) => `${BASE}/discover/movie?page=${page}&language=${language}&primary_release_date.gte=${today}&primary_release_date.lte=${ninetyDaysFromNowISO}&sort_by=popularity.desc`,
	upcomingSeries: (page: number, language: string, region: string, today: string, ninetyDaysFromNowISO: string) => `${BASE}/discover/tv?page=${page}&language=${language}&first_air_date.gte=${today}&first_air_date.lte=${ninetyDaysFromNowISO}&sort_by=popularity.desc`,
}

export interface TrendingResponse<T> {
	page: number
	results: T[]
	total_pages: number
	total_results: number
}

export interface DiscoverMovie {
	adult: boolean
	backdrop_path: string | null
	genre_ids: number[]
	id: number
	original_language: string
	original_title: string
	overview: string
	popularity: number
	poster_path: string | null
	release_date: string
	title: string
	video: boolean
	vote_average: number
	vote_count: number
}

export interface DiscoverSeries {
	adult: boolean
	backdrop_path: string | null
	genre_ids: number[]
	id: number
	origin_country: string[]
	original_language: string
	original_name: string
	overview: string
	popularity: number
	poster_path: string | null
	first_air_date: string
	name: string
	vote_average: number
	vote_count: number
}
