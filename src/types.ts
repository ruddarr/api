export interface MovieInfo {
	imdb_id: string | null
	runtime: number | null
	status: string
	genres: string[]
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
	details: MovieInfo | null
}

export interface PopularList {
	timestamp: string
	movies: PopularMovie[]
}
