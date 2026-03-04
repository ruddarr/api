export type MediaType = 'movies' | 'series'

export interface DiscoveryItem {
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

export interface DiscoveryList {
	timestamp: string
	popular: DiscoveryItem[]
}

export interface UpcomingList {
	timestamp: string
	upcoming: DiscoveryItem[]
}
