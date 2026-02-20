import type { DiscoverMovie, DiscoverSeries } from './tmdb'

// The rating threshold where a movie is considered "neutral" (score = 0.5).
// Below this: score drops steeply toward 0. Above this: rises toward 1.
// 7.5 is strict — only well-reviewed films get a meaningful boost.
const SIGMOID_CENTER = 7.5

export function trendingScore(item: DiscoverMovie | DiscoverSeries, index: number, total: number): number {
	// TMDB's trending rank as a score: 1st place = 1.0, last place ≈ 0.
	const trendingRank = 1 - index / total

	// Sigmoid curve centered at SIGMOID_CENTER
	const ratingNormalized = 1 / (1 + Math.exp(-1.5 * (item.vote_average - SIGMOID_CENTER)))

	// Linear ramp from 0 to 1 based on vote count, capped at 250.
	const voteConfidence = Math.min(item.vote_count / 250, 1)

	// Rating is only as trustworthy as its vote count
	const weightedRating = ratingNormalized * voteConfidence

	// 20% trending rank, 80% confidence-weighted rating
	return Math.round((trendingRank * 0.2 + weightedRating * 0.8) * 100) / 100
}
