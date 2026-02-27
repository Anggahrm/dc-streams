import type {
    AnimeSearchResult,
    AnimeDetail,
    AnimeEpisode,
    AnimeDownloadQuality,
    AnimeStreamResult,
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

// --- Anime (Samehadaku) ---

export async function searchAnime(keyword: string): Promise<AnimeSearchResult[]> {
    const data = await apiFetch<{ animeList: AnimeSearchResult[] }>(`/samehadaku/search?q=${encodeURIComponent(keyword)}`);
    return data?.animeList ?? [];
}

export async function getAnimeDetail(slug: string): Promise<AnimeDetail | undefined> {
    type RawDetail = {
        title?: string;
        poster: string;
        status: string;
        english?: string;
        score?: string | { value?: string };
        synopsis?: string | { paragraphs?: string[] };
        genreList?: Array<{ title: string; genreId: string; href: string }>;
        episodeList?: Array<{ title: string | number; episodeId: string; href: string }>;
    };
    const data = await apiFetch<RawDetail>(`/samehadaku/anime/${encodeURIComponent(slug)}`);
    if (!data) return undefined;

    const score = typeof data.score === "string" ? data.score : (data.score?.value ?? "");
    const synopsis = typeof data.synopsis === "string"
        ? data.synopsis
        : (data.synopsis?.paragraphs ?? []).join("\n\n");

    return {
        title: data.title || data.english || slug,
        poster: data.poster,
        status: data.status,
        score,
        synopsis,
        genres: data.genreList?.map((g) => g.title) ?? [],
        episodeList: (data.episodeList ?? []).map((ep) => ({
            ...ep,
            title: String(ep.title)
        }))
    };
}

export async function getAnimeEpisode(slug: string): Promise<AnimeEpisode | undefined> {
    return apiFetch<AnimeEpisode>(`/samehadaku/episode/${encodeURIComponent(slug)}`);
}

const PIXELDRAIN_PAGE_RE = /pixeldrain\.com\/u\/([A-Za-z0-9]+)/;

function toPixeldrainDirectUrl(pageUrl: string): string | undefined {
    const match = PIXELDRAIN_PAGE_RE.exec(pageUrl);
    if (!match) return undefined;
    return `https://pixeldrain.com/api/file/${match[1]}`;
}

function isPixeldrainSource(title: string): boolean {
    return title.trim().toLowerCase() === "pixeldrain";
}

function pickBestDownloadUrl(episode: AnimeEpisode): string | undefined {
    const formats = episode.downloadUrl?.formats;
    if (!formats?.length) return undefined;

    const allQualities: AnimeDownloadQuality[] = formats.flatMap((f) => f.qualities);
    const preferred = ["720p", "480p", "360p", "1080p"];

    for (const pref of preferred) {
        const quality = allQualities.find((q) => q.title.includes(pref));
        if (!quality) continue;
        const pd = quality.urls.find((u) => isPixeldrainSource(u.title));
        if (pd) {
            const direct = toPixeldrainDirectUrl(pd.url);
            if (direct) return direct;
        }
    }

    for (const quality of allQualities) {
        const pd = quality.urls.find((u) => isPixeldrainSource(u.title));
        if (pd) {
            const direct = toPixeldrainDirectUrl(pd.url);
            if (direct) return direct;
        }
    }

    return undefined;
}

// --- Server-based fallback ---

type AnimeServerResponse = { url: string };

async function getAnimeServerUrl(serverId: string): Promise<string | undefined> {
    const data = await apiFetch<AnimeServerResponse>(`/samehadaku/server/${encodeURIComponent(serverId)}`);
    return data?.url;
}

const KRAKENFILES_SOURCE_RE = /<source\s+src="([^"]+)"/;
const KRAKENCLOUD_HOST_RE = /krakencloud\.net/;

