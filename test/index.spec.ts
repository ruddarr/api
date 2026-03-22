import { SELF, fetchMock } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DiscoverMovie, DiscoverSeries } from '../src/tmdb';

const TMDB_ORIGIN = 'https://api.themoviedb.org';

function mockDiscoverMovies(language: string, page1: DiscoverMovie[], page2: DiscoverMovie[]): void {
	fetchMock.get(TMDB_ORIGIN)
		.intercept({
			method: 'GET',
			path: (path) => path.startsWith('/3/trending/movie/week'),
		})
		.reply((opts) => {
			const url = new URL(opts.path, opts.origin);
			const page = url.searchParams.get('page');
			const requestedLanguage = url.searchParams.get('language');

			if (requestedLanguage !== language) {
				return { statusCode: 400, data: { message: 'Unexpected language' } };
			}

			const results = page === '1' ? page1 : page === '2' ? page2 : [];
			return {
				statusCode: 200,
				data: {
					page: Number(page ?? '1'),
					results,
					total_pages: 2,
					total_results: page1.length + page2.length,
				},
			};
		})
		.times(2);
}

function mockUpcomingSeries(language: string, page1: DiscoverSeries[], page2: DiscoverSeries[]): void {
	fetchMock.get(TMDB_ORIGIN)
		.intercept({
			method: 'GET',
			path: (path) => path.startsWith('/3/discover/tv'),
		})
		.reply((opts) => {
			const url = new URL(opts.path, opts.origin);
			const page = url.searchParams.get('page');
			const requestedLanguage = url.searchParams.get('language');

			if (requestedLanguage !== language) {
				return { statusCode: 400, data: { message: 'Unexpected language' } };
			}

			const results = page === '1' ? page1 : page === '2' ? page2 : [];
			return {
				statusCode: 200,
				data: {
					page: Number(page ?? '1'),
					results,
					total_pages: 2,
					total_results: page1.length + page2.length,
				},
			};
		})
		.times(2);
}

function movie(id: number, posterPath: string | null): DiscoverMovie {
	return {
		adult: false,
		backdrop_path: null,
		genre_ids: [],
		id,
		original_language: 'en',
		original_title: `Movie ${id}`,
		overview: `Overview ${id}`,
		popularity: 100 + id,
		poster_path: posterPath,
		release_date: '2026-04-01',
		title: `Movie ${id}`,
		video: false,
		vote_average: 7.5,
		vote_count: 1000,
	};
}

function series(id: number, posterPath: string | null): DiscoverSeries {
	return {
		adult: false,
		backdrop_path: null,
		genre_ids: [],
		id,
		origin_country: ['US'],
		original_language: 'en',
		original_name: `Series ${id}`,
		overview: `Overview ${id}`,
		popularity: 100 + id,
		poster_path: posterPath,
		first_air_date: '2026-04-01',
		name: `Series ${id}`,
		vote_average: 7.5,
		vote_count: 1000,
	};
}

describe('poster normalization', () => {
	beforeEach(() => {
		fetchMock.activate();
		fetchMock.disableNetConnect();
	});

	afterEach(() => {
		fetchMock.assertNoPendingInterceptors();
		fetchMock.deactivate();
	});

	it('normalizes discover movie posters and maps null-like values to null', async () => {
		const language = 'en-US';

		mockDiscoverMovies(language, [
			movie(1, '/leading.jpg'),
			movie(2, 'no-leading.jpg'),
			movie(3, null),
			movie(4, ' null '),
			movie(5, 'https://image.tmdb.org/t/p/w342//already-absolute.jpg'),
		], []);

		const response = await SELF.fetch(`https://example.com/discover/movies?language=${language}`);
		expect(response.status).toBe(200);

		const body = await response.json<{
			popular: Array<{ id: number; poster_path: string | null }>;
		}>();
		const byId = new Map(body.popular.map((item) => [item.id, item.poster_path]));

		expect(byId.get(1)).toBe('https://image.tmdb.org/t/p/w342/leading.jpg');
		expect(byId.get(2)).toBe('https://image.tmdb.org/t/p/w342/no-leading.jpg');
		expect(byId.get(3)).toBeNull();
		expect(byId.get(4)).toBeNull();
		expect(byId.get(5)).toBe('https://image.tmdb.org/t/p/w342/already-absolute.jpg');
	});

	it('normalizes upcoming series posters and preserves non-TMDB absolute URLs', async () => {
		const language = 'fr-FR';

		mockUpcomingSeries(language, [
			series(101, '/series-leading.jpg'),
			series(102, '//image.tmdb.org/t/p/w342//series-protocol-relative.jpg'),
			series(103, 'https://image.tmdb.org/t/p/w342//series-absolute.jpg'),
			series(104, 'https://cdn.example.com/poster.jpg'),
			series(105, 'NULL'),
			series(106, '/null'),
		], []);

		const response = await SELF.fetch(`https://example.com/upcoming/series?language=${language}&region=US`);
		expect(response.status).toBe(200);

		const body = await response.json<{
			upcoming: Array<{ id: number; poster_path: string | null }>;
		}>();
		const byId = new Map(body.upcoming.map((item) => [item.id, item.poster_path]));

		expect(byId.get(101)).toBe('https://image.tmdb.org/t/p/w342/series-leading.jpg');
		expect(byId.get(102)).toBe('https://image.tmdb.org/t/p/w342/series-protocol-relative.jpg');
		expect(byId.get(103)).toBe('https://image.tmdb.org/t/p/w342/series-absolute.jpg');
		expect(byId.get(104)).toBe('https://cdn.example.com/poster.jpg');
		expect(byId.get(105)).toBeNull();
		expect(byId.get(106)).toBeNull();
	});
});
