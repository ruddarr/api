import type { MovieDetails } from './tmdb'

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
	timestamp: string
	movies: PopularMovie[]
}
