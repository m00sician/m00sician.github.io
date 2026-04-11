export default async function handler(req, res) {
  const CLIENT_ID = process.env.IGDB_CLIENT_ID;
  const CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'API credentials not configured' });
  }

  try {
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST' }
    );
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.status(401).json({ error: 'Token fetch failed', detail: tokenData });
    }

    const { platforms, mode = 'recent', page = '0' } = req.query;
    const limit = 20;
    const offset = parseInt(page) * limit;

    const now = Math.floor(Date.now() / 1000);
    const twoWeeksAgo = now - (60 * 60 * 24 * 14);
    const twelveMonthsAgo = now - (60 * 60 * 24 * 365);
    const oneYearAhead = now + (60 * 60 * 24 * 365);

    let dateFilter = '';
    let sortOrder = '';

    if (mode === 'recent') {
      dateFilter = `first_release_date >= ${twoWeeksAgo} & first_release_date <= ${now}`;
      sortOrder = 'first_release_date desc';
    } else if (mode === 'upcoming') {
      dateFilter = `first_release_date > ${now} & first_release_date <= ${oneYearAhead}`;
      sortOrder = 'first_release_date asc';
    } else if (mode === 'older') {
      dateFilter = `first_release_date >= ${twelveMonthsAgo} & first_release_date < ${twoWeeksAgo}`;
      sortOrder = 'first_release_date desc';
    }

    let platformFilter = '';
    if (platforms && platforms !== 'all') {
      platformFilter = `& platforms = (${platforms})`;
    }

    const WHITELIST = '1,8,26,29,37,51,66,70,110,112,129,139,224,248,280,305,374,423,445,458,517,634,743,748,818,1010,1012,1218,1260,1474,2248,2262,2450,2688,4133,4291,5040,5283,6071,9385,10075,10100,10549,11662,12186,12419,13189,13699,14035,14055,14952,15257,15299,15683,16337,16437,16565,18532,18629,19006,21313,23561,24060,26341,26367,27686,33986,35110,36172,36610,36975,37893,38271,41724,43813,45133,45898,47516,53109';

    const query = `
      fields name, cover.url, first_release_date, genres.name, platforms.name, platforms.slug, platforms.id, videos.video_id, summary, hypes, rating_count, involved_companies.developer, involved_companies.publisher, involved_companies.company.name, involved_companies.company.slug;
      where ${dateFilter} & cover != null & (hypes > 0 | total_rating_count > 5 | involved_companies.company = (${WHITELIST})) ${platformFilter};
      sort ${sortOrder};
      limit ${limit};
      offset ${offset};
    `;

    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'text/plain',
      },
      body: query,
    });

    if (!igdbRes.ok) {
      const errText = await igdbRes.text();
      return res.status(igdbRes.status).json({ error: 'IGDB error', detail: errText });
    }

    const games = await igdbRes.json();

    const processed = games.map(g => ({
      ...g,
      cover: g.cover ? {
        url: g.cover.url
          .replace('//images.igdb.com', 'https://images.igdb.com')
          .replace('t_thumb', 't_cover_big')
      } : null,
      trailerVideoId: g.videos?.[0]?.video_id || null,
    }));

    return res.status(200).json({ results: processed, hasMore: games.length === limit });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
