import {
	readFileSync,
	writeFileSync
} from 'node:fs';
import YAML from 'yaml';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { EventEmitter } from 'node:events';
import { execSync } from 'node:child_process';

Buffer.prototype.decodeJSON = function(){
	return JSON.parse(this.toString());
};

Object.prototype.encodeJSON = function(){
	return JSON.stringify(this, null, '\t');
};

class JsonDB {
	constructor(path){
		this.data = {};
		this.path = path;
	}
	load(){
		this.data = readFileSync(this.path).decodeJSON();
	}
	save(){
		writeFileSync(this.path, this.data.encodeJSON());
	}
}

class ErrorLimitter {
	constructor(limit, interval){
		this.errors = [];
		this.limit = limit;
		this.interval = interval;
		this.output = new EventEmitter();
	}
	tick(err){
		var now = Date.now();
		if(now - this.errors[0]?.ts < this.interval && this.errors.length > this.limit){
			this.output.emit("exceed", this.errors);
			this.errors = [];
		}else{
			this.errors.push({
				ts: now,
				...err
			});
		}
	}
}

class LyricsExtractor {
    constructor(){
        this.token = null;
        this.expires = null;
    }
    async _resetToken(){
        var browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-gpu',
                '--disable-setuid-sandbox'
            ]
        });
        var page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        try {
            var befCookies = JSON.parse(readFileSync('cookies.json'));
            await page.setCookie(...befCookies);
        }catch(err){
            console.log('[Extractor] ENOENT: cookies.json');
        }
        await page.setRequestInterception(true);
        page.on('request', (req) => req.continue());
        page.on("response", async (res) => {
            if(res.request().method() !== 'GET') return false;
            if(res.url().includes('get_access_token')){
                var body = await res.json();
                this.token = body.accessToken;
                this.expires = body.accessTokenExpirationTimestampMs;
                var auth = {
                    token: this.token,
                    expires: this.expires
                };
                writeFileSync('spotify.json', JSON.stringify(auth, null, '\t'));
                console.log('[Extractor] Refreshed token');
            }
        });
        await page.goto(`https://open.spotify.com/track/3GDrQUjCYUnBL26fG5BGkA`, {
            waitUntil: "networkidle0",
            timeout: 60_000
        });
        await page.waitForNetworkIdle();
        console.log('[Extractor] Token refreshing touched down.');
        await browser.close();
    }
    fetch(track){
        var id = track.identifier;
        var image = track.artworkUrl;
        //id = identifier, image = artworkUrl
        return new Promise(async (s, j) => {
            try {
                var auth = JSON.parse(readFileSync('spotify.json'));
                this.token = auth.token;
                this.expires = auth.expires;
            }catch(err){
                console.log('[Extractor] ENOENT: spotify.json');
                this.token = null;
                this.expires = 0;
            }
            if(Date.now() >= this.expires){
                console.log('[Extractor] Token is expired. refreshing');
                await this._resetToken();
            }
            console.log('[Extractor] Fetching', id);
            image = encodeURIComponent(image);
            if(image == 'undefined' || image == 'null'){
                j('Not Found');
                return false;
            }
            var endpoint = 'https://spclient.wg.spotify.com/color-lyrics/v2/track';
            var params = new URLSearchParams({
                format: 'json',
                vocalRemoval: false,
                market: 'from_token'
            }).toString();
            var { data } = await axios({
                url: `${endpoint}/${id}/image/${image}?${params}`,
                method: 'GET',
                headers: {
                    'App-Platform': 'WebPlayer',
                    'Authorization': `Bearer ${this.token}`
                }
            }).catch(j);
            console.log('[Extractor] Fetched', id);
            s(data);
        });
    }
}

class VersionManager {
    constructor(){
        this.status = 'online';
        this.path = 'lvk/application.yml';
    }
    getVersion(){
        var ymlStr = readFileSync(this.path, 'utf8');
        var ymlObj = YAML.parse(ymlStr);
        var depObj = ymlObj.lavalink.plugins[0];
        var verIdx = depObj.dependency.lastIndexOf(':');
        return {
            version: depObj.dependency.slice(verIdx+1),
            snapshot: depObj.snapshot
        };
    }
    setVersion(o){
        var ymlStr = readFileSync(this.path, 'utf8');
        var ymlObj = YAML.parse(ymlStr);
        var verStr = `dev.lavalink.youtube:youtube-plugin:${o.version}`;
        ymlObj.lavalink.plugins[0].dependency = verStr;
        ymlObj.lavalink.plugins[0].snapshot = o.snapshot;
        writeFileSync(this.path, YAML.stringify(ymlObj));
    }
}

class PM2 {
    constructor(){
        this.status = 'online';
    }
    exec(pn){
        execSync(`pm2 flush ${pn} && pm2 restart ${pn} && pm2 reset ${pn}`);
    }
}

export { JsonDB, ErrorLimitter, LyricsExtractor, VersionManager, PM2 };
