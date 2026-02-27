import type {
    AnimeSearchResult,
    AnimeDetail,
    AnimeEpisode,
    AnimeServerResult,
    DonghuaSearchResult,
    DonghuaDetail,
    DonghuaEpisode
} from "../types.js";
import { logError, logInfo } from "../utils/logger.js";

const API_BASE = "https://www.sankavollerei.com/anime";
const REQUEST_TIMEOUT_MS = 15_000;

type ApiResponse<T> = {
    status: string;
    statusCode?: number;
    ok?: boolean;
    data: T;
    pagination?: unknown;
};

async function apiFetch<T>(path: string): Promise<T | undefined> {
    const url = `${API_BASE}${path}`;
    logInfo(`Anime API request: ${url}`);
    try {
        const response = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        if (!response.ok) return undefined;
        const json = await response.json() as ApiResponse<T>;
        if (json.ok === false || json.statusCode === 404) return undefined;
        return json.data ?? (json as unknown as T);
    } catch (error) {
        logError(`Anime API error: ${path}`, error);
        return undefined;
    }
}

// --- Anime (Otakudesu) ---

export async function searchAnime(keyword: string): Promise<AnimeSearchResult[]> {
    const data = await apiFetch<{ animeList: AnimeSearchResult[] }>(`/search/${encodeURIComponent(keyword)}`);
    return data?.animeList ?? [];
}

export async function getAnimeDetail(slug: string): Promise<AnimeDetail | undefined> {
    type RawDetail = {
        title: string;
        poster: string;
        status: string;
        score: string;
        synopsis: string;
        genreList?: Array<{ title: string; genreId: string; href: string }>;
        episodeList?: Array<{ title: string; episodeId: string; href: string }>;
    };
    const data = await apiFetch<RawDetail>(`/anime/${encodeURIComponent(slug)}`);
    if (!data) return undefined;
    return {
        title: data.title,
        poster: data.poster,
        status: data.status,
        score: data.score,
        synopsis: data.synopsis ?? "",
        genres: data.genreList?.map((g) => g.title) ?? [],
        episodeList: data.episodeList ?? []
    };
}

export async function getAnimeEpisode(slug: string): Promise<AnimeEpisode | undefined> {
    return apiFetch<AnimeEpisode>(`/episode/${encodeURIComponent(slug)}`);
}

export async function getAnimeServerUrl(serverId: string): Promise<string | undefined> {
    const data = await apiFetch<AnimeServerResult>(`/server/${encodeURIComponent(serverId)}`);
    return data?.url;
}

function pickBestServer(episode: AnimeEpisode): string | undefined {
    const qualities = episode.server?.qualities ?? [];
    const preferred = ["720p", "480p", "360p", "1080p"];
    for (const pref of preferred) {
        const quality = qualities.find((q) => q.title.includes(pref));
        const server = quality?.serverList?.[0];
        if (server) return server.serverId;
    }
    for (const quality of qualities) {
        if (quality.serverList.length > 0) return quality.serverList[0].serverId;
    }
    return undefined;
}

export async function resolveAnimeStreamUrl(episodeSlug: string): Promise<{ url: string; title: string } | undefined> {
    const episode = await getAnimeEpisode(episodeSlug);
    if (!episode) return undefined;

    if (episode.defaultStreamingUrl) {
        return { url: episode.defaultStreamingUrl, title: episode.title };
    }

    const serverId = pickBestServer(episode);
    if (!serverId) return undefined;

    const serverUrl = await getAnimeServerUrl(serverId);
    if (!serverUrl) return undefined;
    return { url: serverUrl, title: episode.title };
}

// --- Donghua ---

export async function searchDonghua(keyword: string): Promise<DonghuaSearchResult[]> {
    type RawResponse = DonghuaSearchResult[];
    const data = await apiFetch<RawResponse>(`/donghua/search/${encodeURIComponent(keyword)}`);
    return data ?? [];
}

export async function getDonghuaDetail(slug: string): Promise<DonghuaDetail | undefined> {
    const url = `/donghua/detail/${encodeURIComponent(slug)}`;
    const fullUrl = `${API_BASE}${url}`;
    logInfo(`Anime API request: ${fullUrl}`);
    try {
        const response = await fetch(fullUrl, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        if (!response.ok) return undefined;
        const json = await response.json() as DonghuaDetail;
        if (!json.title) return undefined;
        return json;
    } catch (error) {
        logError(`Anime API error: ${url}`, error);
        return undefined;
    }
}

export async function getDonghuaEpisode(slug: string): Promise<DonghuaEpisode | undefined> {
    const url = `/donghua/episode/${encodeURIComponent(slug)}`;
    const fullUrl = `${API_BASE}${url}`;
    logInfo(`Anime API request: ${fullUrl}`);
    try {
        const response = await fetch(fullUrl, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        if (!response.ok) return undefined;
        const json = await response.json() as Record<string, unknown>;
        if (json.error || json.status === "error") return undefined;
        return json as unknown as DonghuaEpisode;
    } catch (error) {
        logError(`Anime API error: ${url}`, error);
        return undefined;
    }
}

export async function resolveDonghuaStreamUrl(episodeSlug: string): Promise<{ url: string; title: string } | undefined> {
    const episode = await getDonghuaEpisode(episodeSlug);
    if (!episode) return undefined;

    const url = episode.defaultStreamingUrl || episode.streamUrl;
    if (url) return { url, title: episode.title ?? episodeSlug };

    return undefined;
}
