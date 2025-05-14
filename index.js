// spotify-lyrics-js by kyky775 @ ver.25.05.14

import {
    readFileSync,
    writeFileSync
} from 'node:fs';
import axios from 'axios';
import puppeteer from 'puppeteer';
import Spotify from 'node-spotify-api';
import { EventEmitter } from 'node:events';

class LyricsFetcher {
    constructor(options){
        this.token = null;
        this.expires = null;
        this.authJsonPath = options.authJsonPath;
        this.cookieJsonPath = options.cookieJsonPath;
        this.client = new Spotify({
            id: options.clientId,
            secret: options.clientSecret
        });
    }
    async refreshToken(){
        var browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-gpu',
                '--disable-setuid-sandbox'
            ]
        });
        var page = await browser.newPage();
        await page.setViewport({ width: 640, height: 360 });
        try {
            var cookies = JSON.parse(readFileSync(this.cookieJsonPath));
            await page.setCookie(...cookies);
            console.log(`[JSON] Imported ${cookies.length} cookies`);
        }catch(err){
            console.log(`[JSON] Cannot found cookies from ${this.cookieJsonPath}`);
            console.log(`[JSON] Please import all cookies from Spotify web player`);
            console.log(`[JSON] and save to ${this.cookieJsonPath}`);
            process.exit(0);
            return false;
        }
        await page.setRequestInterception(true);
        page.on('request', (req) => req.continue());
        page.on("response", async (res) => {
            if(res.request().method() !== 'GET') return false;
            if(res.url().includes('get_access_token')){
                console.log('[Auth] Received new token');
                var body = await res.json();
                this.token = body.accessToken;
                this.expires = body.accessTokenExpirationTimestampMs;
                var auth = {
                    token: this.token,
                    expires: this.expires
                };
                writeFileSync(this.authJsonPath, JSON.stringify(auth, null, '\t'));
                console.log(`[JSON] New token has been saved to ${this.authJsonPath}`);
                console.log('[Auth] Refreshed token successfully');
            }
        });
        await page.goto(`https://open.spotify.com/track/3GDrQUjCYUnBL26fG5BGkA`, {
            waitUntil: "networkidle0",
            timeout: 60_000
        });
        await page.waitForNetworkIdle();
        console.log('[Auth] Token refresh session has been touched-down.');
        await browser.close();
    }
    async fetch(trackId){
        var track = await this.client.request(`https://api.spotify.com/v1/tracks/${trackId}`);
        var imageUrl = track.images[0].url;
        console.log(trackId, imageUrl);
        return new Promise(async (s, j) => {
            try {
                var auth = JSON.parse(readFileSync(this.authJsonPath));
                this.token = auth.token;
                this.expires = auth.expires;
            }catch(err){
                console.log(`[JSON] ENOENT: ${this.authJsonPath} - creating new one`);
                this.token = null;
                this.expires = 0;
            }
            if(Date.now() >= this.expires){
                console.log('[Auth] Token is expired. refreshing');
                await this.refreshToken();
            }
            console.log(`[Fetcher] Fetching spotify track (ID: ${trackId})`);
            imageUrl = encodeURIComponent(imageUrl);
            if(imageUrl == 'undefined' || imageUrl == 'null'){
                j(`[Fetcher] Cannot found track (ID: ${trackId})`);
                return false;
            }
            var endpoint = 'https://spclient.wg.spotify.com/color-lyrics/v2/track';
            var params = new URLSearchParams({
                format: 'json',
                vocalRemoval: false,
                market: 'from_token'
            }).toString();
            var { data } = await axios({
                url: `${endpoint}/${trackId}/image/${imageUrl}?${params}`,
                method: 'GET',
                headers: {
                    'App-Platform': 'WebPlayer',
                    'Authorization': `Bearer ${this.token}`
                }
            }).catch(j);
            console.log(`[Fetcher] Fetched lyrics successfully (ID: ${id})`);
            s(data);
        });
    }
}

export default LyricsFetcher;
