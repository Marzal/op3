import { importText } from '../deps.ts';
import { computeCloudflareAnalyticsSnippet } from './html.ts';
import { computeHtml } from './html.ts';
import { computeNonProdHeader } from './instances.ts';
import { newMethodNotAllowedResponse, newRssResponse } from '../responses.ts';
import { FeedItem, computeBasicHtml, computeRss, tryParseFeedRequest } from './feed.ts';
const releasesHtm = await importText(import.meta.url, '../static/releases.htm');
const outputCss = await importText(import.meta.url, '../static/output.css');

export function tryParseReleasesRequest(opts: { method: string, pathname: string, headers: Headers}): ReleasesRequest | undefined {
    return tryParseFeedRequest({ ...opts, expectedPath: 'releases' });
}

export function computeReleasesResponse({ method, type } : ReleasesRequest, { instance, origin, productionOrigin, cfAnalyticsToken }: { instance: string, origin: string, productionOrigin: string, cfAnalyticsToken: string | undefined }): Response {
    if (method !== 'GET') return newMethodNotAllowedResponse(method);

    const titleSuffix = instance === 'prod' ? '' : ` (${instance})`;
    const title = `Releases · OP3${titleSuffix}: The Open Podcast Prefix Project`;
    const description = `Latest releases from OP3, the Open Podcast Prefix Project`;
    const items = RELEASES;

    if (type === 'rss') return newRssResponse(computeRss({ items, title, description, origin, pathname: '/releases' }));

    const html = computeHtml(releasesHtm, {
        title,
        styleTag: `<style>\n${outputCss}\n</style>`,
        nonProdHeader: computeNonProdHeader(instance, productionOrigin),
        cfAnalyticsSnippet: computeCloudflareAnalyticsSnippet(cfAnalyticsToken),
        basicHtml: computeBasicHtml({ items, origin }),
        origin,
    });

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8'} });
}

//

export interface ReleasesRequest {
    readonly method: string;
    readonly type: 'html' | 'rss';
}

//

const RELEASES: FeedItem[] = [
    {
        id: '2023-02-26',
        time: '2023-02-26T21:28:39.191Z',
        title: '2023-02-26: Show stats pages + new API calls for show downloads and other queries',
        bulletPoints: [
            ({ origin }) => `All OP3 stats pages are available at the conventional url: ${origin}/show/<show-uuid-or-podcast-guid>`,
            ({ origin }) => `New API call to [query downloads](${origin}/api/docs#tag/downloads/operation/queryShowDownloads) for a given show.`,
            ({ origin }) => `New API call to [view basic show information](${origin}/api/docs#tag/shows/operation/viewShowInformation) such as title and episode metadata.`,
            ({ origin }) => `New API call to [find recent episodes with transcripts](${origin}/api/docs#tag/queries/operation/queryRecentEpisodesWithTranscripts).`,
            ({ origin }) => `New API call to [find the top apps for a given show](${origin}/api/docs#tag/queries/operation/queryTopAppsForShow).`,
        ]
    },
    {
        id: '2023-01-12',
        time: '2023-01-12T15:40:00.000Z',
        title: '2023-01-12: Download calculation page',
        bulletPoints: [
            ({ origin }) => `Published a new page explaining [how OP3 calculates Downloads](${origin}/download-calculation).`,
            () => `Show-level stats pages link to this page for reference.`,
        ]
    },
    {
        id: '2022-12-29',
        time: '2022-12-29T21:00:00.000Z',
        title: '2022-12-29: Preview links to OP3 show stats pages',
        bulletPoints: [
            () => `Made an early version of the show-level stats page available to podcasters running the OP3 prefix, primarily to verify the Downloads calculation.`,
            ({ origin }) => `Podcasters going through the [Setup page](${origin}/setup) will now see instructions on how to request access to their stats page.`,
            () => `The underlying OP3 Downloads API is not public yet, but will be part of an upcoming public release.`,
        ]
    },
    {
        id: '2022-10-20',
        time: '2022-10-20T21:40:00.000Z',
        title: '2022-10-20: Saving more request attributes, updated Privacy Policy',
        bulletPoints: [
            () => `Saving more non-listener-identifying fields on each request, after arriving at a consensus in a [project disussion](https://github.com/skymethod/op3/discussions/7).`,
            ({ origin }) => `Updated the [Privacy Policy](${origin}/privacy) detailing the new fields captured: Country, Continent, Region, Timezone, Metro, ASN.`,
        ]
    },
    {
        id: '2022-10-18',
        time: '2022-10-18T22:27:00.000Z',
        title: '2022-10-18: New Setup page, API keys, optional prefix arguments',
        bulletPoints: [
            ({ origin }) => `Published a new [Setup page](${origin}/setup) with instructions, examples, and an easy-to-use feed checker to sanity-check your OP3 setup.`,
            ({ origin }) => `Introduced proper [API key management](${origin}/api/keys). Existing API users should switch over to these more stable credentials instead of hardcoding the shared preview tokens.`,
            ({ origin }) => `Introduced a way to pass optional arguments in the prefix url using comma-delimited name=value pairs. Can be used to pass your Podcast Guid as part of the redirect (see [Examples](${origin}/setup#examples)).`,
        ]
    },
    {
        id: '2022-09-24',
        time: '2022-09-24T20:21:00.000Z',
        title: '2022-09-24: Request URL "starts with" queries',
        bulletPoints: [
            ({ origin }) => `The existing [Query Redirect Logs](${origin}/api/docs#tag/redirect-logs/operation/queryRedirectLogs) \`url\` parameter now supports trailing wildcards. Can be used for simple "episode URL starts with" queries before proper show rollup logic is in place.`,
            ({ origin }) => `Added documention about the sort order of the [Query Redirect Logs](${origin}/api/docs#tag/redirect-logs/operation/queryRedirectLogs) results.`,
        ]
    },
    {
        id: '2022-09-15',
        time: '2022-09-15T23:33:00.000Z',
        title: '2022-09-15: Initial launch! Prefix redirect and Data API preview',
        bulletPoints: [
            ({ origin }) => `New podcast episode prefix service: ${origin}/e/ ready to use - safely and securely stores basic episode request attributes.`,
            ({ origin }) => `New API and associated [API Documentation](${origin}/api/docs) providing open access to low-level episode data, as a preview of what's to come.`,
            () => `Existing podcasters can contribute real data to this project by adding the prefix to the episode urls in their podcast RSS feed.`,
        ]
    },
];
