import type { AnimeSearchResult, AnimeDetail, DonghuaSearchResult, DonghuaDetail } from "../types.js";

const MAX_RESULTS = 8;

export function formatAnimeSearchResults(results: AnimeSearchResult[], keyword: string): string {
    if (results.length === 0) return `**No anime found for:** \`${keyword}\``;

    const lines = [
        `**Anime Search:** \`${keyword}\` (${results.length} results)`,
        ""
    ];

    for (const item of results.slice(0, MAX_RESULTS)) {
        const genres = item.genreList?.map((g) => g.title).join(", ") || "-";
        lines.push(`**${item.title}**`);
        lines.push(`> ${item.status} | Score: ${item.score || "-"} | ${genres}`);
        lines.push(`> ID: \`${item.animeId}\``);
        lines.push("");
    }

    if (results.length > MAX_RESULTS) {
        lines.push(`_...and ${results.length - MAX_RESULTS} more_`);
    }

    lines.push("Use `.anime-detail <id>` for info, `.anime-play <id> [episode]` to stream.");
    return lines.join("\n");
}

export function formatAnimeDetail(detail: AnimeDetail): string {
    const genres = detail.genres.join(", ") || "-";
    const episodeCount = detail.episodeList.length;
    const latestEps = detail.episodeList.slice(0, 5);

    const lines = [
        `**${detail.title}**`,
        `> Status: ${detail.status} | Score: ${detail.score || "-"}`,
        `> Genres: ${genres}`,
        `> Episodes: ${episodeCount}`,
        ""
    ];

    if (detail.synopsis) {
        const short = detail.synopsis.length > 200 ? `${detail.synopsis.slice(0, 200)}...` : detail.synopsis;
        lines.push(`> ${short}`);
        lines.push("");
    }

    if (latestEps.length > 0) {
        lines.push("**Latest Episodes:**");
        for (const ep of latestEps) {
            lines.push(`> \`${ep.episodeId}\` - ${ep.title}`);
        }
        lines.push("");
    }

    lines.push("Use `.anime-play <episodeId>` to stream an episode.");
    return lines.join("\n");
}

export function formatDonghuaSearchResults(results: DonghuaSearchResult[], keyword: string): string {
    if (results.length === 0) return `**No donghua found for:** \`${keyword}\``;

    const lines = [
        `**Donghua Search:** \`${keyword}\` (${results.length} results)`,
        ""
    ];

    for (const item of results.slice(0, MAX_RESULTS)) {
        lines.push(`**${item.title}**`);
        lines.push(`> ${item.status} | ${item.type} | ${item.sub}`);
        lines.push(`> Slug: \`${item.slug}\``);
        lines.push("");
    }

    if (results.length > MAX_RESULTS) {
        lines.push(`_...and ${results.length - MAX_RESULTS} more_`);
    }

    lines.push("Use `.donghua-detail <slug>` for info, `.donghua-play <slug> [episode]` to stream.");
    return lines.join("\n");
}

export function formatDonghuaDetail(detail: DonghuaDetail): string {
    const genres = detail.genres?.map((g) => g.name).join(", ") || "-";
    const episodeCount = detail.episodes_list?.length ?? 0;
    const latestEps = detail.episodes_list?.slice(0, 5) ?? [];

    const lines = [
        `**${detail.title}**`,
        detail.alter_title ? `> Alt: ${detail.alter_title}` : null,
        `> Status: ${detail.status} | Rating: ${detail.rating || "-"} | Type: ${detail.type}`,
        `> Genres: ${genres}`,
        `> Episodes: ${episodeCount}`,
        ""
    ].filter(Boolean) as string[];

    if (detail.synopsis) {
        const short = detail.synopsis.length > 200 ? `${detail.synopsis.slice(0, 200)}...` : detail.synopsis;
        lines.push(`> ${short}`);
        lines.push("");
    }

    if (latestEps.length > 0) {
        lines.push("**Latest Episodes:**");
        for (const ep of latestEps) {
            lines.push(`> \`${ep.slug}\` - ${ep.episode}`);
        }
        lines.push("");
    }

    lines.push("Use `.donghua-play <episodeSlug>` to stream an episode.");
    return lines.join("\n");
}
