export interface DiscoverMovieResponse {
	page: number
	results: DiscoverMovie[]
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

export interface MovieDetails {
	adult: boolean
	backdrop_path: string | null
	belongs_to_collection: {
		id: number
		name: string
		poster_path: string | null
		backdrop_path: string | null
	} | null
	budget: number
	genres: { id: number; name: string }[]
	homepage: string | null
	id: number
	imdb_id: string | null
	origin_country: string[]
	original_language: string
	original_title: string
	overview: string
	popularity: number
	poster_path: string | null
	release_date: string
	revenue: number
	runtime: number | null
	status: string
	tagline: string | null
	title: string
	video: boolean
	vote_average: number
	vote_count: number
}

export interface PopularMovie {
	id: number
	title: string
	overview: string
	release_date: string
	popularity: number
	vote_average: number
	vote_count: number
	score: number
	poster_path: string
	source: string
	details: MovieDetails | null
}

export interface PopularList {
	fetched_at: string
	movies: PopularMovie[]
}
