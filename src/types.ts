export type MediaType = 'movies' | 'series'

export interface PopularItem {
	id: number
	type: 'movie' | 'series'
	title: string
	overview: string
	release_date: string
	popularity: number
	vote_average: number
	vote_count: number
	score: number
	poster_path: string
}

export interface PopularList {
	timestamp: string
	items: PopularItem[]
}
