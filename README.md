# spotify-lyrics-js
Spotify lyrics fetcher using pureJS

## How it works
Use puppeteer to get access token for fetching lyrics from Spotify
and fetch the lyrics using that token

```js
var fetcher = new LyricsFetcher(<FetcherOptions>);
fetcher.fetch(<SpotifyTrack>): Promise(<LyricsResult>)

<FetcherOptions: Object> = {
  <clientId: String> = Client id of Spotify api application
  <clientSecret: String> = Client secret of Spotify api application
  <authJsonPath: String> = File path to store Spotify auth token (ex auth.json)
  <cookieJsonPath: String> = File path to store Spotify account cookie (ex cookie.json)
}
type <SpotifyTrack: String> = Spotify track ID or URL
type <LyricsResult: Object> = Lyrics of given track
```

Used dependencies: axios puppeteer node-spotify-api
