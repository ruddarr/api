export interface PopularItem {
	id: number
	title: string
	overview: string
	release_date: string
	popularity: number
	vote_average: number
	vote_count: number
	score: number
	poster_path: string
	movie: MovieInfo | null
	series: SeriesInfo | null
}

export interface PopularList {
	timestamp: string
	items: PopularItem[]
}

export interface MovieInfo {
	imdb_id: string | null
	runtime: number | null
	status: string
	genres: string[]
}

export interface SeriesInfo {
	number_of_seasons: number
	number_of_episodes: number
	status: string
	genres: string[]
}