async function resolveKrakenfilesDirectUrl(embedUrl: string): Promise<string | undefined> {
    try {
        const response = await fetch(embedUrl, {
            headers: { Accept: "text/html" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        if (!response.ok) return undefined;
        const html = await response.text();
        const match = KRAKENFILES_SOURCE_RE.exec(html);
        return match?.[1];
    } catch (error) {
        logError(`Krakenfiles embed fetch error: ${embedUrl}`, error);
        return undefined;
    }
}

function isKrakenfilesServer(title: string): boolean {
    return title.trim().toLowerCase().includes("krakenfiles");
}

async function tryKrakenfilesServers(episode: AnimeEpisode): Promise<AnimeStreamResult | undefined> {
    for (const quality of episode.server?.qualities ?? []) {
        for (const server of quality.serverList) {
            if (!isKrakenfilesServer(server.title)) continue;

            logInfo(`Trying Krakenfiles server: ${server.title} (${server.serverId})`);
            const embedUrl = await getAnimeServerUrl(server.serverId);
            if (!embedUrl) continue;

            const directUrl = await resolveKrakenfilesDirectUrl(embedUrl);
            if (!directUrl) continue;

            logInfo(`Resolved anime stream via Krakenfiles: ${directUrl}`);
            return {
                url: directUrl,
                title: episode.title,
                inputOptions: KRAKENCLOUD_HOST_RE.test(directUrl) ? ["-user_agent", "curl/8.5.0"] : undefined
            };
        }
    }
    return undefined;
}

async function tryPixeldrainServers(episode: AnimeEpisode): Promise<AnimeStreamResult | undefined> {
    for (const quality of episode.server?.qualities ?? []) {
        for (const server of quality.serverList) {
            if (!isPixeldrainSource(server.title)) continue;

            logInfo(`Trying Pixeldrain server: ${server.title} (${server.serverId})`);
            const pageUrl = await getAnimeServerUrl(server.serverId);
            if (!pageUrl) continue;

            const directUrl = toPixeldrainDirectUrl(pageUrl);
            if (!directUrl) continue;

            logInfo(`Resolved anime stream via Pixeldrain server: ${directUrl}`);
            return { url: directUrl, title: episode.title };
        }
    }
    return undefined;
}

export async function resolveAnimeStreamUrl(episodeSlug: string): Promise<AnimeStreamResult | undefined> {
    const episode = await getAnimeEpisode(episodeSlug);
    if (!episode) return undefined;

    // 1. Pixeldrain download links (existing, fastest)
    const directUrl = pickBestDownloadUrl(episode);
    if (directUrl) {
        logInfo(`Resolved anime stream via Pixeldrain download: ${directUrl}`);
        return { url: directUrl, title: episode.title };
    }

    // 2. Krakenfiles server (HTML scrape + UA workaround)
    const krakenResult = await tryKrakenfilesServers(episode);
    if (krakenResult) return krakenResult;

    // 3. Pixeldrain server (may be expired, but worth trying)
    const pdServerResult = await tryPixeldrainServers(episode);
    if (pdServerResult) return pdServerResult;

    logInfo("No playable stream URL found for episode after all fallbacks");
    return undefined;
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

const ANICHIN_STREAM_ID_RE = /anichin\.stream\/?\?id=([A-Za-z0-9]+)/;

function toAnichinHlsUrl(pageUrl: string): string | undefined {
    const match = ANICHIN_STREAM_ID_RE.exec(pageUrl);
    if (!match) return undefined;
    return `https://anichin.stream/hls/${match[1]}.m3u8`;
}

export async function resolveDonghuaStreamUrl(episodeSlug: string): Promise<{ url: string; title: string } | undefined> {
    const episode = await getDonghuaEpisode(episodeSlug);
    if (!episode) return undefined;

    const title = episode.donghua_details?.title ?? episode.episode ?? episodeSlug;

    const mainUrl = episode.streaming?.main_url?.url;
    if (mainUrl) {
        const hlsUrl = toAnichinHlsUrl(mainUrl);
        if (hlsUrl) {
            logInfo(`Resolved donghua stream via anichin HLS: ${hlsUrl}`);
            return { url: hlsUrl, title };
        }
    }

    for (const server of episode.streaming?.servers ?? []) {
        const hlsUrl = toAnichinHlsUrl(server.url);
        if (hlsUrl) {
            logInfo(`Resolved donghua stream via anichin HLS (server ${server.name}): ${hlsUrl}`);
            return { url: hlsUrl, title };
        }
    }

    logInfo("No anichin HLS URL found for donghua episode, no fallback available");
    return undefined;
}
