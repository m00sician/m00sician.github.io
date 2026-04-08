exports.handler = async (event) => {
  const CLIENT_ID = process.env.IGDB_CLIENT_ID;
  const CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API credentials not configured' }) };
  }

  try {
    // 1. Twitch OAuth Token holen
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST' }
    );
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token fetch failed', detail: tokenData }) };
    }

    // 2. Query-Parameter aus der Anfrage lesen
    const params = event.queryStringParameters || {};
    const platform = params.platform || null;   // IGDB Platform ID
    const sort = params.sort || 'first_release_date desc';
    const page = parseInt(params.page || '0');
    const limit = 20;
    const offset = page * limit;

    // Datumsbereich: letzte 6 Monate bis heute
    const now = Math.floor(Date.now() / 1000);
    const sixMonthsAgo = now - (60 * 60 * 24 * 180);

    // Platform-Filter aufbauen
    let platformFilter = '';
    if (platform && platform !== 'all') {
      platformFilter = `& platforms = (${platform})`;
    }

    const query = `
      fields name, cover.url, first_release_date, genres.name, rating, platforms.name, platforms.slug, summary;
      where first_release_date >= ${sixMonthsAgo} & first_release_date <= ${now} & cover != null ${platformFilter};
      sort ${sort};
      limit ${limit};
      offset ${offset};
    `;

    // 3. IGDB API aufrufen
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
      return { statusCode: igdbRes.status, headers, body: JSON.stringify({ error: 'IGDB error', detail: errText }) };
    }

    const games = await igdbRes.json();

    // Cover-URLs auf HTTPS + größeres Format umschreiben
    const processed = games.map(g => ({
      ...g,
      cover: g.cover ? {
        url: g.cover.url
          .replace('//images.igdb.com', 'https://images.igdb.com')
          .replace('t_thumb', 't_cover_big')
      } : null,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ results: processed, hasMore: games.length === limit }),
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
