import { ApiShowsResponse, ApiShowStatsResponse } from '../worker/routes/api_shows_model.ts';
import { makeDownloadsGraph } from './downloads_graph.ts';
import { element } from './elements.ts';
import { makeExportDownloads } from './export_downloads.ts';
import { makeHeadlineStats } from './headline_stats.ts';

// provided server-side
declare const initialData: { showObj: ApiShowsResponse, statsObj: ApiShowStatsResponse, times: Record<string, number> };
declare const previewToken: string;

const app = (() => {

    const [ debugDiv ] = [
        element('debug'),
    ];

    const { showObj, statsObj, times } = initialData;
    const { showUuid } = showObj;
    if (typeof showUuid !== 'string') throw new Error(`Bad showUuid: ${JSON.stringify(showUuid)}`);

    const { episodeFirstHours, hourlyDownloads, dailyFoundAudience } = statsObj;
    const hourMarkers = Object.fromEntries(Object.entries(episodeFirstHours).map(([ episodeId, hour ]) => [ hour, episodeId ]));

    const headlineStats = makeHeadlineStats({ hourlyDownloads, dailyFoundAudience });

    makeDownloadsGraph({ hourlyDownloads, hourMarkers });

    const exportDownloads = makeExportDownloads({ showUuid, previewToken });
    
    debugDiv.textContent = Object.entries(times).map(v => v.join(': ')).join('\n')
    console.log(initialData);

    function update() {
        exportDownloads.update();
        headlineStats.update();
    }

    return { update };
})();

globalThis.addEventListener('DOMContentLoaded', () => {
    console.log('Document content loaded');
    app.update();
});
