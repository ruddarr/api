import * as Sentry from '@sentry/cloudflare'

import { tmdbHeaders, tmdbUrl } from './tmdb'
import { trendingScore, upcomingScore } from './scoring'
import { currentWindow } from './cache'

import type { MediaType, DiscoveryItem, DiscoveryList, UpcomingList } from './types'
import type { DiscoverMovie, DiscoverSeries, TrendingResponse } from './tmdb'

export async function buildDiscoveryList(env: Env, type: MediaType, language: string): Promise<DiscoveryList | null> {
	const liveKey = `discover:${type}:${language}`
	const live = await env.STORE.get<DiscoveryList>(liveKey, 'json')

	if (live && live.timestamp === currentWindow()) {
		return live
	}

	const list = await fetchAndBuildList(env, type, language)

	if (list) {
		await env.STORE.put(liveKey, JSON.stringify(list))
	}

	return list
}

async function fetchAndBuildList(env: Env, type: MediaType, language: string): Promise<DiscoveryList | null> {
	const headers = tmdbHeaders(env.TMDB_API_KEY)

	const trendingUrl = type === 'movies'
		? tmdbUrl.trendingMovies
		: tmdbUrl.trendingSeries

	const [page1, page2] = await Promise.all([
		fetch(trendingUrl(1, language), { headers }),
		fetch(trendingUrl(2, language), { headers }),
	])

	if (! page1.ok || ! page2.ok) {
		Sentry.captureMessage(`TMDB trending request failed: page1=${page1.status} page2=${page2.status}`)

		return null
	}

	const [data1, data2] = await Promise.all([
		page1.json<TrendingResponse<DiscoverMovie | DiscoverSeries>>(),
		page2.json<TrendingResponse<DiscoverMovie | DiscoverSeries>>(),
	])

	const results = [...data1.results, ...data2.results]
		.filter((item, index, arr) => arr.findIndex((m) => m.id === item.id) === index)

	const items: DiscoveryItem[] = results.map((result, index) => ({
		id: result.id,
		type: type === 'movies' ? 'movie' : 'series',
		title: 'title' in result ? result.title : result.name,
		overview: result.overview,
		release_date: 'release_date' in result
			? result.release_date
			: result.first_air_date,
		popularity: result.popularity,
		vote_average: result.vote_average,
		vote_count: result.vote_count,
		score: trendingScore(result, index, results.length),
		poster_path: `https://image.tmdb.org/t/p/w342/${result.poster_path}`,
	}))

	items.sort((a, b) => b.score - a.score)

	return {
		timestamp: currentWindow(),
		popular: items,
	}
}

export async function buildUpcomingList(env: Env, type: MediaType, language: string): Promise<UpcomingList | null> {
	const liveKey = `upcoming:${type}:${language}`
	const live = await env.STORE.get<UpcomingList>(liveKey, 'json')

	if (live && live.timestamp === currentWindow()) {
		return live
	}

	const list = await fetchAndBuildUpcomingList(env, type, language)

	if (list) {
		await env.STORE.put(liveKey, JSON.stringify(list))
	}

	return list
}

async function fetchAndBuildUpcomingList(env: Env, type: MediaType, language: string): Promise<UpcomingList | null> {
	const headers = tmdbHeaders(env.TMDB_API_KEY)

	const now = new Date()
	const dateFrom = now.toISOString().slice(0, 10)
	const dateTo = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

	const upcomingUrl = type === 'movies'
		? (page: number, lang: string) => tmdbUrl.upcomingMovies(page, lang)
		: (page: number, lang: string) => tmdbUrl.upcomingSeries(page, lang, dateFrom, dateTo)

	const [page1, page2] = await Promise.all([
		fetch(upcomingUrl(1, language), { headers }),
		fetch(upcomingUrl(2, language), { headers }),
	])

	if (! page1.ok || ! page2.ok) {
		Sentry.captureMessage(`TMDB upcoming request failed: page1=${page1.status} page2=${page2.status}`)

		return null
	}

	const [data1, data2] = await Promise.all([
		page1.json<TrendingResponse<DiscoverMovie | DiscoverSeries>>(),
		page2.json<TrendingResponse<DiscoverMovie | DiscoverSeries>>(),
	])

	const results = [...data1.results, ...data2.results]
		.filter((item, index, arr) => arr.findIndex((m) => m.id === item.id) === index)

	const items: DiscoveryItem[] = results.map((result) => ({
		id: result.id,
		type: type === 'movies' ? 'movie' : 'series',
		title: 'title' in result ? result.title : result.name,
		overview: result.overview,
		release_date: 'release_date' in result
			? result.release_date
			: result.first_air_date,
		popularity: result.popularity,
		vote_average: result.vote_average,
		vote_count: result.vote_count,
		score: upcomingScore(result),
		poster_path: `https://image.tmdb.org/t/p/w342/${result.poster_path}`,
	}))

	// Sort soonest first; ties broken by popularity descending (score)
	items.sort((a, b) => a.release_date.localeCompare(b.release_date) || b.score - a.score)

	return {
		timestamp: currentWindow(),
		upcoming: items,
	}
}
